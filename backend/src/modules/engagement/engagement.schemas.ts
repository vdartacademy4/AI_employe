import { z } from 'zod';
import { SCORE_SOURCES } from '../../core/enums';

export const engagementIdParamSchema = z.object({ id: z.string().min(1) });
export const employeeIdParamSchema = z.object({ employeeId: z.string().min(1) });

export const recordScoreSchema = z.object({
  employeeId: z.string().min(1),
  period: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'period must be formatted as YYYY-MM'),
  overallScore: z.number().min(0).max(100),
  eNps: z.number().min(-100).max(100).nullable().optional(),
  workLifeBalance: z.number().min(0).max(100).nullable().optional(),
  growthOpportunity: z.number().min(0).max(100).nullable().optional(),
  managerEffectiveness: z.number().min(0).max(100).nullable().optional(),
  workloadBalance: z.number().min(0).max(100).nullable().optional(),
  source: z.enum(SCORE_SOURCES).default('SURVEY'),
  confidence: z.number().min(0).max(1).nullable().optional(),
});

export const listScoresQuerySchema = z.object({
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  departmentId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export const trendsQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(24).default(6),
  departmentId: z.string().min(1).optional(),
});

export type RecordScoreInput = z.infer<typeof recordScoreSchema>;
export type ListScoresQuery = z.infer<typeof listScoresQuerySchema>;
export type TrendsQuery = z.infer<typeof trendsQuerySchema>;
