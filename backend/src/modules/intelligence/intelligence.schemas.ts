import { z } from 'zod';
import {
  ACTIVITY_APPROVAL_STATUSES,
  ACTIVITY_SIGNAL_KEYS,
  ANALYTICS_LEVELS,
  ENGAGEMENT_FACTOR_KEYS,
  ENGAGEMENT_THEMES,
  SENTIMENT_CLASSES,
  SENTIMENT_SOURCES,
} from '../../core/enums';

/** `YYYY-MM`, validated rather than trusted from the query string. */
export const periodSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'period must be formatted as YYYY-MM');

const monthsSchema = z.coerce.number().int().min(1).max(24).default(6);

export const sentimentTrendsQuerySchema = z.object({
  months: monthsSchema,
  employeeId: z.string().min(1).optional(),
  source: z.enum(SENTIMENT_SOURCES).optional(),
});

export const themeTrendsQuerySchema = z.object({
  months: monthsSchema,
  employeeId: z.string().min(1).optional(),
});

export const engagementTrendsQuerySchema = z.object({
  months: monthsSchema,
  employeeId: z.string().min(1).optional(),
  level: z.enum(ANALYTICS_LEVELS).optional(),
});

export const breakdownQuerySchema = z.object({
  period: periodSchema.optional(),
  employeeId: z.string().min(1).optional(),
});

export const recentAnalysesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  source: z.enum(SENTIMENT_SOURCES).optional(),
  employeeId: z.string().min(1).optional(),
});

export const calculateQuerySchema = z.object({
  period: periodSchema.optional(),
  employeeId: z.string().min(1).optional(),
});

export const refreshSchema = z.object({
  period: periodSchema,
  reanalyze: z.coerce.boolean().default(false),
  limitPerSource: z.coerce.number().int().min(1).max(1000).optional(),
});

export const analyseRunSchema = z.object({
  sources: z.array(z.enum(SENTIMENT_SOURCES)).min(1).optional(),
  since: z.coerce.date().optional(),
  limitPerSource: z.coerce.number().int().min(1).max(1000).optional(),
  reanalyze: z.coerce.boolean().default(false),
});

/**
 * Factor configuration.
 *
 * Weights are relative, so they are validated to be positive but deliberately
 * *not* required to sum to 1: the calculator renormalises over the enabled set,
 * which lets an organisation add a fourth factor without rebalancing the rest.
 */
export const updateFactorConfigSchema = z
  .object({
    weight: z.coerce.number().min(0).max(1).optional(),
    enabled: z.coerce.boolean().optional(),
    description: z.string().max(500).optional(),
  })
  .refine((value) => value.weight !== undefined || value.enabled !== undefined || value.description !== undefined, {
    message: 'Provide at least one of weight, enabled or description',
  });

export const factorConfigParamSchema = z.object({
  factorKey: z.enum(ENGAGEMENT_FACTOR_KEYS),
});

export const recordSignalSchema = z.object({
  employeeId: z.string().min(1),
  period: periodSchema,
  signalKey: z.enum(ACTIVITY_SIGNAL_KEYS),
  value: z.coerce.number(),
  unit: z.string().max(24).default('count'),
  source: z.string().max(48).default('MANUAL'),
  note: z.string().max(500).optional(),
});

export const listSignalsQuerySchema = z.object({
  period: periodSchema.optional(),
  employeeId: z.string().min(1).optional(),
  approvalStatus: z.enum(ACTIVITY_APPROVAL_STATUSES).optional(),
});

/**
 * Signal approval. A signal must exist before it can be approved, and approval
 * records who approved it and when, so the audit trail shows the human decision
 * rather than only the resulting score.
 */
export const approveSignalSchema = z.object({
  status: z.enum(ACTIVITY_APPROVAL_STATUSES),
  note: z.string().max(500).optional(),
});

export const domainScoresQuerySchema = z.object({
  period: periodSchema.optional(),
  level: z.enum(ANALYTICS_LEVELS).optional(),
  employeeId: z.string().min(1).optional(),
});

export const signalKeyParamSchema = z.object({
  signalKey: z.enum(ACTIVITY_SIGNAL_KEYS),
});

export const signalParamSchema = z.object({
  signalId: z.string().min(1),
});

export const themeParamSchema = z.object({
  theme: z.enum(ENGAGEMENT_THEMES),
});

export const sentimentClassParamSchema = z.object({
  label: z.enum(SENTIMENT_CLASSES),
});

export const employeeParamSchema = z.object({
  employeeId: z.string().min(1),
});

export type SentimentTrendsQuery = z.infer<typeof sentimentTrendsQuerySchema>;
export type ThemeTrendsQuery = z.infer<typeof themeTrendsQuerySchema>;
export type EngagementTrendsQuery = z.infer<typeof engagementTrendsQuerySchema>;
export type BreakdownQuery = z.infer<typeof breakdownQuerySchema>;
export type RecentAnalysesQuery = z.infer<typeof recentAnalysesQuerySchema>;
export type CalculateQuery = z.infer<typeof calculateQuerySchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type AnalyseRunInput = z.infer<typeof analyseRunSchema>;
export type UpdateFactorConfigInput = z.infer<typeof updateFactorConfigSchema>;
export type RecordSignalInput = z.infer<typeof recordSignalSchema>;
export type ListSignalsQuery = z.infer<typeof listSignalsQuerySchema>;
export type ApproveSignalInput = z.infer<typeof approveSignalSchema>;
export type DomainScoresQuery = z.infer<typeof domainScoresQuerySchema>;
