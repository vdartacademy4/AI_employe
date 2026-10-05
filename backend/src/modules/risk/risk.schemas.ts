import { z } from 'zod';
import { RISK_LEVELS } from '../../core/enums';

export const riskIdParamSchema = z.object({ id: z.string().min(1) });

export const listRiskQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  riskLevel: z.enum(RISK_LEVELS).optional(),
  departmentId: z.string().min(1).optional(),
  employeeId: z.string().min(1).optional(),
});

export const runRiskModelSchema = z.object({
  departmentId: z.string().min(1).nullable().optional(),
  horizonDays: z.coerce.number().int().min(7).max(365).default(90),
  modelVersion: z.string().trim().min(1).max(50).default('heuristic-v1'),
});

export type ListRiskQuery = z.infer<typeof listRiskQuerySchema>;
export type RunRiskModelInput = z.infer<typeof runRiskModelSchema>;
