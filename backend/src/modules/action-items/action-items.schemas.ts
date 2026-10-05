import { z } from 'zod';
import { ACTION_ITEM_STATUSES, PRIORITIES } from '../../core/enums';

export const actionItemIdParamSchema = z.object({ id: z.string().min(1) });

export const createActionItemSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  priority: z.enum(PRIORITIES).default('MEDIUM'),
  status: z.enum(ACTION_ITEM_STATUSES).default('OPEN'),
  ownerId: z.string().min(1).nullable().optional(),
  alertId: z.string().min(1).nullable().optional(),
  dueDate: z.coerce.date().nullable().optional(),
});

export const updateActionItemSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  priority: z.enum(PRIORITIES).optional(),
  status: z.enum(ACTION_ITEM_STATUSES).optional(),
  ownerId: z.string().min(1).nullable().optional(),
  dueDate: z.coerce.date().nullable().optional(),
});

export const listActionItemsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(ACTION_ITEM_STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  ownerId: z.string().min(1).optional(),
  assignedToMe: z.coerce.boolean().default(false),
  overdue: z.coerce.boolean().default(false),
});

export type CreateActionItemInput = z.infer<typeof createActionItemSchema>;
export type UpdateActionItemInput = z.infer<typeof updateActionItemSchema>;
export type ListActionItemsQuery = z.infer<typeof listActionItemsQuerySchema>;
