import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { dailyPulseService, startOfUtcDay } from './daily-pulse.service';
import { feedbackInboxService } from './feedback-inbox.service';
import { storeDailyScore } from './daily-score.calculator';
import { insightsService } from './insights.service';
import type { AuthenticatedUser } from '../../types/express';

/**
 * End-to-end checks for the daily feedback module against real SQLite.
 *
 * The three properties worth defending with a test rather than a comment are:
 * a second submission on the same day is rejected, anonymous feedback has no
 * joinable author, and a score is never invented for a day with no answers.
 */
const prisma = new PrismaClient();

const departmentId = 'test-pulse-department';
const teamId = 'test-pulse-team';

const employeeUserId = 'test-pulse-employee-user';
const employeeId = 'test-pulse-employee';

const hrUserId = 'test-pulse-hr-user';
const hrEmployeeId = 'test-pulse-hr-employee';

const managerUserId = 'test-pulse-manager-user';
const managerEmployeeId = 'test-pulse-manager-employee';

const employeeUser: AuthenticatedUser = {
  id: employeeUserId,
  role: 'EMPLOYEE',
  email: 'pulse-employee@example.invalid',
};
const hrUser: AuthenticatedUser = {
  id: hrUserId,
  role: 'HR',
  email: 'pulse-hr@example.invalid',
};
const managerUser: AuthenticatedUser = {
  id: managerUserId,
  role: 'MANAGER',
  email: 'pulse-manager@example.invalid',
};

const today = startOfUtcDay(new Date());

/**
 * The five questions of today's frozen set.
 *
 * These are the set's own rows rather than pool rows, because the set is what
 * an employee is actually asked. A test that submitted against the pool would
 * pass while proving nothing about the daily flow.
 */
const questionIds: string[] = [];

/** A pool row: curated by HR, never shown to an employee directly. */
const poolQuestionId = 'test-pulse-pool-question';

beforeAll(async () => {
  // Clean any residue from a previously failed run so the suite is idempotent.
  await prisma.dailyQuestionResponse.deleteMany({ where: { employeeId } });
  await prisma.dailyQuestionAnswer.deleteMany({ where: { employeeId } });
  await prisma.dailyQuestion.deleteMany({ where: { prompt: { startsWith: 'Test question' } } });
  await prisma.anonymousFeedback.deleteMany({ where: { content: { startsWith: 'Test anonymous' } } });
  await prisma.employee.deleteMany({
    where: { id: { in: [employeeId, hrEmployeeId, managerEmployeeId] } },
  });
  await prisma.user.deleteMany({ where: { id: { in: [employeeUserId, hrUserId, managerUserId] } } });
  await prisma.team.deleteMany({ where: { id: teamId } });
  await prisma.department.deleteMany({ where: { id: departmentId } });

  await prisma.department.create({ data: { id: departmentId, name: 'Pulse Dept', code: 'PLS' } });
  await prisma.team.create({
    data: { id: teamId, name: 'Pulse Team', code: 'PLST', departmentId },
  });

  await prisma.user.create({
    data: {
      id: employeeUserId,
      email: 'pulse-employee@example.invalid',
      passwordHash: 'not-used',
      firstName: 'Pat',
      lastName: 'Employee',
      role: 'EMPLOYEE',
    },
  });
  await prisma.employee.create({
    data: {
      id: employeeId,
      employeeNumber: 'PLS-0001',
      userId: employeeUserId,
      firstName: 'Pat',
      lastName: 'Employee',
      email: 'pulse-employee@example.invalid',
      departmentId,
      teamId,
    },
  });

  await prisma.user.create({
    data: {
      id: hrUserId,
      email: 'pulse-hr@example.invalid',
      passwordHash: 'not-used',
      firstName: 'Harriet',
      lastName: 'Representative',
      role: 'HR',
    },
  });
  await prisma.employee.create({
    data: {
      id: hrEmployeeId,
      employeeNumber: 'PLS-0002',
      userId: hrUserId,
      firstName: 'Harriet',
      lastName: 'Representative',
      email: 'pulse-hr@example.invalid',
      departmentId,
    },
  });

  await prisma.user.create({
    data: {
      id: managerUserId,
      email: 'pulse-manager@example.invalid',
      passwordHash: 'not-used',
      firstName: 'Morgan',
      lastName: 'Manager',
      role: 'MANAGER',
    },
  });
  await prisma.employee.create({
    data: {
      id: managerEmployeeId,
      employeeNumber: 'PLS-0003',
      userId: managerUserId,
      firstName: 'Morgan',
      lastName: 'Manager',
      email: 'pulse-manager@example.invalid',
      departmentId,
    },
  });

  // The manager is scoped to the employee's team, not the whole department.
  await prisma.manager.create({
    data: { managerUserId, teamId },
  });

  // A pool question and today's frozen set. The pool row exists so the
  // "not part of today's set" test has a realistic question to be rejected
  // with - it is a real question, just not one anybody was asked today.
  await prisma.dailyQuestion.create({
    data: { id: poolQuestionId, prompt: 'Test question pool row', position: 1, answerType: 'RATING' },
  });

  const set = await prisma.dailyQuestionSet.create({
    data: {
      responseDate: today,
      source: 'BANK',
      questions: {
        create: Array.from({ length: 5 }, (_, index) => ({
          prompt: `Test question ${index + 1}`,
          position: index + 1,
          answerType: 'RATING',
        })),
      },
    },
    include: { questions: { orderBy: { position: 'asc' } } },
  });
  for (const question of set.questions) questionIds.push(question.id);

  // The pulse is active. `allowResubmission` is reset too: the column still
  // exists, and leaving a stale true behind would mask the strict-once check.
  await prisma.dailyPulseConfig.upsert({
    where: { id: 'default' },
    create: { id: 'default', isActive: true },
    update: { allowResubmission: false, isActive: true },
  });
});

