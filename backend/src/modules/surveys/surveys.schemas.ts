import { z } from 'zod';
import {
  QUESTION_TYPES,
  SURVEY_AUDIENCES,
  SURVEY_STATUSES,
  SURVEY_TYPES,
} from '../../core/enums';

export const surveyIdParamSchema = z.object({ id: z.string().min(1) });

const questionSchema = z.object({
  prompt: z.string().trim().min(1).max(500),
  description: z.string().trim().max(500).nullable().optional(),
  type: z.enum(QUESTION_TYPES).default('LIKERT_5'),
  isRequired: z.boolean().default(true),
  options: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
  weight: z.number().min(0).max(10).default(1),
});

export const createSurveySchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  type: z.enum(SURVEY_TYPES).default('PULSE'),
  audience: z.enum(SURVEY_AUDIENCES).default('ALL'),
  isAnonymous: z.boolean().default(false),
  departmentId: z.string().min(1).nullable().optional(),
  opensAt: z.coerce.date().nullable().optional(),
  closesAt: z.coerce.date().nullable().optional(),
  questions: z.array(questionSchema).min(1, 'A survey needs at least one question'),
});

export const updateSurveySchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  audience: z.enum(SURVEY_AUDIENCES).optional(),
  isAnonymous: z.boolean().optional(),
  departmentId: z.string().min(1).nullable().optional(),
  opensAt: z.coerce.date().nullable().optional(),
  closesAt: z.coerce.date().nullable().optional(),
  questions: z.array(questionSchema).min(1).optional(),
});

export const changeSurveyStatusSchema = z.object({
  status: z.enum(SURVEY_STATUSES),
});

export const listSurveysQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(SURVEY_STATUSES).optional(),
  type: z.enum(SURVEY_TYPES).optional(),
  departmentId: z.string().min(1).optional(),
  search: z.string().trim().max(120).optional(),
});

export const answerSchema = z.object({
  questionId: z.string().min(1),
  valueText: z.string().trim().max(2000).nullable().optional(),
  valueNumber: z.number().nullable().optional(),
});

export const submitResponseSchema = z.object({
  surveyId: z.string().min(1),
  answers: z.array(answerSchema).min(1, 'At least one answer is required'),
  submit: z.boolean().default(true),
});

export type CreateSurveyInput = z.infer<typeof createSurveySchema>;
export type UpdateSurveyInput = z.infer<typeof updateSurveySchema>;
export type ListSurveysQuery = z.infer<typeof listSurveysQuerySchema>;
export type SubmitResponseInput = z.infer<typeof submitResponseSchema>;
export type QuestionInput = z.infer<typeof questionSchema>;
