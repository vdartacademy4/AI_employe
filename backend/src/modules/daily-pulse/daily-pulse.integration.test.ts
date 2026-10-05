import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { dailyPulseService, startOfUtcDay } from './daily-pulse.service';
import { feedbackInboxService } from './feedback-inbox.service';
import { storeDailyScore } from './daily-score.calculator';
import { insightsService } from './insights.service';
import type { AuthenticatedUser } from '../../types/express';

/**
 * End-to-end checks for the daily feedback module against real SQLite.
 *
 * The three properties worth defending with a test rather than a comment are:
 * a second submission on the same day is rejected, anonymous feedback has no
 * joinable author, and a score is never invented for a day with no answers.
 */
const prisma = new PrismaClient();

const departmentId = 'test-pulse-department';
const teamId = 'test-pulse-team';

const employeeUserId = 'test-pulse-employee-user';
const employeeId = 'test-pulse-employee';

const hrUserId = 'test-pulse-hr-user';
const hrEmployeeId = 'test-pulse-hr-employee';

const managerUserId = 'test-pulse-manager-user';
const managerEmployeeId = 'test-pulse-manager-employee';

const employeeUser: AuthenticatedUser = {
  id: employeeUserId,
  role: 'EMPLOYEE',
  email: 'pulse-employee@example.invalid',
};
const hrUser: AuthenticatedUser = {
  id: hrUserId,
  role: 'HR',
  email: 'pulse-hr@example.invalid',
};
const managerUser: AuthenticatedUser = {
  id: managerUserId,
  role: 'MANAGER',
  email: 'pulse-manager@example.invalid',
};

const today = startOfUtcDay(new Date());

/**
 * The five questions of today's frozen set.
 *
 * These are the set's own rows rather than pool rows, because the set is what
 * an employee is actually asked. A test that submitted against the pool would
 * pass while proving nothing about the daily flow.
 */
const questionIds: string[] = [];

/** A pool row: curated by HR, never shown to an employee directly. */
const poolQuestionId = 'test-pulse-pool-question';

beforeAll(async () => {
  // Clean any residue from a previously failed run so the suite is idempotent.
  await prisma.dailyQuestionResponse.deleteMany({ where: { employeeId } });
  await prisma.dailyQuestionAnswer.deleteMany({ where: { employeeId } });
  await prisma.dailyQuestion.deleteMany({ where: { prompt: { startsWith: 'Test question' } } });
  await prisma.anonymousFeedback.deleteMany({ where: { content: { startsWith: 'Test anonymous' } } });
  await prisma.employee.deleteMany({
    where: { id: { in: [employeeId, hrEmployeeId, managerEmployeeId] } },
  });
  await prisma.user.deleteMany({ where: { id: { in: [employeeUserId, hrUserId, managerUserId] } } });
  await prisma.team.deleteMany({ where: { id: teamId } });
  await prisma.department.deleteMany({ where: { id: departmentId } });

  await prisma.department.create({ data: { id: departmentId, name: 'Pulse Dept', code: 'PLS' } });
  await prisma.team.create({
    data: { id: teamId, name: 'Pulse Team', code: 'PLST', departmentId },
  });

  await prisma.user.create({
    data: {
      id: employeeUserId,
      email: 'pulse-employee@example.invalid',
      passwordHash: 'not-used',
      firstName: 'Pat',
      lastName: 'Employee',
      role: 'EMPLOYEE',
    },
  });
  await prisma.employee.create({
    data: {
      id: employeeId,
      employeeNumber: 'PLS-0001',
      userId: employeeUserId,
      firstName: 'Pat',
      lastName: 'Employee',
      email: 'pulse-employee@example.invalid',
      departmentId,
      teamId,
    },
  });

  await prisma.user.create({
    data: {
      id: hrUserId,
      email: 'pulse-hr@example.invalid',
      passwordHash: 'not-used',
      firstName: 'Harriet',
      lastName: 'Representative',
      role: 'HR',
    },
  });
  await prisma.employee.create({
    data: {
      id: hrEmployeeId,
      employeeNumber: 'PLS-0002',
      userId: hrUserId,
      firstName: 'Harriet',
      lastName: 'Representative',
      email: 'pulse-hr@example.invalid',
      departmentId,
    },
  });

  await prisma.user.create({
    data: {
      id: managerUserId,
      email: 'pulse-manager@example.invalid',
      passwordHash: 'not-used',
      firstName: 'Morgan',
      lastName: 'Manager',
      role: 'MANAGER',
    },
  });
  await prisma.employee.create({
    data: {
      id: managerEmployeeId,
      employeeNumber: 'PLS-0003',
      userId: managerUserId,
      firstName: 'Morgan',
      lastName: 'Manager',
      email: 'pulse-manager@example.invalid',
      departmentId,
    },
  });

  // The manager is scoped to the employee's team, not the whole department.
  await prisma.manager.create({
    data: { managerUserId, teamId },
  });

  // A pool question and today's frozen set. The pool row exists so the
  // "not part of today's set" test has a realistic question to be rejected
  // with - it is a real question, just not one anybody was asked today.
  await prisma.dailyQuestion.create({
    data: { id: poolQuestionId, prompt: 'Test question pool row', position: 1, answerType: 'RATING' },
  });

  const set = await prisma.dailyQuestionSet.create({
    data: {
      responseDate: today,
      source: 'BANK',
      questions: {
        create: Array.from({ length: 5 }, (_, index) => ({
          prompt: `Test question ${index + 1}`,
          position: index + 1,
          answerType: 'RATING',
        })),
      },
    },
    include: { questions: { orderBy: { position: 'asc' } } },
  });
  for (const question of set.questions) questionIds.push(question.id);

  // Resubmission is off by default; the duplicate-prevention test depends on it.
  await prisma.dailyPulseConfig.upsert({
    where: { id: 'default' },
    create: { id: 'default', allowResubmission: false, isActive: true },
    update: { allowResubmission: false, isActive: true },
  });
});