afterAll(async () => {
  await dailyPulseService.settled();
  await prisma.sentimentAnalysis.deleteMany({
    where: { employeeId: { in: [employeeId, hrEmployeeId, managerEmployeeId] } },
  });
  // Anonymous analyses carry no employeeId, so they are matched on the source.
  await prisma.sentimentAnalysis.deleteMany({
    where: { sourceId: { contains: 'Test anonymous' } },
  });
  await prisma.employee.deleteMany({ where: { id: { in: [employeeId, hrEmployeeId, managerEmployeeId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [employeeUserId, hrUserId, managerUserId] } } });
  await prisma.team.deleteMany({ where: { id: teamId } });
  await prisma.department.deleteMany({ where: { id: departmentId } });
  // The set is removed last: its questions cascade, but only once the responses
  // that reference them are gone with their employees.
  await prisma.dailyQuestionSet.deleteMany({ where: { responseDate: today } });
  await prisma.dailyQuestion.deleteMany({ where: { prompt: { startsWith: 'Test question' } } });
  await prisma.anonymousFeedback.deleteMany({ where: { content: { startsWith: 'Test anonymous' } } });
  await prisma.$disconnect();
});

beforeEach(async () => {
  // A submission kicks off analysis and scoring without awaiting them, so a run
  // from the previous test can still be writing. Waiting first is what makes the
  // cleanup below actually a clean starting point.
  await dailyPulseService.settled();

  // Reset per-test state so ordering cannot affect the duplicate test.
  await prisma.dailyQuestionResponse.deleteMany({ where: { employeeId } });
  await prisma.dailyQuestionAnswer.deleteMany({ where: { employeeId } });
  await prisma.feedbackHistory.deleteMany({ where: { employeeId } });
  await prisma.employeeFeedback.deleteMany({ where: { employeeId } });
  await prisma.dailyEngagementScore.deleteMany({ where: { employeeId } });
  // Sentiment rows hang off the source text, not a foreign key to the employee,
  // so deleting the feedback that produced them does not remove them. Left
  // behind they would feed a later test's feedback score.
  await prisma.sentimentAnalysis.deleteMany({
    where: { OR: [{ employeeId: employeeId }, { employeeId: hrEmployeeId }] },
  });
  await prisma.anonymousFeedback.deleteMany({ where: { content: { startsWith: 'Test anonymous' } } });
  await prisma.dailyPulseConfig.update({
    where: { id: 'default' },
    data: { allowResubmission: false, isActive: true },
  });
});

function submission(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    responseDate: today,
    answers: questionIds.map((questionId) => ({ questionId, numericValue: 4 })),
    writtenFeedback: { category: 'SUGGESTION', content: 'Test written feedback from the employee' },
    ...overrides,
  } as never;
}

