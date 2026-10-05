import { NotFoundError } from '../../core/errors';
import { prisma } from '../../core/prisma';
import { employeeIdFilter } from '../../core/scope';
import type { AuthenticatedUser } from '../../types/express';
import type { ListScoresQuery, RecordScoreInput, TrendsQuery } from './engagement.schemas';

/** Returns the `YYYY-MM` keys for the last `months` periods, oldest first. */
function recentPeriods(months: number): string[] {
  const periods: string[] = [];
  const cursor = new Date();
  for (let i = months - 1; i >= 0; i -= 1) {
    const date = new Date(cursor.getFullYear(), cursor.getMonth() - i, 1);
    periods.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
  }
  return periods;
}

export class EngagementService {
  async recordScore(input: RecordScoreInput) {
    const employee = await prisma.employee.findUnique({
      where: { id: input.employeeId },
      select: { id: true },
    });
    if (!employee) throw new NotFoundError('Employee');

    // One score per employee per period: re-running a calculation overwrites.
    return prisma.engagementScore.upsert({
      where: { employeeId_period: { employeeId: input.employeeId, period: input.period } },
      create: input,
      update: input,
    });
  }

  async listForUser(user: AuthenticatedUser, query: ListScoresQuery) {
    const scopeFilter = await employeeIdFilter(user);

    return prisma.engagementScore.findMany({
      where: {
        ...(scopeFilter ?? {}),
        ...(query.period ? { period: query.period } : {}),
        ...(query.departmentId ? { employee: { departmentId: query.departmentId } } : {}),
      },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            jobTitle: true,
            department: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ period: 'desc' }, { overallScore: 'asc' }],
      take: query.limit,
    });
  }

  async getForEmployee(user: AuthenticatedUser, employeeId: string) {
    const scopeFilter = await employeeIdFilter(user, employeeId);
    const scores = await prisma.engagementScore.findMany({
      where: { ...(scopeFilter ?? {}) },
      include: { employee: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { period: 'desc' },
    });

    if (scores.length === 0) throw new NotFoundError('Engagement scores for this employee');
    return scores;
  }

  /**
   * Organisation or department level trend. Averages are computed in JS rather
   * than SQL so the same code path works on SQLite and PostgreSQL.
   */
  async trends(user: AuthenticatedUser, query: TrendsQuery) {
    const scopeFilter = await employeeIdFilter(user);
    const periods = recentPeriods(query.months);

    const scores = await prisma.engagementScore.findMany({
      where: {
        ...(scopeFilter ?? {}),
        period: { in: periods },
        ...(query.departmentId ? { employee: { departmentId: query.departmentId } } : {}),
      },
      select: {
        period: true,
        overallScore: true,
        eNps: true,
        workLifeBalance: true,
        growthOpportunity: true,
        managerEffectiveness: true,
        workloadBalance: true,
      },
    });

    const series = periods.map((period) => {
      const rows = scores.filter((score) => score.period === period);
      return {
        period,
        sampleSize: rows.length,
        overall: average(rows.map((row) => row.overallScore)),
        eNps: average(rows.map((row) => row.eNps).filter(isNumber)),
        workLifeBalance: average(rows.map((row) => row.workLifeBalance).filter(isNumber)),
        growthOpportunity: average(rows.map((row) => row.growthOpportunity).filter(isNumber)),
        managerEffectiveness: average(rows.map((row) => row.managerEffectiveness).filter(isNumber)),
        workloadBalance: average(rows.map((row) => row.workloadBalance).filter(isNumber)),
      };
    });

    return { months: query.months, series };
  }

  /** Latest score per employee, bucketed for the dashboard distribution chart. */
  async distribution(user: AuthenticatedUser) {
    const scopeFilter = await employeeIdFilter(user);

    const scores = await prisma.engagementScore.findMany({
      where: { ...(scopeFilter ?? {}) },
      distinct: ['employeeId'],
      orderBy: { period: 'desc' },
      select: { overallScore: true },
    });

    const buckets = [
      { label: '0-20', min: 0, max: 20 },
      { label: '21-40', min: 21, max: 40 },
      { label: '41-60', min: 41, max: 60 },
      { label: '61-80', min: 61, max: 80 },
      { label: '81-100', min: 81, max: 100 },
    ];

    return buckets.map((bucket) => ({
      label: bucket.label,
      count: scores.filter(
        (score) => score.overallScore >= bucket.min && score.overallScore <= bucket.max,
      ).length,
    }));
  }
}

function isNumber(value: number | null): value is number {
  return value !== null;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return Math.round((total / values.length) * 100) / 100;
}

export const engagementService = new EngagementService();
