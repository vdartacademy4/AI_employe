import { z } from 'zod';
import { ALERT_SEVERITIES, ALERT_STATUSES, ALERT_TYPES } from '../../core/enums';

export const alertIdParamSchema = z.object({ id: z.string().min(1) });

export const listAlertsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(ALERT_STATUSES).optional(),
  severity: z.enum(ALERT_SEVERITIES).optional(),
  type: z.enum(ALERT_TYPES).optional(),
  assignedToMe: z.coerce.boolean().default(false),
});

export const createAlertSchema = z.object({
  type: z.enum(ALERT_TYPES),
  severity: z.enum(ALERT_SEVERITIES).default('INFO'),
  title: z.string().trim().min(3).max(200),
  message: z.string().trim().min(3).max(2000),
  employeeId: z.string().min(1).nullable().optional(),
  assignedToId: z.string().min(1).nullable().optional(),
});

export const updateAlertSchema = z.object({
  status: z.enum(ALERT_STATUSES).optional(),
  severity: z.enum(ALERT_SEVERITIES).optional(),
  assignedToId: z.string().min(1).nullable().optional(),
});

export type ListAlertsQuery = z.infer<typeof listAlertsQuerySchema>;
export type CreateAlertInput = z.infer<typeof createAlertSchema>;
export type UpdateAlertInput = z.infer<typeof updateAlertSchema>;
