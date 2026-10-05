import { PrismaClient } from '@prisma/client';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { nlpService } from './sentiment/nlp.service';

/**
 * End-to-end checks against the real SQLite test database.
 *
 * These exercise the parts that unit tests cannot: that the pipeline finds rows
 * that actually exist, that the unique constraints make re-runs idempotent, and
 * that a factor with no input produces no score rather than a fabricated zero.
 *
 * Rows created here are inserted and removed inside the suite. No business data
 * is seeded anywhere in this project.
 */
const prisma = new PrismaClient();

const userId = 'test-intelligence-user';
const employeeId = 'test-intelligence-employee';
const departmentId = 'test-intelligence-department';
const period = '2026-03';

beforeAll(async () => {
  await prisma.department.create({
    data: { id: departmentId, name: 'Test Department', code: 'TST' },
  });
  await prisma.user.create({
    data: {
      id: userId,
      email: 'test-intelligence@example.invalid',
      passwordHash: 'not-used',
      firstName: 'Test',
      lastName: 'Subject',
      role: 'EMPLOYEE',
    },
  });
  await prisma.employee.create({
    data: {
      id: employeeId,
      employeeNumber: 'TST-0001',
      userId,
      firstName: 'Test',
      lastName: 'Subject',
      email: 'test-intelligence@example.invalid',
      departmentId,
    },
  });
});