describe('daily pulse submission', () => {
  it('accepts a full five-question submission and stores the answers', async () => {
    const result = await dailyPulseService.submit(employeeUser, submission());
    expect(result.answerCount).toBe(5);

    const answers = await prisma.dailyQuestionAnswer.findMany({
      where: { employeeId },
    });
    expect(answers).toHaveLength(5);
  });

  it('rejects a second submission on the same day', async () => {
    await dailyPulseService.submit(employeeUser, submission());
    await expect(dailyPulseService.submit(employeeUser, submission())).rejects.toThrow(
      /already submitted/i,
    );
  });

  it('refuses a second submission even when the legacy resubmission flag is set', async () => {
    // The flag column survives in the schema, so a stale row can still say
    // true. It must not reopen the day: the first answer is the one the
    // employee actually gave.
    await prisma.dailyPulseConfig.update({
      where: { id: 'default' },
      data: { allowResubmission: true },
    });
    try {
      await dailyPulseService.submit(employeeUser, submission());
      await expect(
        dailyPulseService.submit(
          employeeUser,
          submission({ answers: questionIds.map((questionId) => ({ questionId, numericValue: 2 })) }),
        ),
      ).rejects.toThrow(/already submitted/i);

      const answers = await prisma.dailyQuestionAnswer.findMany({ where: { employeeId } });
      expect(answers).toHaveLength(5);
      expect(answers.every((answer) => answer.numericValue === 4)).toBe(true);
    } finally {
      await prisma.dailyPulseConfig.update({
        where: { id: 'default' },
        data: { allowResubmission: false },
      });
    }
  });

  it('stores the question wording on every answer row', async () => {
    // The answer row is permanent history, so it carries its own copy of the
    // prompt rather than resolving it through a question row that could change.
    await dailyPulseService.submit(employeeUser, submission());

    const answers = await prisma.dailyQuestionAnswer.findMany({
      where: { employeeId },
      orderBy: { questionId: 'asc' },
    });
    expect(answers).toHaveLength(5);
    expect(answers.map((answer) => answer.questionText).sort()).toEqual(
      Array.from({ length: 5 }, (_, index) => `Test question ${index + 1}`).sort(),
    );
  });

  it('rejects a partial submission', async () => {
    await expect(
      dailyPulseService.submit(
        employeeUser,
        submission({ answers: [{ questionId: questionIds[0], numericValue: 3 }] }),
      ),
    ).rejects.toThrow(/exactly 5 answers/i);
  });

  it('rejects an answer to a question that is not in today’s set', async () => {
    // The pool row is a real question but was not asked today. Answering it
    // must be refused rather than quietly recorded against the wrong set.
    await expect(
      dailyPulseService.submit(
        employeeUser,
        submission({
          answers: [...questionIds.slice(0, 4).map((questionId) => ({ questionId, numericValue: 4 })),
            { questionId: poolQuestionId, numericValue: 4 }],
        }),
      ),
    ).rejects.toThrow(/not part of today's set/i);
  });

  it('refuses a value outside the 0-1 range for a yes/no question', async () => {
    const yesNoId = questionIds[4]!;
    await prisma.dailyQuestion.update({
      where: { id: yesNoId },
      data: { answerType: 'YES_NO' },
    });

    try {
      await expect(
        dailyPulseService.submit(
          employeeUser,
          submission({
            answers: questionIds.map((questionId) => ({ questionId, numericValue: 4 })),
          }),
        ),
      ).rejects.toThrow(/yes\/no answers must be 1 or 0/i);
    } finally {
      await prisma.dailyQuestion.update({
        where: { id: yesNoId },
        data: { answerType: 'RATING' },
      });
    }
  });
});

describe('anonymous feedback', () => {
  it('stores anonymous feedback in a table with no author column', async () => {
    await dailyPulseService.submit(
      employeeUser,
      submission({
        anonymousFeedback: { category: 'CONCERN', content: 'Test anonymous concern about tooling' },
      }),
    );

    const rows = await prisma.anonymousFeedback.findMany({
      where: { content: { startsWith: 'Test anonymous' } },
    });
    expect(rows).toHaveLength(1);
    // The anonymity guarantee is structural: the model has no employeeId field
    // at all, so there is nothing to join back on.
    const columns = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      'PRAGMA table_info("AnonymousFeedback")',
    );
    const names = columns.map((column) => column.name as string);
    expect(names).not.toContain('employeeId');
    expect(names).not.toContain('authorId');
  });

  it('does not expose anonymous content to a manager', async () => {
    // Pool below the minimum, so even a role with the permission sees nothing.
    await prisma.anonymousFeedback.create({
      data: { category: 'CONCERN', content: 'Test anonymous only comment' },
    });

    const forManager = await feedbackInboxService.list(managerUser, {
      page: 1,
      pageSize: 25,
    });
    expect(forManager.some((item) => item.isAnonymous)).toBe(false);
  });

  it('gives an employee a record of their anonymous submission without the content', async () => {
    await dailyPulseService.submit(
      employeeUser,
      submission({
        anonymousFeedback: { category: 'CONCERN', content: 'Test anonymous private thought' },
      }),
    );

    const mine = await feedbackInboxService.myFeedback(employeeUser);
    expect(mine.anonymous).toHaveLength(1);
    expect(mine.anonymous[0]).not.toHaveProperty('content');
  });
});

