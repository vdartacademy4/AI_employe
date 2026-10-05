import { z } from 'zod';
import { CONVERSATION_KINDS } from '../../core/enums';

export const conversationIdParamSchema = z.object({ id: z.string().min(1) });

export const createConversationSchema = z.object({
  title: z.string().trim().min(1).max(200).default('New conversation'),
  kind: z.enum(CONVERSATION_KINDS).default('CHAT'),
  /** Opaque context handles, e.g. `{ employeeId, departmentId }`. */
  context: z.record(z.unknown()).optional(),
});

export const updateConversationSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  isArchived: z.boolean().optional(),
});

export const sendMessageSchema = z.object({
  content: z.string().trim().min(1).max(10_000),
});

export const listConversationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  kind: z.enum(CONVERSATION_KINDS).optional(),
  includeArchived: z.coerce.boolean().default(false),
});

export const analyzeSentimentSchema = z.object({
  texts: z.array(z.string().trim().min(1).max(5000)).min(1).max(50),
});

export const summarizeSchema = z.object({
  content: z.string().trim().min(1).max(50_000),
  maxWords: z.coerce.number().int().min(20).max(500).default(120),
});

export type CreateConversationInput = z.infer<typeof createConversationSchema>;
export type UpdateConversationInput = z.infer<typeof updateConversationSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type ListConversationsQuery = z.infer<typeof listConversationsQuerySchema>;
export type AnalyzeSentimentInput = z.infer<typeof analyzeSentimentSchema>;
export type SummarizeInput = z.infer<typeof summarizeSchema>;
