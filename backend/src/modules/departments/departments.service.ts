import { ConflictError, NotFoundError, ValidationError } from '../../core/errors';
import { prisma } from '../../core/prisma';
import type {
  CreateDepartmentInput,
  ListDepartmentsQuery,
  UpdateDepartmentInput,
} from './departments.schemas';

export class DepartmentsService {
  async list(query: ListDepartmentsQuery) {
    const departments = await prisma.department.findMany({
      where: {
        ...(query.includeInactive ? {} : { isActive: true }),
        ...(query.parentId ? { parentId: query.parentId } : {}),
        ...(query.search ? { name: { contains: query.search } } : {}),
      },
      include: {
        _count: { select: { employees: true, children: true } },
      },
      orderBy: { name: 'asc' },
    });
    return departments;
  }

  async getById(id: string) {
    const department = await prisma.department.findUnique({
      where: { id },
      include: {
        parent: { select: { id: true, name: true, code: true } },
        head: { select: { id: true, firstName: true, lastName: true, jobTitle: true } },
        _count: { select: { employees: true, children: true } },
      },
    });

    if (!department) throw new NotFoundError('Department');
    return department;
  }

  /** Full ancestor chain, useful for roll-up reporting. */
  async getHierarchy(): Promise<NestedDepartment[]> {
    const departments = await prisma.department.findMany({
      where: { isActive: true },
      include: {
        head: { select: { id: true, firstName: true, lastName: true, jobTitle: true } },
        _count: { select: { employees: true } },
      },
      orderBy: { name: 'asc' },
    });

    type Flat = (typeof departments)[number];
    const byId = new Map<string, Flat & { children: NestedDepartment[] }>();
    for (const department of departments) {
      byId.set(department.id, { ...department, children: [] });
    }

    const roots: NestedDepartment[] = [];
    for (const node of byId.values()) {
      const parentId = (node as Flat).parentId;
      if (parentId && byId.has(parentId)) {
        byId.get(parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }

  async create(input: CreateDepartmentInput) {
    await this.assertParentIsUsable(input.parentId);

    const existing = await prisma.department.findUnique({ where: { code: input.code } });
    if (existing) throw new ConflictError('A department with this code already exists');

    return prisma.department.create({
      data: {
        name: input.name,
        code: input.code,
        description: input.description ?? null,
        parentId: input.parentId ?? null,
        headId: input.headId ?? null,
      },
    });
  }

  async update(id: string, input: UpdateDepartmentInput) {
    const department = await prisma.department.findUnique({ where: { id } });
    if (!department) throw new NotFoundError('Department');

    if (input.code && input.code !== department.code) {
      const clash = await prisma.department.findUnique({ where: { code: input.code } });
      if (clash) throw new ConflictError('A department with this code already exists');
    }

    if (input.parentId !== undefined && input.parentId !== null) {
      if (input.parentId === id) {
        throw new ValidationError('A department cannot be its own parent');
      }
      await this.assertParentIsUsable(input.parentId);
      if (await this.wouldCreateCycle(id, input.parentId)) {
        throw new ValidationError('This change would create a circular department hierarchy');
      }
    }

    return prisma.department.update({ where: { id }, data: input });
  }

  async remove(id: string) {
    const department = await prisma.department.findUnique({
      where: { id },
      include: { _count: { select: { employees: true, children: true } } },
    });
    if (!department) throw new NotFoundError('Department');

    if (department._count.employees > 0) {
      throw new ValidationError(
        'Reassign or remove the department members before deleting it',
        { employeeCount: department._count.employees },
      );
    }
    if (department._count.children > 0) {
      throw new ValidationError('Remove or re-parent the child departments first');
    }

    await prisma.department.delete({ where: { id } });
  }

  private async assertParentIsUsable(parentId: string | null | undefined): Promise<void> {
    if (!parentId) return;
    const parent = await prisma.department.findUnique({ where: { id: parentId } });
    if (!parent) throw new NotFoundError('Parent department');
  }

  private async wouldCreateCycle(id: string, parentId: string): Promise<boolean> {
    let cursor: string | null = parentId;
    const seen = new Set<string>();

    while (cursor) {
      if (cursor === id) return true;
      if (seen.has(cursor)) return true;
      seen.add(cursor);
      const parent: { parentId: string | null } | null = await prisma.department.findUnique({
        where: { id: cursor },
        select: { parentId: true },
      });
      cursor = parent?.parentId ?? null;
    }
    return false;
  }
}

export interface NestedDepartment {
  id: string;
  name: string;
  code: string;
  description: string | null;
  parentId: string | null;
  headId: string | null;
  head: { id: string; firstName: string; lastName: string; jobTitle: string | null } | null;
  isActive: boolean;
  _count: { employees: number };
  children: NestedDepartment[];
}

export const departmentsService = new DepartmentsService();