describe('HR question breakdown', () => {
  it('averages each question and reports the most-asked first', async () => {
    await dailyPulseService.submit(employeeUser, submission());

    const breakdown = await dailyPulseService.questionBreakdown(hrUser, today, today);
    expect(breakdown.questions).toHaveLength(5);
    expect(breakdown.questions.every((question) => question.responses === 1)).toBe(true);
    expect(breakdown.questions.every((question) => question.average === 4)).toBe(true);
    expect(breakdown.questions.map((question) => question.prompt).sort()).toEqual(
      Array.from({ length: 5 }, (_, index) => `Test question ${index + 1}`).sort(),
    );
  });

  it('groups by wording, not by question id', async () => {
    // A question that comes round again gets a fresh DailyQuestion row but the
    // same wording. Its history has to stay in one series.
    await dailyPulseService.submit(employeeUser, submission());

    const later = new Date(today.getTime() + 86_400_000);
    const repeatSet = await prisma.dailyQuestionSet.create({
      data: {
        responseDate: later,
        source: 'BANK',
        questions: {
          create: Array.from({ length: 5 }, (_, index) => ({
            prompt: `Test question ${index + 1}`,
            position: index + 1,
            answerType: 'RATING',
          })),
        },
      },
      include: { questions: { orderBy: { position: 'asc' } } },
    });

    // The HR employee answers the repeated wording on a later day, directly,
    // so the second occurrence gets its own question ids but shares the prompts.
    const response = await prisma.dailyQuestionResponse.create({
      data: {
        employeeId: hrEmployeeId,
        responseDate: later,
        questionId: repeatSet.questions[0]!.id,
        summaryValue: 2,
      },
    });
    await prisma.dailyQuestionAnswer.createMany({
      data: repeatSet.questions.map((question) => ({
        responseId: response.id,
        employeeId: hrEmployeeId,
        responseDate: later,
        questionId: question.id,
        questionText: question.prompt,
        numericValue: 2,
      })),
    });

    const breakdown = await dailyPulseService.questionBreakdown(hrUser, today, later);
    expect(breakdown.questions).toHaveLength(5);
    // Each wording now has two responses, one from each day.
    expect(breakdown.questions.every((question) => question.responses === 2)).toBe(true);
    expect(breakdown.questions.every((question) => question.average === 3)).toBe(true);

    await prisma.dailyQuestionAnswer.deleteMany({ where: { employeeId: hrEmployeeId, responseDate: later } });
    await prisma.dailyQuestionResponse.deleteMany({ where: { employeeId: hrEmployeeId, responseDate: later } });
    await prisma.dailyQuestionSet.deleteMany({ where: { responseDate: later } });
  });

  it('refuses a manager', async () => {
    await expect(
      dailyPulseService.questionBreakdown(managerUser, today, today),
    ).rejects.toThrow(/not allowed to view daily responses/i);
  });
});

