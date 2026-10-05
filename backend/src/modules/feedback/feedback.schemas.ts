import { z } from 'zod';
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_CHANNELS,
  FEEDBACK_STATUSES,
  FEEDBACK_VISIBILITIES,
  SENTIMENT_LABELS,
} from '../../core/enums';

export const feedbackIdParamSchema = z.object({ id: z.string().min(1) });

export const createFeedbackSchema = z.object({
  title: z.string().trim().max(200).nullable().optional(),
  content: z.string().trim().min(3).max(5000),
  category: z.enum(FEEDBACK_CATEGORIES).default('GENERAL'),
  channel: z.enum(FEEDBACK_CHANNELS).default('PORTAL'),
  visibility: z.enum(FEEDBACK_VISIBILITIES).default('HR_ONLY'),
  isAnonymous: z.boolean().default(false),
  recipientId: z.string().min(1).nullable().optional(),
});

export const updateFeedbackSchema = z.object({
  status: z.enum(FEEDBACK_STATUSES).optional(),
  category: z.enum(FEEDBACK_CATEGORIES).optional(),
  sentiment: z.enum(SENTIMENT_LABELS).nullable().optional(),
  aiSummary: z.string().trim().max(2000).nullable().optional(),
});

export const listFeedbackQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(FEEDBACK_STATUSES).optional(),
  category: z.enum(FEEDBACK_CATEGORIES).optional(),
  sentiment: z.enum(SENTIMENT_LABELS).optional(),
  search: z.string().trim().max(120).optional(),
});

export type CreateFeedbackInput = z.infer<typeof createFeedbackSchema>;
export type UpdateFeedbackInput = z.infer<typeof updateFeedbackSchema>;
export type ListFeedbackQuery = z.infer<typeof listFeedbackQuerySchema>;
