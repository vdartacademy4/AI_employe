import { ENGAGEMENT_THEMES, THEME_LABELS, type EngagementTheme } from '../../core/enums';
import { prisma } from '../../core/prisma';
import type { AuthenticatedUser } from '../../types/express';
import { resolveScope } from '../../core/scope';
import { startOfUtcDay } from './daily-pulse.service';

/**
 * The smallest number of records a claim may rest on. Below this an average is
 * too easily produced by one or two people, so no insight is written at all
 * rather than written with a caveat.
 */
const MIN_EVIDENCE = 5;

/** A change smaller than this (in score points) is not a trend, it is noise. */
const MIN_DELTA = 4;

export interface InsightView {
  id: string;
  level: string;
  targetKey: string;
  targetName: string;
  insightType: string;
  subject: string;
  headline: string;
  detail: string;
  direction: string;
  severity: string;
  evidenceSize: number;
  windowStart: string;
  windowEnd: string;
  createdAt: string;
}

export class InsightsService {
  /**
   * Generates insights for one aggregation target by comparing two windows of
   * equal length. Every insight returned is traceable to the aggregate it came
   * from; nothing is generated without stored data behind it.
   */
  async generateForTarget(
    user: AuthenticatedUser,
    target: { level: string; key: string; name: string; employeeIds: string[] },
  ): Promise<InsightView[]> {
    const windowDays = 14;
    const windowEnd = startOfUtcDay(new Date());
    const windowStart = new Date(windowEnd.getTime() - windowDays * 86_400_000);
    const previousStart = new Date(windowStart.getTime() - windowDays * 86_400_000);

    const employeeFilter =
      target.employeeIds.length > 0 ? { employeeId: { in: target.employeeIds } } : {};

    const [current, previous] = await Promise.all([
      this.windowStats(employeeFilter, windowStart, windowEnd),
      this.windowStats(employeeFilter, previousStart, windowStart),
    ]);

    if (current.sampleSize < MIN_EVIDENCE) {
      // Below the threshold the honest output is "not enough data", which the
      // caller surfaces as an empty state rather than a manufactured finding.
      return [];
    }

    const candidates: Array<Omit<InsightView, 'id' | 'createdAt'>> = [];

    // 1. Engagement direction.
    if (previous.sampleSize >= MIN_EVIDENCE) {
      const delta = round1(current.avgScore - previous.avgScore);
      if (Math.abs(delta) >= MIN_DELTA) {
        const rising = delta > 0;
        candidates.push({
          level: target.level,
          targetKey: target.key,
          targetName: target.name,
          insightType: rising ? 'POSITIVE_MOMENTUM' : 'ENGAGEMENT_DECLINE',
          subject: 'ENGAGEMENT',
          headline: `${target.name} engagement is ${rising ? 'rising' : 'falling'}`,
          detail: `Average daily engagement moved from ${previous.avgScore.toFixed(1)} to ${current.avgScore.toFixed(1)} across ${current.sampleSize} daily submissions.`,
          direction: rising ? 'UP' : 'DOWN',
          severity: !rising && delta <= -10 ? 'CRITICAL' : delta < 0 ? 'WARNING' : 'INFO',
          evidenceSize: current.sampleSize,
          windowStart: windowStart.toISOString(),
          windowEnd: windowEnd.toISOString(),
        });
      }
    }

    // 2. Sentiment shift.
    if (previous.sampleSize >= MIN_EVIDENCE) {
      const delta = round1(current.negativeShare - previous.negativeShare);
      if (Math.abs(delta) >= 0.1) {
        const worse = delta > 0;
        candidates.push({
          level: target.level,
          targetKey: target.key,
          targetName: target.name,
          insightType: 'SENTIMENT_CHANGE',
          subject: 'SENTIMENT_NEGATIVE',
          headline: `Negative feedback in ${target.name} ${worse ? 'has increased' : 'has decreased'}`,
          detail: `The share of negative comments moved from ${pct(previous.negativeShare)} to ${pct(current.negativeShare)} of ${current.commentCount} analysed comments.`,
          direction: worse ? 'UP' : 'DOWN',
          severity: worse && delta >= 0.25 ? 'CRITICAL' : worse ? 'WARNING' : 'INFO',
          evidenceSize: current.commentCount,
          windowStart: windowStart.toISOString(),
          windowEnd: windowEnd.toISOString(),
        });
      }
    }

    // 3. Theme surges: themes whose mention share grew enough to be worth
    //    acting on, reported only when the theme has a real sample behind it.
    for (const theme of ENGAGEMENT_THEMES) {
      const now = current.themes[theme] ?? 0;
      const before = previous.themes[theme] ?? 0;
      if (now < MIN_EVIDENCE) continue;
      const delta = round1(now - before);
      if (delta < MIN_DELTA) continue;

      candidates.push({
        level: target.level,
        targetKey: target.key,
        targetName: target.name,
        insightType: 'THEME_SURGE',
        subject: theme,
        headline: `${THEME_LABELS[theme]} mentions have risen in ${target.name}`,
        detail: `Mentions increased by ${delta.toFixed(1)} across ${now.toFixed(1)} average per employee over the last 14 days.`,
        direction: 'UP',
        severity: delta >= 15 ? 'WARNING' : 'INFO',
        evidenceSize: Math.round(now),
        windowStart: windowStart.toISOString(),
        windowEnd: windowEnd.toISOString(),
      });
    }

    // 4. Participation drop: a falling response rate is the most actionable
    //    finding in a daily pulse, because it changes how every other number
    //    should be read.
    if (previous.submittedDays >= MIN_EVIDENCE && current.submittedDays >= MIN_EVIDENCE) {
      const rate = (submitted: number, eligible: number) =>
        eligible === 0 ? 0 : Math.round((submitted / eligible) * 1000) / 10;
      const currentRate = rate(current.submittedDays, current.eligibleEmployees);
      const previousRate = rate(previous.submittedDays, previous.eligibleEmployees);
      const delta = round1(currentRate - previousRate);
      if (delta <= -15) {
        candidates.push({
          level: target.level,
          targetKey: target.key,
          targetName: target.name,
          insightType: 'PARTICIPATION_DROP',
          subject: 'PARTICIPATION',
          headline: `Participation in ${target.name} has fallen`,
          detail: `Daily submission rate moved from ${previousRate}% to ${currentRate}% over the last 14 days, so engagement figures may under-represent the whole group.`,
          direction: 'DOWN',
          severity: delta <= -30 ? 'CRITICAL' : 'WARNING',
          evidenceSize: current.submittedDays,
          windowStart: windowStart.toISOString(),
          windowEnd: windowEnd.toISOString(),
        });
      }
    }

    if (candidates.length === 0) return [];

    // Persist so insights are auditable and can be dismissed, then return the
    // stored rows. Re-running the generator replaces nothing: it appends, and
    // the caller sees the newest state.
    const stored = await Promise.all(
      candidates.map((candidate) =>
        prisma.aiInsight.create({
          data: {
            level: candidate.level,
            targetKey: candidate.targetKey,
            targetName: candidate.targetName,
            insightType: candidate.insightType,
            subject: candidate.subject,
            headline: candidate.headline,
            detail: candidate.detail,
            direction: candidate.direction,
            severity: candidate.severity,
            evidenceJson: JSON.stringify({
              windowStart: candidate.windowStart,
              windowEnd: candidate.windowEnd,
              sampleSize: candidate.evidenceSize,
            }),
            evidenceSize: candidate.evidenceSize,
            windowStart: new Date(candidate.windowStart),
            windowEnd: new Date(candidate.windowEnd),
          },
        }),
      ),
    );

    return stored.map(toView);
  }

