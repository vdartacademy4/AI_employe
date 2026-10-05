import { ForbiddenError, NotFoundError, ValidationError } from '../../core/errors';
import { prisma } from '../../core/prisma';
import { resolveScope } from '../../core/scope';
import { roleHasPermission } from '../auth/permissions';
import { PERMISSIONS } from '../auth/permissions';
import type { AuthenticatedUser } from '../../types/express';
import type { CreateAlertInput, ListAlertsQuery, UpdateAlertInput } from './alerts.schemas';

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  OPEN: ['ACKNOWLEDGED', 'IN_PROGRESS', 'DISMISSED', 'RESOLVED'],
  ACKNOWLEDGED: ['IN_PROGRESS', 'RESOLVED', 'DISMISSED'],
  IN_PROGRESS: ['RESOLVED', 'DISMISSED'],
  RESOLVED: ['OPEN'],
  DISMISSED: ['OPEN'],
};

export class AlertsService {
  async list(user: AuthenticatedUser, query: ListAlertsQuery) {
    const scope = await resolveScope(user);
    const canReadAll = roleHasPermission(user.role, PERMISSIONS.ALERT_READ_ALL);

    let employeeFilter: { employeeId: { in: string[] } | null } | undefined;
    if (!canReadAll) {
      const visible = [...new Set([...scope.selfEmployeeIds, ...scope.teamEmployeeIds])];
      // Unassigned, org-wide alerts stay visible to every authenticated user.
      employeeFilter = { employeeId: { in: visible } };
    }

    const where = {
      ...(employeeFilter ?? {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.severity ? { severity: query.severity } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.assignedToMe ? { assignedToId: user.id } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.alert.findMany({
        where,
        include: {
          employee: {
            select: { id: true, firstName: true, lastName: true, department: { select: { id: true, name: true } } },
          },
          assignedTo: { select: { id: true, firstName: true, lastName: true } },
          _count: { select: { actionItems: true } },
        },
        orderBy: [{ severity: 'asc' }, { triggeredAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.alert.count({ where }),
    ]);

    return {
      items,
      meta: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) },
    };
  }

  async getById(user: AuthenticatedUser, id: string) {
    const alert = await prisma.alert.findUnique({
      where: { id },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, department: { select: { name: true } } } },
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
        actionItems: true,
      },
    });

    if (!alert) throw new NotFoundError('Alert');
    await this.assertCanRead(user, alert.employeeId);
    return alert;
  }

  async create(user: AuthenticatedUser, input: CreateAlertInput) {
    if (input.employeeId) {
      const employee = await prisma.employee.findUnique({ where: { id: input.employeeId } });
      if (!employee) throw new NotFoundError('Employee');
    }

    return prisma.alert.create({
      data: {
        type: input.type,
        severity: input.severity,
        title: input.title,
        message: input.message,
        employeeId: input.employeeId ?? null,
        assignedToId: input.assignedToId ?? null,
        createdById: user.id,
      },
    });
  }

  async update(user: AuthenticatedUser, id: string, input: UpdateAlertInput) {
    const alert = await prisma.alert.findUnique({ where: { id } });
    if (!alert) throw new NotFoundError('Alert');

    if (input.status && !ALLOWED_TRANSITIONS[alert.status]?.includes(input.status)) {
      throw new ValidationError(`Cannot move an alert from ${alert.status} to ${input.status}`);
    }

    const isAssignee = alert.assignedToId === user.id;
    const canModerate = roleHasPermission(user.role, PERMISSIONS.ALERT_WRITE);
    if (!isAssignee && !canModerate) {
      throw new ForbiddenError('Only the assignee or an alert administrator can change this alert');
    }

    return prisma.alert.update({
      where: { id },
      data: {
        ...input,
        ...(input.status === 'ACKNOWLEDGED' ? { acknowledgedAt: new Date() } : {}),
        ...(input.status === 'RESOLVED' ? { resolvedAt: new Date() } : {}),
      },
    });
  }

  async remove(user: AuthenticatedUser, id: string) {
    const alert = await prisma.alert.findUnique({ where: { id } });
    if (!alert) throw new NotFoundError('Alert');

    if (!roleHasPermission(user.role, PERMISSIONS.ALERT_WRITE)) {
      throw new ForbiddenError('You are not allowed to delete alerts');
    }
    await prisma.alert.delete({ where: { id } });
  }

  /** Severity roll-up for the dashboard header, scoped to the caller. */
  async counts(user: AuthenticatedUser) {
    const scope = await resolveScope(user);
    const canReadAll = roleHasPermission(user.role, PERMISSIONS.ALERT_READ_ALL);

    const rows = await prisma.alert.groupBy({
      by: ['severity', 'status'],
      where: canReadAll ? {} : { employeeId: { in: [...new Set([...scope.selfEmployeeIds, ...scope.teamEmployeeIds])] } },
      _count: { _all: true },
    });

    return rows.map((row) => ({ severity: row.severity, status: row.status, count: row._count._all }));
  }

  private async assertCanRead(user: AuthenticatedUser, employeeId: string | null): Promise<void> {
    if (roleHasPermission(user.role, PERMISSIONS.ALERT_READ_ALL)) return;

    // Org-level alerts (no employee attached) are readable by any signed-in user.
    if (!employeeId) return;

    const scope = await resolveScope(user);
    const allowed = new Set([...scope.selfEmployeeIds, ...scope.teamEmployeeIds]);
    if (!allowed.has(employeeId)) {
      throw new ForbiddenError('You are not allowed to access this alert');
    }
  }
}

export const alertsService = new AlertsService();
