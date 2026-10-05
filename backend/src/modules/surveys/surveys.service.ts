import { NotFoundError, UnauthorizedError, ValidationError } from '../../core/errors';
import { anonymousOwnerHash } from '../../core/hmac';
import { prisma } from '../../core/prisma';
import type { AuthenticatedUser } from '../../types/express';
import type {
  CreateSurveyInput,
  ListSurveysQuery,
  SubmitResponseInput,
  UpdateSurveyInput,
} from './surveys.schemas';

/** Choice questions store their options as a pipe-delimited string. */
function encodeOptions(options?: string[]): string | null {
  return options && options.length > 0 ? options.join('|') : null;
}

function decodeOptions(options: string | null): string[] {
  return options ? options.split('|').filter(Boolean) : [];
}

/**
 * Questions per question type. Mirrors the domain rules that the schema's
 * database-level constraints cannot express.
 */
function assertAnswerShape(
  question: { type: string; options: string | null; prompt: string },
  valueText: string | null | undefined,
  valueNumber: number | null | undefined,
): void {
  const label = `"${question.prompt}"`;

  switch (question.type) {
    case 'LIKERT_5':
    case 'SCALE_1_5':
    case 'LIKERT_10': {
      if (valueNumber === null || valueNumber === undefined) {
        throw new ValidationError(`A numeric answer is required for ${label}`);
      }
      const max = question.type === 'LIKERT_10' ? 10 : 5;
      if (valueNumber < 1 || valueNumber > max) {
        throw new ValidationError(`Answer for ${label} must be between 1 and ${max}`);
      }
      return;
    }
    case 'NUMERIC': {
      if (valueNumber === null || valueNumber === undefined) {
        throw new ValidationError(`A numeric answer is required for ${label}`);
      }
      return;
    }
    case 'YES_NO': {
      if (valueText !== 'true' && valueText !== 'false') {
        throw new ValidationError(`Answer for ${label} must be "true" or "false"`);
      }
      return;
    }
    case 'SINGLE_CHOICE':
    case 'MULTI_CHOICE': {
      if (!valueText) throw new ValidationError(`An answer is required for ${label}`);
      const allowed = decodeOptions(question.options);
      if (allowed.length === 0) {
        throw new ValidationError(`Question ${label} has no options configured`);
      }
      const submitted = question.type === 'MULTI_CHOICE' ? valueText.split(',') : [valueText];
      const invalid = submitted.filter((option) => !allowed.includes(option));
      if (invalid.length > 0) {
        throw new ValidationError(`Invalid option(s) for ${label}: ${invalid.join(', ')}`);
      }
      return;
    }
    case 'FREE_TEXT': {
      if (valueText === undefined || valueText === null || valueText.length === 0) {
        throw new ValidationError(`A text answer is required for ${label}`);
      }
      return;
    }
    default:
      return;
  }
}