describe('HR trends', () => {
  it('reports a dense series and leaves days without responses null', async () => {
    await dailyPulseService.submit(employeeUser, submission());
    await storeDailyScore(employeeId, today);

    const start = new Date(today.getTime() - 4 * 86_400_000);
    const trends = await dailyPulseService.trends(hrUser, start, today);

    // Five days inclusive, every day present so a gap renders as a gap.
    expect(trends.days).toHaveLength(5);
    expect(trends.days.map((day) => day.date)).toEqual([
      start.toISOString().slice(0, 10),
      new Date(start.getTime() + 86_400_000).toISOString().slice(0, 10),
      new Date(start.getTime() + 2 * 86_400_000).toISOString().slice(0, 10),
      new Date(start.getTime() + 3 * 86_400_000).toISOString().slice(0, 10),
      today.toISOString().slice(0, 10),
    ]);

    const last = trends.days[trends.days.length - 1]!;
    expect(last.submissions).toBe(1);
    expect(last.averageScore).toBeCloseTo(75, 0);
    // The four earlier days had no responses: null, not zero.
    expect(trends.days.slice(0, 4).every((day) => day.submissions === 0)).toBe(true);
    expect(trends.days.slice(0, 4).every((day) => day.averageScore === null)).toBe(true);
  });

  it('refuses a manager', async () => {
    await expect(dailyPulseService.trends(managerUser, today, today)).rejects.toThrow(
      /not allowed to view daily responses/i,
    );
  });
});

describe('fixed question bank', () => {
  it('exposes exactly 20 fixed questions to HR', async () => {
    const bank = await dailyPulseService.listQuestions(hrUser);
    expect(bank).toHaveLength(20);
    expect(new Set(bank.map((question) => question.prompt)).size).toBe(20);
  });

  it('refuses to add or edit a bank question', async () => {
    await expect(
      dailyPulseService.createQuestion(hrUser, {
        prompt: 'A twenty-first question',
        position: 1,
        answerType: 'RATING',
      } as never),
    ).rejects.toThrow(/fixed at 20 questions/i);
    await expect(
      dailyPulseService.updateQuestion(hrUser, 'anything', { prompt: 'Reworded' } as never),
    ).rejects.toThrow(/fixed at 20 questions/i);
  });

  it('refuses the bank endpoints to an employee', async () => {
    await expect(dailyPulseService.listQuestions(employeeUser)).rejects.toThrow(
      /Only HR or Admin/i,
    );
  });
});

describe('daily engagement score', () => {
  it('produces no score for a day with no answers', async () => {
    const score = await storeDailyScore(employeeId, today);
    expect(score).toBeNull();

    const stored = await prisma.dailyEngagementScore.findMany({
      where: { employeeId, scoreDate: today },
    });
    expect(stored).toHaveLength(0);
  });

  it('scores a day with answers and reports which inputs were present', async () => {
    await dailyPulseService.submit(employeeUser, submission());

    const score = await storeDailyScore(employeeId, today);
    expect(score).not.toBeNull();
    expect(score!.questionScore).not.toBeNull();
    // Nothing was written and no prior day exists, so both are null rather
    // than zero: a zero would read as "the employee felt nothing".
    expect(score!.feedbackScore).toBeNull();
    expect(score!.trendScore).toBeNull();
    // All five answers are 4 on a 1-5 scale => 75 on [0, 100].
    expect(score!.overallScore).toBeCloseTo(75, 0);
  });

  it('uses a previous day as the trend component on a later day', async () => {
    // A prior day establishes the trend input.
    const yesterday = new Date(today.getTime() - 86_400_000);
    await prisma.dailyEngagementScore.create({
      data: { employeeId, scoreDate: yesterday, overallScore: 50, method: 'DAILY_V1' },
    });

    await dailyPulseService.submit(employeeUser, submission());

    const score = await storeDailyScore(employeeId, today);
    expect(score).not.toBeNull();
    expect(score!.trendScore).toBeCloseTo(50, 0);
    // The trend pulls the blended score below the questions-only value of 75.
    expect(score!.overallScore).toBeLessThan(75);
  });
});

describe('insights', () => {
  it('generates nothing when there is insufficient data', async () => {
    const insights = await insightsService.generateForTarget(hrUser, {
      level: 'ORGANISATION',
      key: 'ALL',
      name: 'Organisation',
      employeeIds: [],
    });
    // One submission cannot support a claim, so the correct answer is none.
    expect(insights.every((insight) => insight.evidenceSize >= 5)).toBe(true);
  });

  it('does not let an employee read team or organisation insights', async () => {
    const insights = await insightsService.list(employeeUser);
    expect(insights).toEqual([]);
  });
});
