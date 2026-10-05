import { z } from 'zod';

export const checkInIdParamSchema = z.object({ id: z.string().min(1) });

export const createCheckInSchema = z.object({
  /** Defaults to the current month, so the common case needs one field. */
  period: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'period must be formatted as YYYY-MM')
    .optional(),
  mood: z.coerce.number().int().min(1).max(5),
  energy: z.coerce.number().int().min(1).max(5).nullable().optional(),
  workload: z.coerce.number().int().min(1).max(5).nullable().optional(),
  note: z.string().trim().max(2000).nullable().optional(),
});

export const listCheckInsQuerySchema = z.object({
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  employeeId: z.string().min(1).optional(),
  departmentId: z.string().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const checkInSummaryQuerySchema = z.object({
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  departmentId: z.string().min(1).optional(),
});

export type CreateCheckInInput = z.infer<typeof createCheckInSchema>;
export type ListCheckInsQuery = z.infer<typeof listCheckInsQuerySchema>;
export type CheckInSummaryQuery = z.infer<typeof checkInSummaryQuerySchema>;
