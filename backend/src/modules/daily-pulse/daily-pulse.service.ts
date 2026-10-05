import { resolveScope } from '../../core/scope';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../core/errors';
import { prisma } from '../../core/prisma';
import { logger } from '../../core/logger';
import { PERMISSIONS, roleHasPermission } from '../auth/permissions';
import { AnalysisPipeline } from '../intelligence/analysis.pipeline';
import type { AuthenticatedUser } from '../../types/express';
import { storeDailyScore } from './daily-score.calculator';
import { dailyQuestionGenerator, type DailySetView } from './daily-question.generator';
import type { SubmitDailyInput, UpdatePulseConfigInput, UpdateQuestionInput } from './daily-pulse.schemas';

/** UTC midnight for the given date. Every daily row is keyed on this value. */
export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** The UTC day after `day`, used as an exclusive upper bound in date filters. */
export function nextDay(day: Date): Date {
  return new Date(day.getTime() + 24 * 60 * 60 * 1000);
}

/** The number of questions an employee sees, fixed by product spec. */
export const QUESTIONS_PER_DAY = 5;

/** How many recent daily scores form the trend component. */
const TREND_WINDOW_DAYS = 7;

export class DailyPulseService {
  /**
   * The curated question pool HR maintains, in position order.
   *
   * These rows are the *source* the daily generator draws from, not what
   * employees are shown. The questions an employee answers are the five frozen
   * rows of that day's `DailyQuestionSet`.
   */
  async activeQuestions() {
    return prisma.dailyQuestion.findMany({
      where: { isActive: true, questionSetId: null },
      orderBy: { position: 'asc' },
    });
  }

  /**
   * The five questions for a date, generating and freezing them on first use.
   *
   * Generation failure is contained here rather than surfaced: an employee
   * opening the pulse must always get five questions, and the generator always
   * has the bank to fall back on.
   */
  async questionsForDate(responseDate: Date): Promise<DailySetView> {
    try {
      return await dailyQuestionGenerator.setForDate(responseDate);
    } catch (error) {
      logger.error('Could not prepare the daily question set', {
        responseDate: responseDate.toISOString(),
        error: error instanceof Error ? error.message : String(error),
      });
      throw new ValidationError(
        "Today's questions could not be prepared. Please try again in a few minutes.",
      );
    }
  }

  /** The pulse settings row, created on first access so defaults always exist. */
  async getConfig() {
    const existing = await prisma.dailyPulseConfig.findUnique({ where: { id: 'default' } });
    if (existing) return existing;
    return prisma.dailyPulseConfig.create({ data: { id: 'default' } });
  }

  /** Throws unless the caller may configure the five questions. */
  assertCanConfigure(user: AuthenticatedUser): void {
    const role = user.role;
    if (
      !roleHasPermission(role, PERMISSIONS.SURVEY_CREATE) &&
      !roleHasPermission(role, PERMISSIONS.SYSTEM_MANAGE)
    ) {
      throw new ForbiddenError('Only HR or Admin can configure the daily pulse');
    }
  }

  /**
   * The employee's view of today: whether they can still submit, the questions,
   * and any answers already stored. Answers are returned so a rejected
   * resubmission does not look like data loss.
   *
   * The five questions come from today's frozen set, so every employee opening
   * the page on the same day is answering the same thing.
   */
  async today(user: AuthenticatedUser) {
    const employee = await this.requireEmployee(user);
    const responseDate = startOfUtcDay(new Date());

    const [config, set, existing, history, writtenCount] = await Promise.all([
      this.getConfig(),
      this.questionsForDate(responseDate),
      prisma.dailyQuestionResponse.findUnique({
        where: { employeeId_responseDate: { employeeId: employee.id, responseDate } },
        include: { answers: { include: { question: true } } },
      }),
      prisma.feedbackHistory.findUnique({
        where: { employeeId_feedbackDate: { employeeId: employee.id, feedbackDate: responseDate } },
      }),
      prisma.employeeFeedback.count({
        where: { employeeId: employee.id, createdAt: { gte: responseDate, lt: nextDay(responseDate) } },
      }),
    ]);

    const questions = set.questions;

    return {
      responseDate: responseDate.toISOString(),
      isActive: config.isActive,
      allowResubmission: config.allowResubmission,
      canSubmit: config.isActive && (!existing || config.allowResubmission),
      alreadySubmitted: Boolean(existing),
      questionCount: questions.length,
      questions: questions.map((question) => toQuestionView(question, existing?.answers ?? [])),
      submittedAt: existing?.createdAt.toISOString() ?? null,
      hasWrittenFeedback: writtenCount > 0,
      hasAnonymousFeedback: history?.hasAnonymous ?? false,
      /** Whether the questions were model-written or drawn from the curated bank. */
      questionSource: set.source,
      /** The provider and model behind `questionSource`, when one was used. */
      questionSourceModel: set.model,
    };
  }

