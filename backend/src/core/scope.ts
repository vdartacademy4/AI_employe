import { ForbiddenError } from '../core/errors';
import { prisma } from '../core/prisma';
import { PERMISSIONS, roleHasPermission } from '../modules/auth/permissions';
import type { AuthenticatedUser } from '../types/express';

export interface DataScope {
  /** Restrict to the principal's own employee record. */
  selfEmployeeIds: string[];
  /** Employee ids the principal manages (direct reports, plus their reports). */
  teamEmployeeIds: string[];
  /** Department ids the principal is responsible for. */
  departmentIds: string[];
  /** Team ids the principal is responsible for, or holds a scoped Manager row for. */
  teamIds: string[];
  canReadAll: boolean;
  canWriteAll: boolean;
}

/**
 * Resolves what a principal may see.
 *
 * Roles decide *capability* (see `permissions.ts`); this resolves *row scope*.
 * Keeping the two separate means a Manager automatically gains access to a new
 * manager, a new department, or a new team member without any route changes.
 */
export async function resolveScope(user: AuthenticatedUser): Promise<DataScope> {
  const canReadAll = roleHasPermission(user.role, PERMISSIONS.EMPLOYEE_READ_ALL);
  const canWriteAll = roleHasPermission(user.role, PERMISSIONS.EMPLOYEE_WRITE);
  const canReadTeam = roleHasPermission(user.role, PERMISSIONS.EMPLOYEE_READ_TEAM);

  const [self, management] = await Promise.all([
    prisma.employee.findUnique({
      where: { userId: user.id },
      select: { id: true, departmentId: true },
    }),
    prisma.manager.findMany({
      where: { managerUserId: user.id, endedAt: null },
      select: { employeeId: true, departmentId: true, teamId: true, scope: true },
    }),
  ]);

  // `departmentIds` holds *department* ids. It previously accumulated employee
  // ids too, which made the two lists indistinguishable to every caller.
  const departmentIds = [
    ...new Set(
      management
        .map((record) => record.departmentId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  // `teamEmployeeIds` holds *employee* ids: direct reports explicitly, plus the
  // members of any department or team this principal is responsible for.
  const directReportIds = management
    .map((record) => record.employeeId)
    .filter((id): id is string => Boolean(id));

  const teamIds = [
    ...new Set(
      management.map((record) => record.teamId).filter((id): id is string => Boolean(id)),
    ),
  ];

  const departmentMemberIds =
    departmentIds.length > 0
      ? (
          await prisma.employee.findMany({
            where: { departmentId: { in: departmentIds }, status: { not: 'TERMINATED' } },
            select: { id: true },
          })
        ).map((member) => member.id)
      : [];

  // A Manager row scoped to a team grants access to that team's members only.
  // Without this a team lead would see every team in their department, because
  // department membership is the wider set.
  const teamMemberIds =
    teamIds.length > 0
      ? (
          await prisma.employee.findMany({
            where: { teamId: { in: teamIds }, status: { not: 'TERMINATED' } },
            select: { id: true },
          })
        ).map((member) => member.id)
      : [];

  const teamEmployeeIds = [
    ...new Set([...directReportIds, ...departmentMemberIds, ...teamMemberIds]),
  ];

  return {
    selfEmployeeIds: self ? [self.id] : [],
    // An employee-only role has no team scope even if a management record exists.
    teamEmployeeIds: canReadTeam ? teamEmployeeIds : [],
    departmentIds,
    teamIds,
    canReadAll,
    canWriteAll,
  };
}

/**
 * Builds a Prisma `employeeId` filter honouring the caller's scope. Returns
 * `undefined` when the principal may read every employee.
 *
 * A `requestedEmployeeId` narrows the scope; it never widens it. It is
 * intersected with the allowed set rather than replacing it, so asking for
 * someone else returns no rows instead of that person's data.
 */
export async function employeeIdFilter(
  user: AuthenticatedUser,
  requestedEmployeeId?: string,
): Promise<{ employeeId: { in: string[] } } | undefined> {
  const scope = await resolveScope(user);

  if (scope.canReadAll) {
    // Only then may a requested id narrow the result set.
    return requestedEmployeeId ? { employeeId: { in: [requestedEmployeeId] } } : undefined;
  }

  const allowed = [...new Set([...scope.selfEmployeeIds, ...scope.teamEmployeeIds])];
  if (requestedEmployeeId) {
    return { employeeId: { in: allowed.includes(requestedEmployeeId) ? [requestedEmployeeId] : [] } };
  }
  // An empty `in` list matches nothing, which is the correct "no access" answer.
  return { employeeId: { in: allowed } };
}

/** Throws unless the principal is allowed to see the given employee. */
export async function assertCanAccessEmployee(
  user: AuthenticatedUser,
  employeeId: string,
): Promise<void> {
  const scope = await resolveScope(user);
  const allowed = new Set([...scope.selfEmployeeIds, ...scope.teamEmployeeIds]);
  if (scope.canReadAll || allowed.has(employeeId)) return;

  throw new ForbiddenError('You are not allowed to access this employee');
}
