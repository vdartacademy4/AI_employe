import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../core/errors';
import { prisma } from '../../core/prisma';
import { employeeIdFilter, resolveScope } from '../../core/scope';
import { roleHasPermission } from '../auth/permissions';
import { PERMISSIONS } from '../auth/permissions';
import type { AuthenticatedUser } from '../../types/express';
import type {
  AssignManagerInput,
  CreateEmployeeInput,
  ListEmployeesQuery,
  UpdateEmployeeInput,
} from './employees.schemas';

export class EmployeesService {
  /**
   * Lists employees inside the caller's data scope. A Manager without
   * `employee:read-all` only ever sees their own record and their reports.
   */
  async list(user: AuthenticatedUser, query: ListEmployeesQuery) {
    const scope = await resolveScope(user);

    const scopeFilter = scope.canReadAll
      ? {}
      : { id: { in: [...new Set([...scope.selfEmployeeIds, ...scope.teamEmployeeIds])] } };

    const where = {
      ...scopeFilter,
      deletedAt: null,
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.employmentType ? { employmentType: query.employmentType } : {}),
      ...(query.search
        ? {
            OR: [
              { firstName: { contains: query.search } },
              { lastName: { contains: query.search } },
              { email: { contains: query.search } },
              { employeeNumber: { contains: query.search } },
              { jobTitle: { contains: query.search } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.employee.findMany({
        where,
        select: {
          id: true,
          employeeNumber: true,
          firstName: true,
          lastName: true,
          email: true,
          jobTitle: true,
          status: true,
          employmentType: true,
          hireDate: true,
          departmentId: true,
          department: { select: { id: true, name: true, code: true } },
          user: { select: { id: true, role: true } },
        },
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.employee.count({ where }),
    ]);

    return {
      items,
      meta: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) },
    };
  }

  async getById(user: AuthenticatedUser, id: string) {
    const employee = await prisma.employee.findFirst({
      where: { id, deletedAt: null },
      include: {
        department: { select: { id: true, name: true, code: true } },
        user: { select: { id: true, email: true, role: true, status: true, isActive: true } },
        _count: { select: { directReports: true, feedbackReceived: true } },
      },
    });

    if (!employee) throw new NotFoundError('Employee');

    const scope = await resolveScope(user);
    const allowed = new Set([...scope.selfEmployeeIds, ...scope.teamEmployeeIds]);
    if (!scope.canReadAll && !allowed.has(employee.id)) {
      throw new ForbiddenError('You are not allowed to access this employee');
    }

    return employee;
  }

  /** The signed-in user's own employee record. */
  async getOwnProfile(user: AuthenticatedUser) {
    const employee = await prisma.employee.findUnique({
      where: { userId: user.id },
      include: {
        department: { select: { id: true, name: true, code: true } },
        headedDepartments: { select: { id: true, name: true, code: true } },
        _count: { select: { directReports: true } },
      },
    });

    if (!employee) {
      throw new NotFoundError('Employee profile linked to this account');
    }
    return employee;
  }

  async create(input: CreateEmployeeInput) {
    const existing = await prisma.employee.findFirst({
      where: { OR: [{ email: input.email }, { employeeNumber: input.employeeNumber }] },
    });
    if (existing) {
      throw new ConflictError('An employee with this email or employee number already exists');
    }

    return prisma.employee.create({ data: input });
  }

  async update(id: string, input: UpdateEmployeeInput) {
    const employee = await prisma.employee.findUnique({ where: { id } });
    if (!employee) throw new NotFoundError('Employee');

    if (input.email && input.email !== employee.email) {
      const clash = await prisma.employee.findUnique({ where: { email: input.email } });
      if (clash) throw new ConflictError('An employee with this email already exists');
    }

    return prisma.employee.update({ where: { id }, data: input });
  }

  async remove(id: string) {
    const employee = await prisma.employee.findUnique({ where: { id } });
    if (!employee) throw new NotFoundError('Employee');
    // Soft delete: engagement history must survive a leaver for attrition analysis.
    await prisma.employee.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'TERMINATED' },
    });
  }

  // -------------------------------------------------------------------------
  // Management scope
  // -------------------------------------------------------------------------

  async listManagers(query: {
    departmentId?: string;
    employeeId?: string;
    includeEnded: boolean;
  }) {
    return prisma.manager.findMany({
      where: {
        ...(query.includeEnded ? {} : { endedAt: null }),
        ...(query.departmentId ? { departmentId: query.departmentId } : {}),
        ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      },
      include: {
        managerUser: { select: { id: true, email: true, firstName: true, lastName: true, role: true } },
        employee: { select: { id: true, firstName: true, lastName: true, jobTitle: true } },
        department: { select: { id: true, name: true, code: true } },
      },
      orderBy: { isPrimary: 'desc' },
    });
  }

  async assignManager(input: AssignManagerInput) {
    if (!input.employeeId && !input.departmentId) {
      throw new ValidationError('A manager assignment needs an employeeId, a departmentId, or both');
    }

    const [managerUser, employee, department] = await Promise.all([
      prisma.user.findUnique({ where: { id: input.managerUserId } }),
      input.employeeId ? prisma.employee.findUnique({ where: { id: input.employeeId } }) : null,
      input.departmentId ? prisma.department.findUnique({ where: { id: input.departmentId } }) : null,
    ]);

    if (!managerUser) throw new NotFoundError('Manager user');
    if (!managerUser.isActive) throw new ValidationError('The manager account is not active');
    if (!roleHasPermission(managerUser.role, PERMISSIONS.EMPLOYEE_READ_TEAM)) {
      throw new ValidationError(
        `Role ${managerUser.role} cannot hold a management assignment`,
        { role: managerUser.role },
      );
    }
    if (input.employeeId && !employee) throw new NotFoundError('Employee');
    if (input.departmentId && !department) throw new NotFoundError('Department');

    return prisma.manager.create({ data: input });
  }

  async endManagerAssignment(id: string) {
    const assignment = await prisma.manager.findUnique({ where: { id } });
    if (!assignment) throw new NotFoundError('Manager assignment');
    return prisma.manager.update({ where: { id }, data: { endedAt: new Date() } });
  }

  /** Employees visible to the caller, as a flat id list (used by other modules). */
  async visibleEmployeeIds(user: AuthenticatedUser): Promise<string[] | null> {
    const filter = await employeeIdFilter(user);
    if (!filter) return null;
    return filter.employeeId.in;
  }
}

export const employeesService = new EmployeesService();
