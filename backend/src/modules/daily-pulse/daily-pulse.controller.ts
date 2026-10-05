import type { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../core/async-handler';
import { prisma } from '../../core/prisma';
import {
  createQuestionSchema,
  dateQuerySchema,
  listFeedbackQuerySchema,
  listQuestionSetsQuerySchema,
  rangeQuerySchema,
  submitDailySchema,
  updatePulseConfigSchema,
  updateQuestionSchema,
} from './daily-pulse.schemas';
import { TREND_RANGE_DAYS } from './daily-pulse.schemas';
import { dailyPulseService, startOfUtcDay } from './daily-pulse.service';
import { feedbackInboxService } from './feedback-inbox.service';
import { dashboardsService } from './dashboards.service';
import { insightsService } from './insights.service';
import { storeDailyScore } from './daily-score.calculator';

export const dailyPulseController = {
  /** The employee's view of today's five questions. */
  today: asyncHandler(async (req: Request, res: Response) => {
    const data = await dailyPulseService.today(req.user!);
    res.status(200).json({ data });
  }),

  submit: asyncHandler(async (req: Request, res: Response) => {
    const input = submitDailySchema.parse(req.body);
    const data = await dailyPulseService.submit(req.user!, input);
    res.status(201).json({ data });
  }),

  myHistory: asyncHandler(async (req: Request, res: Response) => {
    const data = await dailyPulseService.myHistory(req.user!);
    res.status(200).json({ data });
  }),

  participation: asyncHandler(async (req: Request, res: Response) => {
    const data = await dailyPulseService.participation(
      req.user!,
      req.query.date ? startOfUtcDay(new Date(String(req.query.date))) : startOfUtcDay(new Date()),
    );
    res.status(200).json({ data });
  }),

  /** The answers given on a day, for HR and for managers over their team. */
  responses: asyncHandler(async (req: Request, res: Response) => {
    const { date } = dateQuerySchema.parse(req.query);
    const data = await dailyPulseService.responses(
      req.user!,
      startOfUtcDay(date ?? new Date()),
    );
    res.status(200).json({ data });
  }),

  /** The five questions for a date, generating them if the day is new. */
  questionSet: asyncHandler(async (req: Request, res: Response) => {
    const { date } = dateQuerySchema.parse(req.query);
    const data = await dailyPulseService.questionSetForDate(
      req.user!,
      startOfUtcDay(date ?? new Date()),
    );
    res.status(200).json({ data });
  }),

  /** Recent sets with their source, so rotation is auditable. */
  questionSets: asyncHandler(async (req: Request, res: Response) => {
    const { limit } = listQuestionSetsQuerySchema.parse(req.query);
    const data = await dailyPulseService.recentQuestionSets(req.user!, limit);
    res.status(200).json({ data });
  }),

  /** The 20-question bank, read-only, as the fixed list is defined. */
  questionBank: asyncHandler(async (req: Request, res: Response) => {
    const data = await dailyPulseService.listQuestions(req.user!);
    res.status(200).json({ data });
  }),

  /**
   * How each question was answered over a date range.
   *
   * Grouped by the wording stored on the answer, so a question keeps one
   * continuous series across the rotation rather than fragmenting into a new
   * entry every time it comes round again.
   */
  questionBreakdown: asyncHandler(async (req: Request, res: Response) => {
    const { startDate, endDate } = rangeQuerySchema.parse(req.query);
    const range = resolveRange(startDate, endDate);
    const data = await dailyPulseService.questionBreakdown(req.user!, range.startDate, range.endDate);
    res.status(200).json({ data });
  }),

  /** Per-day participation and mean score across a range. */
  trends: asyncHandler(async (req: Request, res: Response) => {
    const { startDate, endDate } = rangeQuerySchema.parse(req.query);
    const range = resolveRange(startDate, endDate);
    const data = await dailyPulseService.trends(req.user!, range.startDate, range.endDate);
    res.status(200).json({ data });
  }),

  /**
   * Replaces a day's questions. Refused with a 409 once anyone has answered, so
   * stored answers can never be left pointing at questions nobody was asked.
   */
  regenerateQuestionSet: asyncHandler(async (req: Request, res: Response) => {
    const { date } = dateQuerySchema.parse(req.query);
    const data = await dailyPulseService.regenerateQuestionSet(
      req.user!,
      startOfUtcDay(date ?? new Date()),
    );
    res.status(200).json({ data });
  }),

  listQuestions: asyncHandler(async (req: Request, res: Response) => {
    const data = await dailyPulseService.listQuestions(req.user!);
    res.status(200).json({ data });
  }),

  createQuestion: asyncHandler(async (req: Request, res: Response) => {
    const input = createQuestionSchema.parse(req.body);
    const data = await dailyPulseService.createQuestion(req.user!, input);
    res.status(201).json({ data });
  }),

  updateQuestion: asyncHandler(async (req: Request, res: Response) => {
    const input = updateQuestionSchema.parse(req.body);
    const id = z.string().min(1).parse(req.params.id);
    const data = await dailyPulseService.updateQuestion(req.user!, id, input);
    res.status(200).json({ data });
  }),

  updateConfig: asyncHandler(async (req: Request, res: Response) => {
    const input = updatePulseConfigSchema.parse(req.body);
    const data = await dailyPulseService.updateConfig(req.user!, input);
    res.status(200).json({ data });
  }),

  getConfig: asyncHandler(async (req: Request, res: Response) => {
    dailyPulseService.assertCanConfigure(req.user!);
    const data = await dailyPulseService.getConfig();
    res.status(200).json({ data });
  }),

  /** The role-appropriate dashboard: employee, manager or HR. */
  dashboard: asyncHandler(async (req: Request, res: Response) => {
    const data = await dashboardsService.forCurrentUser(req.user!);
    res.status(200).json({ data });
  }),

  /** Written feedback the caller may read, across both storage tables. */
  listFeedback: asyncHandler(async (req: Request, res: Response) => {
    const query = listFeedbackQuerySchema.parse(req.query);
    const data = await feedbackInboxService.list(req.user!, query);
    res.status(200).json({ data });
  }),

  /** The caller's own submissions, attributed and anonymous. */
  myFeedback: asyncHandler(async (req: Request, res: Response) => {
    const data = await feedbackInboxService.myFeedback(req.user!);
    res.status(200).json({ data });
  }),

  listInsights: asyncHandler(async (req: Request, res: Response) => {
    const data = await insightsService.list(req.user!);
    res.status(200).json({ data });
  }),

  dismissInsight: asyncHandler(async (req: Request, res: Response) => {
    const id = z.string().min(1).parse(req.params.id);
    await prisma.aiInsight.update({ where: { id }, data: { isDismissed: true } });
    res.status(200).json({ data: { id, dismissed: true } });
  }),

  /**
   * Recomputes the caller's own daily score on demand. Used by the employee
   * dashboard after a submission so the number reflects the new answer without
   * waiting for a background job.
   */
  recomputeMyScore: asyncHandler(async (req: Request, res: Response) => {
    const employee = await dailyPulseService.requireEmployee(req.user!);
    const data = await storeDailyScore(
      employee.id,
      startOfUtcDay(new Date(String(req.query.date ?? new Date().toISOString()))),
    );
    res.status(200).json({ data });
  }),
};

/** Resolves an optional range into UTC-midnight bounds, defaulting to the trend window. */
function resolveRange(startDate?: Date, endDate?: Date) {
  const end = startOfUtcDay(endDate ?? new Date());
  const span = TREND_RANGE_DAYS * 86_400_000;
  const start = startDate ? startOfUtcDay(startDate) : new Date(end.getTime() - span);

  // An inverted or unbounded range would otherwise run to the epoch. Clamping
  // keeps the cap honest and makes a malformed query a shorter window, not an
  // unbounded table scan.
  if (start > end) return { startDate: end, endDate: end };
  if (end.getTime() - start.getTime() > span) {
    return { startDate: new Date(end.getTime() - span), endDate: end };
  }
  return { startDate: start, endDate: end };
}
