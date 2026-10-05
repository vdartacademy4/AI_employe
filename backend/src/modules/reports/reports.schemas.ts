import { z } from 'zod';
import { REPORT_FORMATS, REPORT_STATUSES, REPORT_TYPES } from '../../core/enums';

export const reportIdParamSchema = z.object({ id: z.string().min(1) });

export const generateReportSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  type: z.enum(REPORT_TYPES),
  format: z.enum(REPORT_FORMATS).default('JSON'),
  scheduledFor: z.coerce.date().nullable().optional(),
});

export const listReportsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(REPORT_STATUSES).optional(),
  type: z.enum(REPORT_TYPES).optional(),
});

export type GenerateReportInput = z.infer<typeof generateReportSchema>;
export type ListReportsQuery = z.infer<typeof listReportsQuerySchema>;
