import { NotFoundError, ServiceUnavailableError } from '../../core/errors';
import { prisma } from '../../core/prisma';
import { employeeIdFilter, resolveScope } from '../../core/scope';
import { roleHasPermission } from '../auth/permissions';
import { PERMISSIONS } from '../auth/permissions';
import { settingsService } from '../settings/settings.service';
import type { AuthenticatedUser } from '../../types/express';
import type {
  CheckInSummaryQuery,
  CreateCheckInInput,
  ListCheckInsQuery,
} from './check-ins.schemas';

/** `YYYY-MM` for the current month, matching the `EmployeeCheckIn.period` format. */
export function currentPeriod(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export class CheckInsService {
  /**
   * One check-in per employee per period. Re-submitting within the same month
   * is allowed and overwrites the earlier entry, so an employee can correct
   * themselves without accumulating duplicate signals.
   */
  async submit(user: AuthenticatedUser, input: CreateCheckInInput) {
    const privacy = await settingsService.getPrivacySettings();
    if (!privacy.checkInsEnabled) {
      throw new ServiceUnavailableError('Check-ins are currently disabled');
    }

    const employee = await prisma.employee.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!employee) {
      throw new NotFoundError('An employee record linked to this account');
    }

    const period = input.period ?? currentPeriod();

    return prisma.employeeCheckIn.upsert({
      where: { employeeId_period: { employeeId: employee.id, period } },
      create: {
        employeeId: employee.id,
        period,
        mood: input.mood,
        energy: input.energy ?? null,
        workload: input.workload ?? null,
        note: input.note ?? null,
      },
      update: {
        mood: input.mood,
        energy: input.energy ?? null,
        workload: input.workload ?? null,
        note: input.note ?? null,
      },
    });
  }

  /** The caller's own check-in history, newest first. */
  async myHistory(user: AuthenticatedUser) {
    const employee = await prisma.employee.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!employee) throw new NotFoundError('An employee record linked to this account');

    return prisma.employeeCheckIn.findMany({
      where: { employeeId: employee.id },
      orderBy: { period: 'desc' },
    });
  }

  async list(user: AuthenticatedUser, query: ListCheckInsQuery) {
    const scopeFilter = await employeeIdFilter(user, query.employeeId);

    const where = {
      ...(scopeFilter ?? {}),
      ...(query.period ? { period: query.period } : {}),
      ...(query.departmentId ? { employee: { departmentId: query.departmentId } } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.employeeCheckIn.findMany({
        where,
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              department: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: [{ period: 'desc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.employeeCheckIn.count({ where }),
    ]);

    // A manager without org-wide visibility must not see who said what, so
    // individual rows are only returned to callers who may read employees.
    const canIdentify = roleHasPermission(user.role, PERMISSIONS.EMPLOYEE_READ_ALL);

    return {
      items: items.map((item) => ({
        ...item,
        note: canIdentify ? item.note : null,
        employee: canIdentify ? item.employee : { id: item.employee.id, firstName: null, lastName: null },
      })),
      meta: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) },
    };
  }

  /**
   * Aggregate wellbeing view. Averages are withheld below the configured
   * privacy threshold so a small team cannot be inferred from an average.
   */
  async summary(user: AuthenticatedUser, query: CheckInSummaryQuery) {
    const privacy = await settingsService.getPrivacySettings();
    const scope = await resolveScope(user);
    const period = query.period ?? currentPeriod();

    const allowed = scope.canReadAll
      ? undefined
      : [...new Set([...scope.selfEmployeeIds, ...scope.teamEmployeeIds])];

    const checkIns = await prisma.employeeCheckIn.findMany({
      where: {
        period,
        ...(allowed ? { employeeId: { in: allowed } } : {}),
        ...(query.departmentId ? { employee: { departmentId: query.departmentId } } : {}),
      },
      select: { mood: true, energy: true, workload: true, employeeId: true },
    });

    const [mood, energy, workload] = await Promise.all([
      settingsService.aggregateRespectingPrivacy(
        checkIns.map((row) => row.mood),
        privacy.checkInMinimumGroupSize,
        average,
      ),
      settingsService.aggregateRespectingPrivacy(
        checkIns.filter((row) => row.energy !== null).map((row) => row.energy as number),
        privacy.checkInMinimumGroupSize,
        average,
      ),
      settingsService.aggregateRespectingPrivacy(
        checkIns.filter((row) => row.workload !== null).map((row) => row.workload as number),
        privacy.checkInMinimumGroupSize,
        average,
      ),
    ]);

    return {
      period,
      sampleSize: checkIns.length,
      minimumGroupSize: privacy.checkInMinimumGroupSize,
      suppressed: mood.suppressed,
      mood: mood.value,
      energy: energy.value,
      workload: workload.value,
    };
  }

  /** Whether the caller can still submit for the given period. */
  async status(user: AuthenticatedUser) {
    const privacy = await settingsService.getPrivacySettings();
    const period = currentPeriod();

    const employee = await prisma.employee.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });

    const existing = employee
      ? await prisma.employeeCheckIn.findUnique({
          where: { employeeId_period: { employeeId: employee.id, period } },
        })
      : null;

    return {
      period,
      enabled: privacy.checkInsEnabled,
      hasLinkedEmployeeRecord: Boolean(employee),
      alreadySubmitted: Boolean(existing),
    };
  }
}

function average(values: number[]): number {
  const total = values.reduce((sum, value) => sum + value, 0);
  return Math.round((total / values.length) * 100) / 100;
}

export const checkInsService = new CheckInsService();