export class SurveysService {
  async list(user: AuthenticatedUser, query: ListSurveysQuery) {
    const where = {
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.search
        ? { OR: [{ title: { contains: query.search } }, { description: { contains: query.search } }] }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.survey.findMany({
        where,
        select: {
          id: true,
          title: true,
          description: true,
          type: true,
          status: true,
          audience: true,
          isAnonymous: true,
          opensAt: true,
          closesAt: true,
          publishedAt: true,
          createdAt: true,
          department: { select: { id: true, name: true } },
          _count: { select: { questions: true, responses: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.survey.count({ where }),
    ]);

    return {
      items,
      meta: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) },
    };
  }

  async getById(id: string) {
    const survey = await prisma.survey.findFirst({
      where: { id, deletedAt: null },
      include: {
        questions: { orderBy: { order: 'asc' } },
        department: { select: { id: true, name: true, code: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { responses: true } },
      },
    });

    if (!survey) throw new NotFoundError('Survey');
    return {
      ...survey,
      questions: survey.questions.map((question) => ({
        ...question,
        options: decodeOptions(question.options),
        optionsRaw: undefined,
      })),
    };
  }

  async create(user: AuthenticatedUser, input: CreateSurveyInput) {
    if (input.closesAt && input.opensAt && input.closesAt <= input.opensAt) {
      throw new ValidationError('closesAt must be after opensAt');
    }

    const survey = await prisma.survey.create({
      data: {
        title: input.title,
        description: input.description ?? null,
        type: input.type,
        audience: input.audience,
        isAnonymous: input.isAnonymous,
        departmentId: input.departmentId ?? null,
        opensAt: input.opensAt ?? null,
        closesAt: input.closesAt ?? null,
        createdById: user.id,
        questions: {
          create: input.questions.map((question, index) => ({
            prompt: question.prompt,
            description: question.description ?? null,
            type: question.type,
            isRequired: question.isRequired,
            options: encodeOptions(question.options),
            order: index,
            weight: question.weight,
          })),
        },
      },
    });

    return this.getById(survey.id);
  }

  async update(id: string, input: UpdateSurveyInput) {
    const survey = await prisma.survey.findFirst({ where: { id, deletedAt: null } });
    if (!survey) throw new NotFoundError('Survey');

    if (survey.status !== 'DRAFT' && input.questions) {
      const submitted = await prisma.surveyResponse.count({ where: { surveyId: id, status: 'SUBMITTED' } });
      if (submitted > 0) {
        throw new ValidationError('Questions cannot be changed once responses have been submitted');
      }
    }

    return prisma.$transaction(async (tx) => {
      const { questions, ...scalarFields } = input;

      await tx.survey.update({ where: { id }, data: scalarFields });

      if (questions) {
        await tx.surveyQuestion.deleteMany({ where: { surveyId: id } });
        await tx.surveyQuestion.createMany({
          data: questions.map((question, index) => ({
            surveyId: id,
            prompt: question.prompt,
            description: question.description ?? null,
            type: question.type,
            isRequired: question.isRequired,
            options: encodeOptions(question.options),
            order: index,
            weight: question.weight,
          })),
        });
      }

      return this.getById(id);
    });
  }

  async changeStatus(id: string, status: string) {
    const survey = await prisma.survey.findFirst({ where: { id, deletedAt: null } });
    if (!survey) throw new NotFoundError('Survey');

    const allowed: Record<string, string[]> = {
      DRAFT: ['SCHEDULED', 'OPEN', 'ARCHIVED'],
      SCHEDULED: ['OPEN', 'DRAFT', 'ARCHIVED'],
      OPEN: ['CLOSED', 'ARCHIVED'],
      CLOSED: ['ARCHIVED', 'OPEN'],
      ARCHIVED: ['DRAFT'],
    };

    if (!allowed[survey.status]?.includes(status)) {
      throw new ValidationError(`Cannot move a survey from ${survey.status} to ${status}`);
    }

    return prisma.survey.update({
      where: { id },
      data: {
        status,
        ...(status === 'OPEN' && !survey.publishedAt ? { publishedAt: new Date() } : {}),
      },
    });
  }

  async remove(id: string) {
    const survey = await prisma.survey.findFirst({ where: { id, deletedAt: null } });
    if (!survey) throw new NotFoundError('Survey');

    const responses = await prisma.surveyResponse.count({ where: { surveyId: id } });
    if (responses > 0) {
      // Preserve response history; archive instead of deleting.
      await prisma.survey.update({ where: { id }, data: { status: 'ARCHIVED', deletedAt: new Date() } });
      return;
    }

    await prisma.survey.delete({ where: { id } });
  }

  // -------------------------------------------------------------------------
  // Responses
  // -------------------------------------------------------------------------

  /**
   * The caller's own response to a survey, if any.
   *
   * For an anonymous survey the lookup uses the owner hash, since no
   * `respondentId` was stored. The hash itself is stripped from the response so
   * it is never echoed to a client.
   */
  async getOwnResponse(user: AuthenticatedUser, surveyId: string) {
    const survey = await prisma.survey.findFirst({
      where: { id: surveyId, deletedAt: null },
      select: { isAnonymous: true },
    });

    const response = await prisma.surveyResponse.findFirst({
      where: {
        surveyId,
        ...(survey?.isAnonymous ? { anonymousOwnerHash: anonymousOwnerHash(user.id) } : { respondentId: user.id }),
      },
      include: { answers: true },
      orderBy: { startedAt: 'desc' },
    });

    if (!response) return null;
    const { anonymousOwnerHash: _omit, ...rest } = response;
    return rest;
  }

  async submitResponse(user: AuthenticatedUser, input: SubmitResponseInput) {
    const survey = await prisma.survey.findFirst({
      where: { id: input.surveyId, deletedAt: null },
      include: { questions: { orderBy: { order: 'asc' } } },
    });

    if (!survey) throw new NotFoundError('Survey');
    if (survey.status !== 'OPEN') {
      throw new ValidationError('This survey is not currently open');
    }
    if (survey.closesAt && survey.closesAt < new Date()) {
      throw new ValidationError('This survey has already closed');
    }

    const questionMap = new Map(survey.questions.map((question) => [question.id, question]));
    const submitted = new Set(input.answers.map((answer) => answer.questionId));

    for (const questionId of submitted) {
      if (!questionMap.has(questionId)) {
        throw new ValidationError(`Question ${questionId} does not belong to this survey`);
      }
    }
    for (const question of survey.questions) {
      if (question.isRequired && !submitted.has(question.id)) {
        throw new ValidationError(`A required question was not answered: "${question.prompt}"`);
      }
    }

    for (const answer of input.answers) {
      const question = questionMap.get(answer.questionId)!;
      assertAnswerShape(question, answer.valueText, answer.valueNumber);
    }

    const employee = await prisma.employee.findUnique({ where: { userId: user.id }, select: { id: true } });

    // Anonymous surveys deliberately do not persist the respondent identity.
    const respondentId = survey.isAnonymous ? null : user.id;
    const employeeId = survey.isAnonymous ? null : employee?.id ?? null;
    // A keyed hash of the submitter, so an anonymous respondent can still find
    // and amend their own response. It cannot be reversed into a user id.
    const ownerHash = survey.isAnonymous ? anonymousOwnerHash(user.id) : null;

    return prisma.$transaction(async (tx) => {
      // Re-submitting overwrites the previous attempt rather than accumulating
      // rows: a respondent has at most one live response per survey.
      //
      // The lookup must be on `anonymousOwnerHash`, not on `respondentId`. For
      // an anonymous survey `respondentId` is null for *every* row, so matching
      // on it returned whichever anonymous response happened to be first -
      // letting one employee overwrite another's answers.
      const existing = await tx.surveyResponse.findFirst({
        where: {
          surveyId: survey.id,
          ...(survey.isAnonymous ? { anonymousOwnerHash: ownerHash } : { respondentId }),
        },
        orderBy: { startedAt: 'desc' },
      });

      const response = existing
        ? await tx.surveyResponse.update({
            where: { id: existing.id },
            data: {
              status: input.submit ? 'SUBMITTED' : 'IN_PROGRESS',
              submittedAt: input.submit ? new Date() : null,
            },
          })
        : await tx.surveyResponse.create({
            data: {
              surveyId: survey.id,
              respondentId,
              employeeId,
              anonymousOwnerHash: ownerHash,
              status: input.submit ? 'SUBMITTED' : 'IN_PROGRESS',
              submittedAt: input.submit ? new Date() : null,
            },
          });

      await tx.surveyAnswer.deleteMany({ where: { responseId: response.id } });
      await tx.surveyAnswer.createMany({
        data: input.answers.map((answer) => ({
          responseId: response.id,
          questionId: answer.questionId,
          valueText: answer.valueText ?? null,
          valueNumber: answer.valueNumber ?? null,
        })),
      });

      const saved = await tx.surveyResponse.findUniqueOrThrow({
        where: { id: response.id },
        include: { answers: true },
      });

      // The ownership hash is an internal lookup key, not part of the contract.
      const { anonymousOwnerHash: _omit, ...result } = saved;
      return result;
    });
  }

  /**
   * Aggregated results. Individual free-text answers are withheld unless the
   * survey is anonymous, so an HR analyst cannot trace a comment to a person.
   */
  async getResults(user: AuthenticatedUser, surveyId: string) {
    const survey = await prisma.survey.findFirst({
      where: { id: surveyId, deletedAt: null },
      include: { questions: { orderBy: { order: 'asc' } } },
    });
    if (!survey) throw new NotFoundError('Survey');

    const responses = await prisma.surveyResponse.findMany({
      where: { surveyId, status: 'SUBMITTED' },
      include: { answers: true },
    });

    if (responses.length === 0) {
      return { surveyId, responseCount: 0, completionRate: null, questions: [] };
    }

    const perQuestion = survey.questions.map((question) => {
      const answers = responses.flatMap((response) =>
        response.answers.filter((answer) => answer.questionId === question.id),
      );
      const numeric = answers
        .map((answer) => answer.valueNumber)
        .filter((value): value is number => value !== null);

      const average =
        numeric.length > 0 ? numeric.reduce((sum, value) => sum + value, 0) / numeric.length : null;

      const distribution: Record<string, number> = {};
      for (const answer of answers) {
        if (answer.valueText === null) continue;
        for (const key of answer.valueText.split(',')) {
          distribution[key] = (distribution[key] ?? 0) + 1;
        }
      }

      return {
        questionId: question.id,
        prompt: question.prompt,
        type: question.type,
        isAnonymous: survey.isAnonymous,
        answerCount: answers.length,
        average,
        distribution: Object.keys(distribution).length > 0 ? distribution : null,
        // Free-text comments are aggregated for anonymous surveys only.
        comments: survey.isAnonymous
          ? answers.map((answer) => answer.valueText).filter((text): text is string => Boolean(text))
          : undefined,
      };
    });

    return {
      surveyId,
      responseCount: responses.length,
      completionRate: null,
      questions: perQuestion,
    };
  }

  async assertCanManage(user: AuthenticatedUser, surveyId: string): Promise<void> {
    const survey = await prisma.survey.findFirst({ where: { id: surveyId, deletedAt: null } });
    if (!survey) throw new NotFoundError('Survey');
    if (survey.createdById !== user.id && user.role !== 'ADMIN' && user.role !== 'HR') {
      throw new UnauthorizedError('Only the survey owner or HR may manage this survey');
    }
  }
}

export const surveysService = new SurveysService();