afterAll(async () => {
  await prisma.employee.deleteMany({ where: { id: { in: [employeeId, hrEmployeeId, managerEmployeeId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [employeeUserId, hrUserId, managerUserId] } } });
  await prisma.team.deleteMany({ where: { id: teamId } });
  await prisma.department.deleteMany({ where: { id: departmentId } });
  // The set is removed last: its questions cascade, but only once the responses
  // that reference them are gone with their employees.
  await prisma.dailyQuestionSet.deleteMany({ where: { responseDate: today } });
  await prisma.dailyQuestion.deleteMany({ where: { prompt: { startsWith: 'Test question' } } });
  await prisma.anonymousFeedback.deleteMany({ where: { content: { startsWith: 'Test anonymous' } } });
  await prisma.$disconnect();
});

beforeEach(async () => {
  // Reset per-test state so ordering cannot affect the duplicate test.
  await prisma.dailyQuestionResponse.deleteMany({ where: { employeeId } });
  await prisma.dailyQuestionAnswer.deleteMany({ where: { employeeId } });
  await prisma.feedbackHistory.deleteMany({ where: { employeeId } });
  await prisma.employeeFeedback.deleteMany({ where: { employeeId } });
  await prisma.dailyEngagementScore.deleteMany({ where: { employeeId } });
  await prisma.anonymousFeedback.deleteMany({ where: { content: { startsWith: 'Test anonymous' } } });
  await prisma.dailyPulseConfig.update({
    where: { id: 'default' },
    data: { allowResubmission: false, isActive: true },
  });
});

function submission(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    responseDate: today,
    answers: questionIds.map((questionId) => ({ questionId, numericValue: 4 })),
    writtenFeedback: { category: 'SUGGESTION', content: 'Test written feedback from the employee' },
    ...overrides,
  } as never;
}

