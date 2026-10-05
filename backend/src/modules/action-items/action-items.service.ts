import { ForbiddenError, NotFoundError, ValidationError } from '../../core/errors';
import { prisma } from '../../core/prisma';
import { roleHasPermission } from '../auth/permissions';
import { PERMISSIONS } from '../auth/permissions';
import type { AuthenticatedUser } from '../../types/express';
import type {
  CreateActionItemInput,
  ListActionItemsQuery,
  UpdateActionItemInput,
} from './action-items.schemas';

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  OPEN: ['IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED'],
  IN_PROGRESS: ['BLOCKED', 'DONE', 'CANCELLED'],
  BLOCKED: ['IN_PROGRESS', 'CANCELLED'],
  DONE: ['IN_PROGRESS'],
  CANCELLED: ['OPEN'],
};

export class ActionItemsService {
  async list(user: AuthenticatedUser, query: ListActionItemsQuery) {
    const canReadAll = roleHasPermission(user.role, PERMISSIONS.ACTION_ITEM_READ_ALL);

    const where = {
      // Without org-wide read access you only ever see what you own, or what
      // hangs off an alert you are responsible for.
      ...(canReadAll
        ? {}
        : { OR: [{ ownerId: user.id }, { alert: { assignedToId: user.id } }] }),
      ...(query.status ? { status: query.status } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.ownerId ? { ownerId: query.ownerId } : {}),
      ...(query.assignedToMe ? { ownerId: user.id } : {}),
      ...(query.overdue
        ? { dueDate: { lt: new Date() }, status: { notIn: ['DONE', 'CANCELLED'] } }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.actionItem.findMany({
        where,
        include: {
          owner: { select: { id: true, firstName: true, lastName: true } },
          alert: { select: { id: true, title: true, severity: true, type: true } },
        },
        orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.actionItem.count({ where }),
    ]);

    return {
      items,
      meta: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) },
    };
  }

  async getById(user: AuthenticatedUser, id: string) {
    const item = await prisma.actionItem.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, firstName: true, lastName: true } },
        alert: { select: { id: true, title: true, severity: true, type: true, employeeId: true, assignedToId: true } },
      },
    });

    if (!item) throw new NotFoundError('Action item');
    if (!this.canRead(user, item)) {
      throw new ForbiddenError('You are not allowed to access this action item');
    }
    return item;
  }

  async create(user: AuthenticatedUser, input: CreateActionItemInput) {
    if (!roleHasPermission(user.role, PERMISSIONS.ACTION_ITEM_WRITE)) {
      throw new ForbiddenError('You are not allowed to create action items');
    }
    if (input.alertId) {
      const alert = await prisma.alert.findUnique({ where: { id: input.alertId } });
      if (!alert) throw new NotFoundError('Alert');
    }
    if (input.ownerId) {
      const owner = await prisma.user.findUnique({ where: { id: input.ownerId } });
      if (!owner) throw new NotFoundError('Owner');
    }

    return prisma.actionItem.create({
      // Default ownership to the creator so an item is never orphaned.
      data: { ...input, ownerId: input.ownerId ?? user.id },
    });
  }

  async update(user: AuthenticatedUser, id: string, input: UpdateActionItemInput) {
    const item = await prisma.actionItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundError('Action item');

    if (!this.canRead(user, item) || !roleHasPermission(user.role, PERMISSIONS.ACTION_ITEM_WRITE)) {
      throw new ForbiddenError('You are not allowed to update this action item');
    }

    if (input.status && !ALLOWED_TRANSITIONS[item.status]?.includes(input.status)) {
      throw new ValidationError(`Cannot move an action item from ${item.status} to ${input.status}`);
    }

    return prisma.actionItem.update({
      where: { id },
      data: {
        ...input,
        ...(input.status === 'DONE' ? { completedAt: new Date() } : {}),
        ...(input.status && input.status !== 'DONE' ? { completedAt: null } : {}),
      },
    });
  }

  async remove(user: AuthenticatedUser, id: string) {
    const item = await prisma.actionItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundError('Action item');

    if (item.ownerId !== user.id && !roleHasPermission(user.role, PERMISSIONS.ACTION_ITEM_READ_ALL)) {
      throw new ForbiddenError('You are not allowed to delete this action item');
    }
    await prisma.actionItem.delete({ where: { id } });
  }

  private canRead(
    user: AuthenticatedUser,
    item: { ownerId: string | null; alert?: { assignedToId: string | null } | null },
  ): boolean {
    if (roleHasPermission(user.role, PERMISSIONS.ACTION_ITEM_READ_ALL)) return true;
    if (item.ownerId === user.id) return true;
    return item.alert?.assignedToId === user.id;
  }
}

export const actionItemsService = new ActionItemsService();