  /**
   * Records one day's answers plus any written feedback.
   *
   * Duplicate prevention is a transaction guarded by the unique constraint on
   * (employeeId, responseDate). The pre-check exists only to return a
   * friendly 409; the constraint is what actually guarantees correctness under
   * two concurrent submissions.
   */
  async submit(user: AuthenticatedUser, input: SubmitDailyInput) {
    const employee = await this.requireEmployee(user);
    const config = await this.getConfig();

    if (!config.isActive) {
      throw new ValidationError('The daily pulse is currently paused');
    }

    const responseDate = startOfUtcDay(input.responseDate ?? new Date());
    const set = await this.questionsForDate(responseDate);
    const questions = set.questions;

    if (questions.length === 0) {
      throw new ValidationError("Today's questions could not be prepared");
    }

    const expected = config.questionsPerDay || QUESTIONS_PER_DAY;
    if (input.answers.length !== expected) {
      throw new ValidationError(
        `Exactly ${expected} answers are required; received ${input.answers.length}`,
      );
    }

    // Every answer must map to a distinct question from this day's set. The set
    // is frozen, so this also rejects a stale client that still holds yesterday's
    // question ids rather than silently scoring it against the wrong questions.
    const byId = new Map(questions.map((question) => [question.id, question]));
    const seen = new Set<string>();
    for (const answer of input.answers) {
      if (seen.has(answer.questionId)) {
        throw new ValidationError(`Question ${answer.questionId} was answered more than once`);
      }
      seen.add(answer.questionId);
      const question = byId.get(answer.questionId);
      if (!question) {
        throw new ValidationError(`Question ${answer.questionId} is not part of today's set`);
      }
      validateAnswerShape(
        { answerType: question.answerType, optionsJson: null },
        answer,
      );
    }

    if (seen.size !== byId.size) {
      throw new ValidationError(
        `All ${expected} of today's questions must be answered; received ${seen.size}`,
      );
    }

    const alreadySubmitted = await prisma.dailyQuestionResponse.findUnique({
      where: { employeeId_responseDate: { employeeId: employee.id, responseDate } },
      select: { id: true },
    });

    if (alreadySubmitted && !config.allowResubmission) {
      throw new ConflictError('You have already submitted feedback for today');
    }

    // The anchor question is the first in the set; validation above has already
    // confirmed the array is non-empty and every id is a real active question.
    const anchorQuestionId = input.answers[0]?.questionId;
    if (!anchorQuestionId) {
      throw new ValidationError('At least one answer is required');
    }

    try {
      return await prisma.$transaction(async (tx) => {
        await tx.dailyQuestionResponse.upsert({
          where: { employeeId_responseDate: { employeeId: employee.id, responseDate } },
          create: {
            employeeId: employee.id,
            responseDate,
            questionId: anchorQuestionId,
            summaryValue: meanNumeric(input.answers),
          },
          update: { summaryValue: meanNumeric(input.answers) },
        });

        const submission = await tx.dailyQuestionResponse.findUniqueOrThrow({
          where: { employeeId_responseDate: { employeeId: employee.id, responseDate } },
          select: { id: true },
        });

        // Per-question answers replace the previous set on a resubmission.
        await tx.dailyQuestionAnswer.deleteMany({ where: { responseId: submission.id } });
        await tx.dailyQuestionAnswer.createMany({
          data: input.answers.map((answer) => ({
            responseId: submission.id,
            employeeId: employee.id,
            responseDate,
            questionId: answer.questionId,
            numericValue: answer.numericValue ?? null,
            textValue: answer.textValue ?? null,
            selectedOptionsJson: answer.selectedOptions ? JSON.stringify(answer.selectedOptions) : null,
          })),
        });

        if (input.writtenFeedback) {
          await tx.employeeFeedback.create({
            data: {
              employeeId: employee.id,
              category: input.writtenFeedback.category,
              content: input.writtenFeedback.content,
            },
          });
        }

        if (input.anonymousFeedback) {
          await tx.anonymousFeedback.create({
            data: {
              category: input.anonymousFeedback.category,
              content: input.anonymousFeedback.content,
            },
          });
        }

        await tx.feedbackHistory.upsert({
          where: { employeeId_feedbackDate: { employeeId: employee.id, feedbackDate: responseDate } },
          create: {
            employeeId: employee.id,
            feedbackDate: responseDate,
            hasAnonymous: Boolean(input.anonymousFeedback),
            questionCount: input.answers.length,
          },
          update: {
            hasAnonymous: Boolean(input.anonymousFeedback),
            questionCount: input.answers.length,
          },
        });

        return { responseDate: responseDate.toISOString(), answerCount: input.answers.length };
      });
    } catch (error) {
      // Prisma surfaces the unique-constraint violation as P2002. Converting it
      // to the same 409 the pre-check produces means a racing double submit
      // behaves the same as a sequential one.
      if (isUniqueViolation(error)) {
        throw new ConflictError('You have already submitted feedback for today');
      }
      throw error;
    } finally {
      // Analysis and scoring run after the transaction commits. Doing them
      // inside would mean a failed NLP call rolls back a submission the
      // employee already made, which is not their problem to fix. Failures here
      // are logged and the next scheduled run picks the rows up.
      void this.postProcess(employee.id, responseDate).catch((error: unknown) => {
        logger.error('Daily pulse post-processing failed', {
          employeeId: employee.id,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
  }

  /**
   * Analyzes the day's written feedback and stores the daily score.
   *
   * Runs asynchronously after a submission: the employee sees their
   * acknowledgement immediately, and the dashboard numbers catch up.
   *
   * `DAILY_ANSWER` is included so the free-text answer to today's open question
   * is classified alongside the optional written comment. Without it the
   * guaranteed text question would never reach the sentiment, theme, engagement
   * and risk models, and the pulse's richest signal would be the one the
   * platform ignored.
   */
  private async postProcess(employeeId: string, responseDate: Date): Promise<void> {
    const pipeline = new AnalysisPipeline();
    await pipeline.run({
      sources: ['DAILY_FEEDBACK', 'ANONYMOUS_FEEDBACK', 'DAILY_ANSWER'],
      since: responseDate,
      until: new Date(responseDate.getTime() + 86_400_000),
    });

    await storeDailyScore(employeeId, responseDate);
  }

  /** The caller's own submissions, newest first. */
  async myHistory(user: AuthenticatedUser, limit = 30) {
    const employee = await this.requireEmployee(user);
    return prisma.feedbackHistory.findMany({
      where: { employeeId: employee.id },
      orderBy: { feedbackDate: 'desc' },
      take: limit,
      select: {
        feedbackDate: true,
        hasAnonymous: true,
        questionCount: true,
        createdAt: true,
      },
    });
  }

  /**
   * Participation counts for HR/Manager dashboards.
   *
   * Reports the ratio of employees who submitted to the number of active
   * employees in scope. Never returns per-employee submitted flags: a manager
   * must not be able to infer who skipped the pulse.
   */
  async participation(user: AuthenticatedUser, responseDate = startOfUtcDay(new Date())) {
    const scope = await resolveScope(user);
    if (!roleHasPermission(user.role, PERMISSIONS.ANALYTICS_READ_TEAM)) {
      throw new ForbiddenError('You are not allowed to view participation');
    }

    const employeeWhere = scope.canReadAll
      ? { status: { not: 'TERMINATED' } }
      : {
          id: { in: [...new Set([...scope.selfEmployeeIds, ...scope.teamEmployeeIds])] },
          status: { not: 'TERMINATED' },
        };

    const [eligible, submitted] = await Promise.all([
      prisma.employee.count({ where: employeeWhere }),
      prisma.dailyQuestionResponse.count({
        where: { responseDate, employee: employeeWhere },
      }),
    ]);

    return {
      responseDate: responseDate.toISOString(),
      eligible,
      submitted,
      participationRate: eligible === 0 ? null : Math.round((submitted / eligible) * 1000) / 10,
    };
  }

  /**
   * The actual answers given on a day, for HR/Admin.
   *
   * This is deliberately separate from `participation`, which returns counts
   * only. Counts answer "how many"; this answers "what did they say", which is
   * what an HR reader reviewing a morning pulse actually needs.
   *
   * Restricted to PULSE_READ_ALL, unlike every other read in this module. A
   * manager sees participation *counts* through `participation` but not the
   * answers behind them: knowing which individual gave a low rating, or what
   * they wrote about their manager, is exactly the detail that turns a pulse
   * into a monitoring tool. HR and Admin have the organisation-wide key.
   */
  async responses(user: AuthenticatedUser, responseDate = startOfUtcDay(new Date())) {
    const scope = await resolveScope(user);
    if (!roleHasPermission(user.role, PERMISSIONS.PULSE_READ_ALL)) {
      throw new ForbiddenError('You are not allowed to view daily responses');
    }

    const rows = await prisma.dailyQuestionResponse.findMany({
      where: { responseDate, employee: scope.canReadAll ? {} : { id: { in: [...scope.selfEmployeeIds] } } },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        createdAt: true,
        summaryValue: true,
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            jobTitle: true,
            department: { select: { id: true, name: true } },
          },
        },
        answers: {
          orderBy: { question: { position: 'asc' } },
          select: {
            id: true,
            numericValue: true,
            textValue: true,
            question: { select: { id: true, prompt: true, answerType: true, position: true } },
          },
        },
      },
    });

    return {
      responseDate: responseDate.toISOString(),
      responses: rows.map((row) => ({
        id: row.id,
        submittedAt: row.createdAt.toISOString(),
        summaryValue: row.summaryValue,
        employee: {
          id: row.employee.id,
          name: `${row.employee.firstName} ${row.employee.lastName}`,
          jobTitle: row.employee.jobTitle,
          department: row.employee.department?.name ?? null,
        },
        answers: row.answers.map((answer) => ({
          questionId: answer.question.id,
          prompt: answer.question.prompt,
          answerType: answer.question.answerType,
          position: answer.question.position,
          numericValue: answer.numericValue,
          textValue: answer.textValue,
        })),
      })),
    };
  }

  // --- HR/Admin configuration ---------------------------------------------

  /**
   * The curated pool HR edits.
   *
   * Scoped to `questionSetId: null` so the frozen questions of past and present
   * days do not appear here. They are history, not configuration: editing or
   * retiring one would desynchronise it from the answers already recorded
   * against it.
   */
  async listQuestions(user: AuthenticatedUser) {
    this.assertCanConfigure(user);
    return prisma.dailyQuestion.findMany({
      where: { questionSetId: null },
      orderBy: { position: 'asc' },
    });
  }

  /** The set for a date, generating it if the day has not been opened yet. */
  async questionSetForDate(user: AuthenticatedUser, responseDate: Date) {
    this.assertCanConfigure(user);
    return this.questionsForDate(responseDate);
  }

  /** Recent sets with their provenance, so rotation is auditable. */
  async recentQuestionSets(user: AuthenticatedUser, limit = 14) {
    this.assertCanConfigure(user);
    return dailyQuestionGenerator.recentSets(limit);
  }

  /** Replaces a day's questions. Refused once anyone has answered that day. */
  async regenerateQuestionSet(user: AuthenticatedUser, responseDate: Date) {
    this.assertCanConfigure(user);
    return dailyQuestionGenerator.regenerateSet(responseDate);
  }

  async createQuestion(user: AuthenticatedUser, input: Omit<UpdateQuestionInput, never> & Record<string, unknown>) {
    this.assertCanConfigure(user);
    return prisma.dailyQuestion.create({
      data: {
        prompt: input.prompt as string,
        answerType: (input.answerType as string) ?? 'RATING',
        optionsJson: input.options ? JSON.stringify(input.options) : null,
        helpText: input.helpText ?? null,
        position: input.position as number,
        theme: typeof input.theme === 'string' ? input.theme : null,
        isActive: input.isActive ?? true,
      },
    });
  }

  async updateQuestion(user: AuthenticatedUser, id: string, input: UpdateQuestionInput) {
    this.assertCanConfigure(user);
    const question = await prisma.dailyQuestion.findUnique({ where: { id } });
    if (!question) throw new NotFoundError('Question not found');
    // A question belonging to a day's frozen set is history, not configuration.
    // Editing it would leave the stored answers describing wording nobody was
    // ever asked, which quietly corrupts every aggregate built from them.
    if (question.questionSetId) {
      throw new ValidationError(
        'This question belongs to a published daily set and cannot be edited. Edit the question bank instead.',
      );
    }

    return prisma.dailyQuestion.update({
      where: { id },
      data: {
        ...(input.prompt !== undefined ? { prompt: input.prompt } : {}),
        ...(input.answerType !== undefined ? { answerType: input.answerType } : {}),
        ...(input.options !== undefined
          ? { optionsJson: input.options ? JSON.stringify(input.options) : null }
          : {}),
        ...(input.helpText !== undefined ? { helpText: input.helpText } : {}),
        ...(input.position !== undefined ? { position: input.position } : {}),
        ...(input.theme !== undefined ? { theme: input.theme ?? null } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
  }

  async updateConfig(user: AuthenticatedUser, input: UpdatePulseConfigInput) {
    this.assertCanConfigure(user);
    return prisma.dailyPulseConfig.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        ...(input.allowResubmission !== undefined
          ? { allowResubmission: input.allowResubmission }
          : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        updatedById: user.id,
      },
      update: {
        ...(input.allowResubmission !== undefined
          ? { allowResubmission: input.allowResubmission }
          : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        updatedById: user.id,
      },
    });
  }

  /** The employee record linked to the caller's account. */
  async requireEmployee(user: AuthenticatedUser) {
    const employee = await prisma.employee.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!employee) {
      throw new NotFoundError('No employee record is linked to this account');
    }
    return employee;
  }
}

/** Mean of the numeric answers, used as the row-level summary value. */
function meanNumeric(answers: { numericValue?: number }[]): number | null {
  const values = answers
    .map((answer) => answer.numericValue)
    .filter((value): value is number => typeof value === 'number');
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

/**
 * Enforces that the value supplied matches the question's answer type. Without
 * this a client could send a rating for a yes/no question and silently poison
 * the average.
 */
function validateAnswerShape(
  question: { answerType: string; optionsJson: string | null },
  answer: { numericValue?: number; textValue?: string; selectedOptions?: string[] },
): void {
  if (question.answerType === 'RATING') {
    if (answer.numericValue === undefined || answer.numericValue < 1 || answer.numericValue > 5) {
      throw new ValidationError('Rating answers must be between 1 and 5');
    }
    return;
  }
  if (question.answerType === 'YES_NO') {
    if (answer.numericValue !== 0 && answer.numericValue !== 1) {
      throw new ValidationError('Yes/no answers must be 1 or 0');
    }
    return;
  }
  if (question.answerType === 'SHORT_TEXT') {
    if (!answer.textValue || answer.textValue.trim().length === 0) {
      throw new ValidationError('Short text answers require text');
    }
    return;
  }
  if (question.answerType === 'MULTIPLE_CHOICE') {
    if (!answer.selectedOptions || answer.selectedOptions.length === 0) {
      throw new ValidationError('Multiple choice answers require at least one option');
    }
    const allowed = parseOptions(question.optionsJson);
    if (allowed.length > 0) {
      const unknown = answer.selectedOptions.filter((option) => !allowed.includes(option));
      if (unknown.length > 0) {
        throw new ValidationError(`Unknown option(s): ${unknown.join(', ')}`);
      }
    }
  }
}

export function parseOptions(optionsJson: string | null): string[] {
  if (!optionsJson) return [];
  try {
    const parsed = JSON.parse(optionsJson);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

/**
 * One question as the employee sees it.
 *
 * `options` is always empty: the generator rejects MULTIPLE_CHOICE, so a daily
 * set only ever contains RATING, YES_NO and SHORT_TEXT. The field stays in the
 * contract because the renderer is written against it and a future answer type
 * should not require reshaping every response.
 */
function toQuestionView(
  question: { id: string; prompt: string; answerType: string; helpText: string | null; position: number },
  answers: Array<{ questionId: string; textValue: string | null }>,
) {
  const answer = answers.find((a) => a.questionId === question.id);
  return {
    id: question.id,
    prompt: question.prompt,
    answerType: question.answerType,
    options: [] as string[],
    helpText: question.helpText,
    position: question.position,
    savedAnswer: answer?.textValue ?? null,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}

export { TREND_WINDOW_DAYS };
export const dailyPulseService = new DailyPulseService();