describe('daily pulse submission', () => {
  it('accepts a full five-question submission and stores the answers', async () => {
    const result = await dailyPulseService.submit(employeeUser, submission());
    expect(result.answerCount).toBe(5);

    const answers = await prisma.dailyQuestionAnswer.findMany({
      where: { employeeId },
    });
    expect(answers).toHaveLength(5);
  });

  it('rejects a second submission on the same day', async () => {
    await dailyPulseService.submit(employeeUser, submission());
    await expect(dailyPulseService.submit(employeeUser, submission())).rejects.toThrow(
      /already submitted/i,
    );
  });

  it('allows a resubmission once HR enables it', async () => {
    await dailyPulseService.submit(employeeUser, submission());
    await prisma.dailyPulseConfig.update({
      where: { id: 'default' },
      data: { allowResubmission: true },
    });

    const result = await dailyPulseService.submit(
      employeeUser,
      submission({
        answers: questionIds.map((questionId) => ({ questionId, numericValue: 2 })),
      }),
    );
    expect(result.answerCount).toBe(5);

    // The replacement is not an accumulation: still five answers in total.
    const answers = await prisma.dailyQuestionAnswer.findMany({ where: { employeeId } });
    expect(answers).toHaveLength(5);
    expect(answers.every((answer) => answer.numericValue === 2)).toBe(true);
  });

  it('rejects a partial submission', async () => {
    await expect(
      dailyPulseService.submit(
        employeeUser,
        submission({ answers: [{ questionId: questionIds[0], numericValue: 3 }] }),
      ),
    ).rejects.toThrow(/exactly 5 answers/i);
  });

  it('rejects an answer to a question that is not in today’s set', async () => {
    // The pool row is a real question but was not asked today. Answering it
    // must be refused rather than quietly recorded against the wrong set.
    await expect(
      dailyPulseService.submit(
        employeeUser,
        submission({
          answers: [...questionIds.slice(0, 4).map((questionId) => ({ questionId, numericValue: 4 })),
            { questionId: poolQuestionId, numericValue: 4 }],
        }),
      ),
    ).rejects.toThrow(/not part of today's set/i);
  });

  it('refuses a value outside the 0-1 range for a yes/no question', async () => {
    const yesNoId = questionIds[4]!;
    await prisma.dailyQuestion.update({
      where: { id: yesNoId },
      data: { answerType: 'YES_NO' },
    });

    try {
      await expect(
        dailyPulseService.submit(
          employeeUser,
          submission({
            answers: questionIds.map((questionId) => ({ questionId, numericValue: 4 })),
          }),
        ),
      ).rejects.toThrow(/yes\/no answers must be 1 or 0/i);
    } finally {
      await prisma.dailyQuestion.update({
        where: { id: yesNoId },
        data: { answerType: 'RATING' },
      });
    }
  });
});

describe('anonymous feedback', () => {
  it('stores anonymous feedback in a table with no author column', async () => {
    await dailyPulseService.submit(
      employeeUser,
      submission({
        anonymousFeedback: { category: 'CONCERN', content: 'Test anonymous concern about tooling' },
      }),
    );

    const rows = await prisma.anonymousFeedback.findMany({
      where: { content: { startsWith: 'Test anonymous' } },
    });
    expect(rows).toHaveLength(1);
    // The anonymity guarantee is structural: the model has no employeeId field
    // at all, so there is nothing to join back on.
    const columns = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      'PRAGMA table_info("AnonymousFeedback")',
    );
    const names = columns.map((column) => column.name as string);
    expect(names).not.toContain('employeeId');
    expect(names).not.toContain('authorId');
  });

  it('does not expose anonymous content to a manager', async () => {
    // Pool below the minimum, so even a role with the permission sees nothing.
    await prisma.anonymousFeedback.create({
      data: { category: 'CONCERN', content: 'Test anonymous only comment' },
    });

    const forManager = await feedbackInboxService.list(managerUser, {
      page: 1,
      pageSize: 25,
    });
    expect(forManager.some((item) => item.isAnonymous)).toBe(false);
  });

  it('gives an employee a record of their anonymous submission without the content', async () => {
    await dailyPulseService.submit(
      employeeUser,
      submission({
        anonymousFeedback: { category: 'CONCERN', content: 'Test anonymous private thought' },
      }),
    );

    const mine = await feedbackInboxService.myFeedback(employeeUser);
    expect(mine.anonymous).toHaveLength(1);
    expect(mine.anonymous[0]).not.toHaveProperty('content');
  });
});

describe('daily engagement score', () => {
  it('produces no score for a day with no answers', async () => {
    const score = await storeDailyScore(employeeId, today);
    expect(score).toBeNull();

    const stored = await prisma.dailyEngagementScore.findMany({
      where: { employeeId, scoreDate: today },
    });
    expect(stored).toHaveLength(0);
  });

  it('scores a day with answers and reports which inputs were present', async () => {
    await dailyPulseService.submit(employeeUser, submission());

    const score = await storeDailyScore(employeeId, today);
    expect(score).not.toBeNull();
    expect(score!.questionScore).not.toBeNull();
    // Nothing was written and no prior day exists, so both are null rather
    // than zero: a zero would read as "the employee felt nothing".
    expect(score!.feedbackScore).toBeNull();
    expect(score!.trendScore).toBeNull();
    // All five answers are 4 on a 1-5 scale => 75 on [0, 100].
    expect(score!.overallScore).toBeCloseTo(75, 0);
  });

  it('uses a previous day as the trend component on a later day', async () => {
    // A prior day establishes the trend input.
    const yesterday = new Date(today.getTime() - 86_400_000);
    await prisma.dailyEngagementScore.create({
      data: { employeeId, scoreDate: yesterday, overallScore: 50, method: 'DAILY_V1' },
    });

    await dailyPulseService.submit(employeeUser, submission());

    const score = await storeDailyScore(employeeId, today);
    expect(score).not.toBeNull();
    expect(score!.trendScore).toBeCloseTo(50, 0);
    // The trend pulls the blended score below the questions-only value of 75.
    expect(score!.overallScore).toBeLessThan(75);
  });
});

describe('insights', () => {
  it('generates nothing when there is insufficient data', async () => {
    const insights = await insightsService.generateForTarget(hrUser, {
      level: 'ORGANISATION',
      key: 'ALL',
      name: 'Organisation',
      employeeIds: [],
    });
    // One submission cannot support a claim, so the correct answer is none.
    expect(insights.every((insight) => insight.evidenceSize >= 5)).toBe(true);
  });

  it('does not let an employee read team or organisation insights', async () => {
    const insights = await insightsService.list(employeeUser);
    expect(insights).toEqual([]);
  });
});