  /**
   * Aggregates one window of stored activity. Returns counts and averages only;
   * no individual is readable from the result.
   */
  private async windowStats(
    employeeFilter: Record<string, unknown>,
    from: Date,
    to: Date,
  ) {
    const [scoreRows, commentRows, themeRows, submissions, eligibleEmployees] = await Promise.all([
      prisma.dailyEngagementScore.findMany({
        where: { ...employeeFilter, scoreDate: { gte: from, lt: to } },
        select: { overallScore: true },
      }),
      prisma.sentimentAnalysis.findMany({
        where: {
          ...employeeFilter,
          sourceType: { in: ['DAILY_FEEDBACK', 'ANONYMOUS_FEEDBACK', 'DAILY_ANSWER'] },
          createdAt: { gte: from, lt: to },
        },
        select: { label: true, employeeId: true },
      }),
      prisma.themeDetection.findMany({
        where: {
          analysis: {
            createdAt: { gte: from, lt: to },
            ...(Object.keys(employeeFilter).length > 0 ? employeeFilter : {}),
          },
        },
        select: { theme: true, analysis: { select: { employeeId: true } } },
      }),
      prisma.dailyQuestionResponse.count({ where: { ...employeeFilter, responseDate: { gte: from, lt: to } } }),
      prisma.employee.count({ where: { ...employeeWhereFrom(employeeFilter), status: { not: 'TERMINATED' } } }),
    ]);

    const avgScore =
      scoreRows.length === 0
        ? 0
        : scoreRows.reduce((sum, row) => sum + row.overallScore, 0) / scoreRows.length;

    const negative = commentRows.filter((row) => row.label === 'NEGATIVE').length;

    // Theme share is expressed per distinct employee so a single talkative
    // person cannot dominate a theme ranking.
    const themeCounts = new Map<string, Set<string>>();
    for (const row of themeRows) {
      const set = themeCounts.get(row.theme) ?? new Set<string>();
      set.add(row.analysis.employeeId ?? 'ANONYMOUS');
      themeCounts.set(row.theme, set);
    }
    const themeShare: Partial<Record<EngagementTheme, number>> = {};
    for (const [theme, employees] of themeCounts) {
      themeShare[theme as EngagementTheme] = employees.size;
    }

    return {
      sampleSize: scoreRows.length,
      avgScore: round1(avgScore),
      commentCount: commentRows.length,
      negativeShare: commentRows.length === 0 ? 0 : round1(negative / commentRows.length),
      submittedDays: submissions,
      eligibleEmployees,
      themes: themeShare,
    };
  }

