import { prisma } from '../../core/prisma';
import { resolveScope } from '../../core/scope';
import { PERMISSIONS, roleHasPermission } from '../auth/permissions';
import type { AuthenticatedUser } from '../../types/express';
import { startOfUtcDay } from './daily-pulse.service';
import { insightsService } from './insights.service';

export interface DashboardSummary {
  /** Identifies which dashboard was rendered, so the UI can label itself. */
  role: 'EMPLOYEE' | 'MANAGER' | 'HR' | 'ADMIN';
  scopeLabel: string;
  windowStart: string;
  windowEnd: string;
  metrics: DashboardMetric[];
  sentiment: { positive: number; neutral: number; negative: number; sampleSize: number } | null;
  topThemes: Array<{ theme: string; label: string; count: number }>;
  trend: Array<{ date: string; score: number | null }>;
  insights: Awaited<ReturnType<typeof insightsService.list>>;
  isEmpty: boolean;
}

export interface DashboardMetric {
  key: string;
  label: string;
  /** Null means "not enough data", which the UI renders as a dash, not as 0. */
  value: number | null;
  unit: 'percent' | 'score' | 'count' | 'days';
  hint: string;
}

/**
 * The five metrics a daily-pulse dashboard can legitimately report.
 *
 * Every one is a count or average over stored rows. Nothing here is a
 * placeholder: when a metric has no data it is returned as `null` so the
 * interface can say "no responses yet" rather than displaying a zero that
 * looks like a measured result.
 */
export class DashboardsService {
  private readonly windowDays = 30;

  async forCurrentUser(user: AuthenticatedUser): Promise<DashboardSummary> {
    const scope = await resolveScope(user);
    const isHr = roleHasPermission(user.role, PERMISSIONS.EMPLOYEE_READ_ALL);
    const isManager = roleHasPermission(user.role, PERMISSIONS.EMPLOYEE_READ_TEAM);

    const windowEnd = startOfUtcDay(new Date());
    const windowStart = new Date(windowEnd.getTime() - this.windowDays * 86_400_000);

    // Scope: HR/Admin see the organisation, a manager sees their team, an
    // employee sees themselves. Resolved here so every downstream query
    // inherits the same restriction.
    const employeeIds = isHr
      ? []
      : isManager
        ? scope.teamEmployeeIds
        : scope.selfEmployeeIds;

    const employeeFilter =
      employeeIds.length > 0 ? { employeeId: { in: employeeIds } } : {};

    const [eligibleEmployees, submissions, scores, sentiments, themes, insights] =
      await Promise.all([
        prisma.employee.count({
          where: isHr ? { status: { not: 'TERMINATED' } } : { id: { in: employeeIds }, status: { not: 'TERMINATED' } },
        }),
        prisma.dailyQuestionResponse.count({
          where: { ...employeeFilter, responseDate: { gte: windowStart, lt: nextDay(windowEnd) } },
        }),
        prisma.dailyEngagementScore.findMany({
          where: { ...employeeFilter, scoreDate: { gte: windowStart, lt: nextDay(windowEnd) } },
          select: { scoreDate: true, overallScore: true },
          orderBy: { scoreDate: 'asc' },
        }),
        prisma.sentimentAnalysis.findMany({
          where: {
            ...employeeFilter,
            sourceType: { in: ['DAILY_FEEDBACK', 'ANONYMOUS_FEEDBACK', 'DAILY_ANSWER'] },
            createdAt: { gte: windowStart, lt: nextDay(windowEnd) },
          },
          select: { label: true },
        }),
        prisma.themeDetection.groupBy({
          by: ['theme'],
          where: {
            analysis: {
              createdAt: { gte: windowStart, lt: nextDay(windowEnd) },
              ...(employeeIds.length > 0 ? { employeeId: { in: employeeIds } } : {}),
            },
          },
          _count: { id: true },
          orderBy: { _count: { id: 'desc' } },
          take: 5,
        }),
        insightsService.list(user, 5).catch(() => []),
      ]);

    const participationRate =
      eligibleEmployees === 0 ? null : Math.round((submissions / (eligibleEmployees * this.windowDays)) * 1000) / 10;

    const averageScore =
      scores.length === 0
        ? null
        : round1(scores.reduce((sum, row) => sum + row.overallScore, 0) / scores.length);

    const latestScore = scores.length > 0 ? (scores[scores.length - 1]?.overallScore ?? null) : null;
    const firstScore = scores.length > 0 ? (scores[0]?.overallScore ?? null) : null;

    const streakDays = await this.currentStreak(employeeIds, windowEnd);

    const metrics: DashboardMetric[] = [
      {
        key: 'participation',
        label: 'Participation rate',
        value: participationRate,
        unit: 'percent',
        hint: `Share of the last ${this.windowDays} days with a submitted pulse`,
      },
      {
        key: 'averageScore',
        label: 'Average engagement',
        value: averageScore,
        unit: 'score',
        hint: 'Mean daily engagement score in the window',
      },
      {
        key: 'latestScore',
        label: 'Latest score',
        value: latestScore,
        unit: 'score',
        hint: 'Most recent daily engagement score',
      },
      {
        key: 'trend',
        label: '30-day change',
        value: latestScore !== null && firstScore !== null ? round1(latestScore - firstScore) : null,
        unit: 'score',
        hint: 'Difference between the first and last score in the window',
      },
      {
        key: 'streak',
        label: 'Submission streak',
        value: streakDays,
        unit: 'days',
        hint: 'Consecutive days with a submitted pulse',
      },
    ];

    const positive = sentiments.filter((row) => row.label === 'POSITIVE').length;
    const neutral = sentiments.filter((row) => row.label === 'NEUTRAL').length;
    const negative = sentiments.filter((row) => row.label === 'NEGATIVE').length;

    return {
      role: user.role as DashboardSummary['role'],
      scopeLabel: this.scopeLabel(user, scope, isHr, isManager),
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      metrics,
      sentiment:
        sentiments.length === 0
          ? null
          : {
              positive: Math.round((positive / sentiments.length) * 1000) / 10,
              neutral: Math.round((neutral / sentiments.length) * 1000) / 10,
              negative: Math.round((negative / sentiments.length) * 1000) / 10,
              sampleSize: sentiments.length,
            },
      topThemes: themes.map((row) => ({
        theme: row.theme,
        label: row.theme,
        count: row._count.id,
      })),
      trend: this.buildTrend(scores, windowEnd, this.windowDays),
      insights,
      isEmpty: submissions === 0 && sentiments.length === 0,
    };
  }