afterAll(async () => {
  // Deleting the employee cascades to every dependent row created above.
  await prisma.employee.deleteMany({ where: { id: employeeId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.department.deleteMany({ where: { id: departmentId } });
  await prisma.$disconnect();
});

describe('sentiment analysis against real rows', () => {
  it('classifies an unanalysed feedback row and stores the result', async () => {
    // Removed first so a previous failed run cannot leave a duplicate behind.
    await prisma.feedback.deleteMany({ where: { id: 'test-feedback-negative' } });

    const feedback = await prisma.feedback.create({
      data: {
        id: 'test-feedback-negative',
        content: 'I am completely overwhelmed by the workload and my manager does not listen to us.',
        createdAt: new Date(2026, 2, 10),
      },
    });

    const result = await nlpService.analyse(feedback.content);

    expect(result.label).toBe('NEGATIVE');
    expect(result.score).toBeLessThan(0);
    // The method is reported honestly whatever the environment has configured:
    // AI must name its provider, and a fallback must not claim one. Pinning this
    // to LEXICON would make the assertion depend on whether a key happened to be
    // present, which is not what is being tested.
    if (result.method === 'AI') {
      expect(result.provider).toBeTruthy();
    } else {
      expect(result.provider).toBeNull();
    }
    expect(result.themes.map((theme) => theme.theme)).toContain('WORKLOAD');
  });

  it('leaves short text unclassified rather than defaulting to neutral', async () => {
    // "ok" is not a sentiment reading; recording NEUTRAL here would put a
    // fabricated row into the aggregates.
    const result = await nlpService.analyse('ok');
    expect(result.method).toBe('UNSCORED');
    expect(result.confidence).toBe(0);
    expect(result.themes).toHaveLength(0);
  });

  it('stores a period bucket that matches the source record date', async () => {
    const { periodOf } = await import('./analysis.pipeline');
    expect(periodOf(new Date(2026, 2, 10))).toBe('2026-03');
    expect(periodOf(new Date(2026, 11, 31))).toBe('2026-12');
  });
});

describe('engagement factor isolation', () => {
  it('records no score when no factor has data', async () => {
    const { engagementCalculator } = await import('./engagement/engagement.calculator');
    const emptyPeriod = '2020-01';

    const result = await engagementCalculator.calculateForEmployee(employeeId, emptyPeriod);

    expect(result.overallScore).toBeNull();
    expect(result.confidence).toBe(0);
    expect(result.factors.every((factor) => factor.score === null)).toBe(true);
    expect(result.notes.length).toBeGreaterThan(0);

    // Nothing should have been written to the score table.
    const stored = await prisma.engagementScore.findMany({
      where: { employeeId, period: emptyPeriod },
    });
    expect(stored).toHaveLength(0);
  });

  it('reports factors that had no data instead of scoring them zero', async () => {
    const { engagementCalculator } = await import('./engagement/engagement.calculator');
    const result = await engagementCalculator.calculateForEmployee(employeeId, '2020-01');

    const survey = result.factors.find((factor) => factor.key === 'SURVEY_RESPONSES');
    expect(survey?.score).toBeNull();
    expect(survey?.contribution).toBe(0);
    expect(survey?.explanation).toMatch(/no data/i);
  });

  /**
   * `contribution` is the factor's share of the enabled configuration
   * (weight / total enabled weight). It previously divided each factor's weight
   * by itself, so every factor reported 100% and the UI showed a 300% breakdown.
   *
   * A factor with no data reports 0, so the shares sum to the fraction of the
   * configuration that was actually used rather than always 100.
   */
  it('splits the enabled weight into shares instead of crediting each factor 100', async () => {
    const { engagementCalculator } = await import('./engagement/engagement.calculator');
    const splitPeriod = '2026-07';

    // Two factors with data: sentiment, plus an approved activity signal.
    await prisma.sentimentAnalysis.create({
      data: {
        sourceType: 'FEEDBACK',
        sourceId: 'test-contribution-feedback',
        employeeId,
        period: splitPeriod,
        label: 'POSITIVE',
        score: 0.8,
        method: 'LEXICON',
      },
    });
    await prisma.employeeActivitySignal.create({
      data: {
        employeeId,
        period: splitPeriod,
        signalKey: 'LEARNING_HOURS',
        value: 10,
        approvalStatus: 'APPROVED',
      },
    });

    const result = await engagementCalculator.calculateForEmployee(employeeId, splitPeriod);
    const shareOf = (key: string) =>
      result.factors.find((factor) => factor.key === key)?.contribution ?? 0;

    // Default configuration is 0.5 / 0.3 / 0.2, so the shares are 50 / 30 / 20.
    expect(shareOf('SURVEY_RESPONSES')).toBe(0);
    expect(shareOf('FEEDBACK_SENTIMENT')).toBeCloseTo(30, 1);
    expect(shareOf('ACTIVITY_DATA')).toBeCloseTo(20, 1);

    // The populated factors cover 0.3 + 0.2 of a 1.0 configuration.
    const populated = result.factors.filter((factor) => factor.enabled && factor.score !== null);
    expect(populated.length).toBe(2);
    expect(populated.reduce((sum, factor) => sum + factor.contribution, 0)).toBeCloseTo(50, 1);
    for (const factor of populated) {
      expect(factor.contribution).toBeLessThan(100);
    }
  });
});

describe('activity signal approval gate', () => {
  it('ignores a PENDING signal and only counts an APPROVED one', async () => {
    const { engagementCalculator } = await import('./engagement/engagement.calculator');
    const activityPeriod = '2026-04';

    await prisma.employeeActivitySignal.create({
      data: {
        employeeId,
        period: activityPeriod,
        signalKey: 'LEARNING_HOURS',
        value: 16,
        approvalStatus: 'PENDING',
      },
    });

    const pending = await engagementCalculator.calculateForEmployee(employeeId, activityPeriod);
    const pendingActivity = pending.factors.find((factor) => factor.key === 'ACTIVITY_DATA');
    expect(pendingActivity?.score).toBeNull();

    await prisma.employeeActivitySignal.update({
      where: {
        employeeId_period_signalKey: {
          employeeId,
          period: activityPeriod,
          signalKey: 'LEARNING_HOURS',
        },
      },
      data: { approvalStatus: 'APPROVED', approvedById: userId, approvedAt: new Date() },
    });

    const approved = await engagementCalculator.calculateForEmployee(employeeId, activityPeriod);
    const approvedActivity = approved.factors.find((factor) => factor.key === 'ACTIVITY_DATA');
    expect(approvedActivity?.score).toBe(100);
    expect(approvedActivity?.sampleSize).toBe(1);

    await prisma.employeeActivitySignal.deleteMany({ where: { employeeId, period: activityPeriod } });
  });

  it('records the factor audit trail next to the score', async () => {
    const results = await prisma.engagementFactorResult.findMany({
      where: { employeeId },
      select: { factorKey: true, weight: true, enabled: true, explanation: true },
    });

    expect(results.length).toBeGreaterThan(0);
    for (const row of results) {
      expect(row.weight).toBeGreaterThan(0);
      expect(row.explanation).toBeTruthy();
    }
  });
});

describe('domain score suppression', () => {
  it('suppresses a group below the privacy threshold and stores no value', async () => {
    const { domainScoreService } = await import('./engagement/domain-scores.service');
    // A threshold of 5 with a single-employee department must suppress it,
    // because one person's engagement is identifiable.
    const result = await domainScoreService.rebuild(period, { threshold: 5 });
    const departmentRows = result.levels.DEPARTMENT;

    expect(departmentRows.length).toBeGreaterThan(0);
    for (const row of departmentRows) {
      expect(row.suppressed).toBe(true);
      expect(row.value).toBe(0);
    }
  });

  it('never suppresses the employee\'s own row', async () => {
    const { domainScoreService } = await import('./engagement/domain-scores.service');
    const result = await domainScoreService.rebuild(period, { threshold: 5 });

    for (const row of result.levels.EMPLOYEE) {
      expect(row.suppressed).toBe(false);
    }
  });

  it('is idempotent across repeated rebuilds', async () => {
    const { domainScoreService } = await import('./engagement/domain-scores.service');
    await domainScoreService.rebuild(period, { threshold: 5 });
    const before = await prisma.engagementDomainScore.count({ where: { period } });
    await domainScoreService.rebuild(period, { threshold: 5 });
    const after = await prisma.engagementDomainScore.count({ where: { period } });

    expect(after).toBe(before);
  });

  it('reports how many employees it scored, so callers do not score twice', async () => {
    const { domainScoreService } = await import('./engagement/domain-scores.service');
    const result = await domainScoreService.rebuild(period, {
      threshold: 5,
      employeeIds: [employeeId],
    });

    expect(result.scored).toBe(1);
    expect(result.skipped).toBe(0);
  });
});

/**
 * Scope enforcement.
 *
 * The route permission says who may call an endpoint; these checks cover the
 * separate question of *which rows* that call may touch. Both regressions below
 * let a limited-scope user reach organisation-wide data, which a permission
 * check alone cannot catch.
 */
describe('intelligence scope enforcement', () => {
  const employeeUser = { id: userId, email: 'test-intelligence@example.invalid', role: 'EMPLOYEE' };

  it('does not let a scoped caller recalculate the whole organisation', async () => {
    const { intelligenceService } = await import('./intelligence.service');

    // A second employee with data, who must not be touched by the first's run.
    const otherUserId = 'test-intelligence-other-user';
    const otherEmployeeId = 'test-intelligence-other-employee';

    await prisma.user.create({
      data: {
        id: otherUserId,
        email: 'test-intelligence-other@example.invalid',
        passwordHash: 'not-used',
        firstName: 'Other',
        lastName: 'Person',
        role: 'EMPLOYEE',
      },
    });
    await prisma.employee.create({
      data: {
        id: otherEmployeeId,
        employeeNumber: 'TST-0002',
        userId: otherUserId,
        firstName: 'Other',
        lastName: 'Person',
        email: 'test-intelligence-other@example.invalid',
        departmentId,
      },
    });
    await prisma.sentimentAnalysis.create({
      data: {
        sourceType: 'FEEDBACK',
        sourceId: 'test-scope-other-feedback',
        employeeId: otherEmployeeId,
        period: '2026-08',
        label: 'POSITIVE',
        score: 0.9,
        method: 'LEXICON',
      },
    });

    try {
      // No employeeId: previously this ran calculateForAll and scored everyone.
      const result = await intelligenceService.calculate(employeeUser, { period: '2026-08' });

      expect(result.scope).toBe('SCOPED');
      const touched = await prisma.engagementScore.findMany({
        where: { period: '2026-08' },
        select: { employeeId: true },
      });
      expect(touched.map((row) => row.employeeId)).not.toContain(otherEmployeeId);
    } finally {
      await prisma.engagementScore.deleteMany({ where: { period: '2026-08' } });
      await prisma.engagementFactorResult.deleteMany({ where: { period: '2026-08' } });
      await prisma.employee.deleteMany({ where: { id: otherEmployeeId } });
      await prisma.user.deleteMany({ where: { id: otherUserId } });
    }
  });

  it('refuses aggregate domain scores to a caller who cannot read everyone', async () => {
    const { intelligenceService } = await import('./intelligence.service');

    for (const level of ['TEAM', 'DEPARTMENT', 'ORGANISATION'] as const) {
      await expect(intelligenceService.domainScores(employeeUser, { period, level })).rejects.toThrow(
        /restricted to users who can read every employee/i,
      );
    }

    // Their own employee view is still allowed.
    const own = await intelligenceService.domainScores(employeeUser, {
      period,
      level: 'EMPLOYEE',
      employeeId,
    });
    expect(own.every((row: { domainKey: string }) => row.domainKey === employeeId)).toBe(true);
  });
});
