import { z } from 'zod';
import { DAILY_ANSWER_TYPES, QUESTION_TOPICS } from '../../core/enums';

const answerSchema = z
  .object({
    questionId: z.string().min(1),
    /** RATING: 1-5. YES_NO: coerced to 1/0. */
    numericValue: z.number().min(0).max(5).optional(),
    textValue: z.string().trim().max(2000).optional(),
    selectedOptions: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
  })
  .refine(
    (value) =>
      value.numericValue !== undefined || value.textValue !== undefined || value.selectedOptions !== undefined,
    { message: 'Each answer must include a value' },
  );

/**
 * The daily submission. Exactly one request per day unless HR has enabled
 * resubmission; the service enforces that against stored state rather than
 * trusting a client flag.
 */
export const submitDailySchema = z.object({
  /** Defaults to today, UTC. */
  responseDate: z.coerce.date().optional(),
  answers: z.array(answerSchema).min(1).max(10),
  /** Optional written feedback submitted alongside the questions. */
  writtenFeedback: z.object({
    category: z.string().trim().min(2).max(60),
    content: z.string().trim().min(3).max(5000),
  }),
  /**
   * Separate opt-in for anonymous text. Kept distinct from the written
   * feedback object so the two tables are written independently and an
   * anonymous submission is never stored alongside attributed text by
   * accident.
   */
  anonymousFeedback: z
    .object({
      category: z.string().trim().min(2).max(60),
      content: z.string().trim().min(3).max(5000),
    })
    .optional(),
});

export type SubmitDailyInput = z.infer<typeof submitDailySchema>;

const questionFields = {
  prompt: z.string().trim().min(5).max(500),
  answerType: z.enum(DAILY_ANSWER_TYPES).default('RATING'),
  options: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
  helpText: z.string().trim().max(500).optional(),
  position: z.number().int().min(1).max(5),
  /**
   * Which subject the question probes. Recorded on pool rows so HR's fallback
   * bank has the same rotation metadata the generator assigns to its own picks.
   */
  theme: z.enum(QUESTION_TOPICS).optional(),
  isActive: z.boolean().default(true),
};

export const createQuestionSchema = z.object(questionFields);
export const updateQuestionSchema = z.object({
  prompt: questionFields.prompt.optional(),
  answerType: questionFields.answerType.optional(),
  options: questionFields.options,
  helpText: questionFields.helpText,
  position: questionFields.position.optional(),
  theme: questionFields.theme,
  isActive: z.boolean().optional(),
});
export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>;

export const updatePulseConfigSchema = z.object({
  allowResubmission: z.boolean().optional(),
  isActive: z.boolean().optional(),
});
export type UpdatePulseConfigInput = z.infer<typeof updatePulseConfigSchema>;

export const listFeedbackQuerySchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  departmentId: z.string().optional(),
  teamId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type ListFeedbackQuery = z.infer<typeof listFeedbackQuerySchema>;

/** `?date=YYYY-MM-DD`, defaulting to today. Shared by the set and response views. */
export const dateQuerySchema = z.object({
  date: z.coerce.date().optional(),
});
export type DateQuery = z.infer<typeof dateQuerySchema>;

/** `?limit=N` for the recent-sets list, newest first. */
export const listQuestionSetsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(60).default(14),
});
export type ListQuestionSetsQuery = z.infer<typeof listQuestionSetsQuerySchema>;