  /** Stored insights the caller is allowed to see, newest first. */
  async list(user: AuthenticatedUser, limit = 20) {
    const scope = await resolveScope(user);
    const keys = await this.readableTargetKeys(user, scope);
    if (keys.length === 0) return [];

    const rows = await prisma.aiInsight.findMany({
      where: { targetKey: { in: keys }, isDismissed: false },
      orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    });
    return rows.map(toView);
  }

  /**
   * Target keys the caller may read: the organisation, plus their own team and
   * department. An employee has no insight targets.
   */
  private async readableTargetKeys(
    user: AuthenticatedUser,
    scope: Awaited<ReturnType<typeof resolveScope>>,
  ): Promise<string[]> {
    if (scope.canReadAll) return ['ALL'];
    if (scope.teamEmployeeIds.length === 0 && scope.departmentIds.length === 0) return [];

    const teams = await prisma.team.findMany({
      where: {
        OR: [
          { id: { in: scope.teamIds } },
          { departmentId: { in: scope.departmentIds } },
        ],
      },
      select: { id: true },
    });
    return teams.map((team) => team.id);
  }
}

/** The anonymous employee id placeholder in theme counts. */
function employeeWhereFrom(employeeFilter: Record<string, unknown>): Record<string, unknown> {
  const inList = (employeeFilter as { employeeId?: { in?: string[] } }).employeeId?.in;
  return inList ? { id: { in: inList } } : {};
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function pct(share: number): string {
  return `${Math.round(share * 1000) / 10}%`;
}

function toView(row: {
  id: string;
  level: string;
  targetKey: string;
  targetName: string;
  insightType: string;
  subject: string;
  headline: string;
  detail: string;
  direction: string;
  severity: string;
  evidenceSize: number;
  windowStart: Date;
  windowEnd: Date;
  createdAt: Date;
}): InsightView {
  return {
    id: row.id,
    level: row.level,
    targetKey: row.targetKey,
    targetName: row.targetName,
    insightType: row.insightType,
    subject: row.subject,
    headline: row.headline,
    detail: row.detail,
    direction: row.direction,
    severity: row.severity,
    evidenceSize: row.evidenceSize,
    windowStart: row.windowStart.toISOString(),
    windowEnd: row.windowEnd.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

export const insightsService = new InsightsService();