  /** Consecutive submitted days ending today (or yesterday, if today is open). */
  private async currentStreak(employeeIds: string[], today: Date): Promise<number> {
    if (employeeIds.length === 0) {
      // HR/org view: the streak metric does not apply to a group.
      return 0;
    }
    const recent = await prisma.dailyQuestionResponse.findMany({
      where: { employeeId: { in: employeeIds } },
      select: { responseDate: true },
      orderBy: { responseDate: 'desc' },
      distinct: ['responseDate'],
      take: 90,
    });
    if (recent.length === 0) return 0;

    const dates = new Set(recent.map((row) => row.responseDate.toISOString().slice(0, 10)));
    let cursor = today;
    // A day still in progress does not break the streak.
    if (!dates.has(cursor.toISOString().slice(0, 10))) {
      cursor = new Date(cursor.getTime() - 86_400_000);
    }
    let streak = 0;
    while (dates.has(cursor.toISOString().slice(0, 10))) {
      streak += 1;
      cursor = new Date(cursor.getTime() - 86_400_000);
    }
    return streak;
  }

  /** A dense daily series so the chart shows real gaps as gaps. */
  private buildTrend(
    scores: Array<{ scoreDate: Date; overallScore: number }>,
    windowEnd: Date,
    days: number,
  ): Array<{ date: string; score: number | null }> {
    const byDate = new Map(
      scores.map((row) => [row.scoreDate.toISOString().slice(0, 10), row.overallScore]),
    );
    const series: Array<{ date: string; score: number | null }> = [];
    for (let offset = days - 1; offset >= 0; offset -= 1) {
      const day = new Date(windowEnd.getTime() - offset * 86_400_000);
      const key = day.toISOString().slice(0, 10);
      series.push({ date: key, score: byDate.get(key) ?? null });
    }
    return series;
  }

  private scopeLabel(
    user: AuthenticatedUser,
    scope: Awaited<ReturnType<typeof resolveScope>>,
    isHr: boolean,
    isManager: boolean,
  ): string {
    if (isHr) return 'Organisation';
    if (!isManager) return 'Your responses';
    if (scope.teamEmployeeIds.length > 0) {
      return `Your team (${scope.teamEmployeeIds.length} people)`;
    }
    return 'No team assigned';
  }
}

function nextDay(day: Date): Date {
  return new Date(day.getTime() + 86_400_000);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export const dashboardsService = new DashboardsService();
