import { prisma } from '../../core/prisma';
import { employeeIdFilter, resolveScope, type DataScope } from '../../core/scope';
import { roleHasPermission } from '../auth/permissions';
import { PERMISSIONS } from '../auth/permissions';
import type { AuthenticatedUser } from '../../types/express';
import type { OverviewQuery } from './analytics.schemas';

/**
 * Read-only aggregation surface for dashboards and charts. Every figure is
 * computed from live rows, so an empty database yields zeros rather than
 * invented numbers.
 */
export class AnalyticsService {
  /** Headline counters for the dashboard, filtered to the caller's scope. */
  async overview(user: AuthenticatedUser, query: OverviewQuery) {
    // Two shapes from the same scope: `Employee` is keyed by `id`, whereas
    // child tables such as `Alert` carry an `employeeId` foreign key. Using the
    // child shape against `Employee` silently matched nothing.
    const childScope = await employeeIdFilter(user);
    const scope = await resolveScope(user);
    const requested = query.employeeId;
    // Undefined means "no restriction", which `prisma.employee.count` needs
    // rather than an id list.
    const employeeScope =
      scope.canReadAll && !requested
        ? undefined
        : { id: { in: allowedEmployeeIds(scope, requested) } };

    const [employees, openAlerts, openSurveys, openActionItems, submissions] = await Promise.all([
      prisma.employee.count({
        where: {
          deletedAt: null,
          ...(employeeScope ?? {}),
          ...(query.departmentId ? { departmentId: query.departmentId } : {}),
        },
      }),
      prisma.alert.count({
        where: {
          status: { in: ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS'] },
          ...(childScope ?? {}),
        },
      }),
      prisma.survey.count({ where: { status: 'OPEN', deletedAt: null } }),
      prisma.actionItem.count({
        where: { status: { in: ['OPEN', 'IN_PROGRESS', 'BLOCKED'] }, ownerId: user.id },
      }),
      prisma.surveyResponse.count({ where: { status: 'SUBMITTED' } }),
    ]);

    return {
      employees,
      openAlerts,
      openSurveys,
      openActionItems,
      submittedResponses: submissions,
      generatedAt: new Date(),
    };
  }

  /** Per-department roll-up. Requires organisation-wide read access. */
  async byDepartment(user: AuthenticatedUser) {
    if (!roleHasPermission(user.role, PERMISSIONS.ANALYTICS_READ_ORG)) {
      return { departments: [], available: false };
    }

    const departments = await prisma.department.findMany({
      where: { isActive: true },
      select: { id: true, name: true, code: true },
    });

    const rows = await Promise.all(
      departments.map(async (department) => {
        const [headcount, scores, risks, alerts] = await Promise.all([
          prisma.employee.count({ where: { departmentId: department.id, status: 'ACTIVE', deletedAt: null } }),
          prisma.engagementScore.findMany({
            where: { employee: { departmentId: department.id } },
            select: { overallScore: true, eNps: true },
          }),
          prisma.riskPrediction.groupBy({
            by: ['riskLevel'],
            where: { employee: { departmentId: department.id } },
            _count: { _all: true },
          }),
          prisma.alert.count({
            where: { employee: { departmentId: department.id }, status: { in: ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS'] } },
          }),
        ]);

        const overall = scores.length
          ? scores.reduce((sum, score) => sum + score.overallScore, 0) / scores.length
          : null;
        const enpsValues = scores
          .map((score) => score.eNps)
          .filter((value): value is number => value !== null);
        const eNps = enpsValues.length
          ? enpsValues.reduce((sum, value) => sum + value, 0) / enpsValues.length
          : null;

        return {
          departmentId: department.id,
          name: department.name,
          code: department.code,
          headcount,
          averageEngagement: overall === null ? null : round(overall),
          eNps: eNps === null ? null : round(eNps),
          riskLevels: Object.fromEntries(risks.map((row) => [row.riskLevel, row._count._all])),
          openAlerts: alerts,
        };
      }),
    );

    return { departments: rows, available: true };
  }

  /** Headcount and tenure shape, for the people-analytics view. */
  async headcount() {
    const employees = await prisma.employee.findMany({
      where: { deletedAt: null },
      select: { hireDate: true, terminationDate: true, status: true, employmentType: true },
    });

    const now = Date.now();
    const tenureBuckets = [
      { label: '< 1 year', min: 0, max: 12 },
      { label: '1-2 years', min: 12, max: 24 },
      { label: '2-5 years', min: 24, max: 60 },
      { label: '5+ years', min: 60, max: Number.POSITIVE_INFINITY },
    ];

    const tenures = employees
      .filter((employee) => employee.hireDate)
      .map((employee) => (now - new Date(employee.hireDate!).getTime()) / (30 * 86_400_000));

    return {
      total: employees.length,
      active: employees.filter((employee) => employee.status === 'ACTIVE').length,
      terminated: employees.filter((employee) => employee.status === 'TERMINATED').length,
      tenureDistribution: tenureBuckets.map((bucket) => ({
        label: bucket.label,
        count: tenures.filter((months) => months >= bucket.min && months < bucket.max).length,
      })),
      byEmploymentType: employees.reduce<Record<string, number>>((acc, employee) => {
        acc[employee.employmentType] = (acc[employee.employmentType] ?? 0) + 1;
        return acc;
      }, {}),
    };
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * The employee ids a principal may see, optionally narrowed to one.
 * A requested id outside the scope yields an empty list, i.e. no access.
 */
function allowedEmployeeIds(scope: DataScope, requestedEmployeeId?: string): string[] {
  if (scope.canReadAll) return requestedEmployeeId ? [requestedEmployeeId] : [];
  const allowed = [...new Set([...scope.selfEmployeeIds, ...scope.teamEmployeeIds])];
  if (!requestedEmployeeId) return allowed;
  return allowed.includes(requestedEmployeeId) ? [requestedEmployeeId] : [];
}

export const analyticsService = new AnalyticsService();
