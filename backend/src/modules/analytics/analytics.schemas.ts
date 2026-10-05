import { z } from 'zod';

export const overviewQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(24).default(6),
  departmentId: z.string().min(1).optional(),
  /**
   * Narrows the result set to one employee. It is intersected with the
   * caller's scope, so it can never widen access.
   */
  employeeId: z.string().min(1).optional(),
});

export type OverviewQuery = z.infer<typeof overviewQuerySchema>;
