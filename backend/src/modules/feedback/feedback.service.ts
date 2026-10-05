import { ForbiddenError, NotFoundError, ServiceUnavailableError, ValidationError } from '../../core/errors';
import { prisma } from '../../core/prisma';
import { roleHasPermission } from '../auth/permissions';
import { PERMISSIONS } from '../auth/permissions';
import { settingsService } from '../settings/settings.service';
import type { AuthenticatedUser } from '../../types/express';
import type {
  CreateFeedbackInput,
  ListFeedbackQuery,
  UpdateFeedbackInput,
} from './feedback.schemas';

export class FeedbackService {
  /**
   * Employees see only their own submissions; anyone with `feedback:read-all`
   * (HR/Admin) sees the full inbox. Author identity is stripped for anonymous
   * items at the service boundary, not in the view.
   */
  async list(user: AuthenticatedUser, query: ListFeedbackQuery) {
    const canReadAll = roleHasPermission(user.role, PERMISSIONS.FEEDBACK_READ_ALL);

    // A non-HR caller sees only their own attributed submissions.
    //
    // Anonymous items are deliberately *not* included here. They carry no
    // `authorId`, so there is no way to tell whose they are, and the previous
    // `isAnonymous: true` clause therefore published the whole anonymous inbox
    // to every employee. Reading the anonymous pool requires `feedback:read-all`,
    // and a submitter's own anonymous items come from `mySubmissions`, which
    // applies the `feedbackAnonymousSelfVisible` setting.
    const visibility = canReadAll ? {} : { authorId: user.id };

    const where = {
      ...visibility,
      ...(query.status ? { status: query.status } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.sentiment ? { sentiment: query.sentiment } : {}),
      // ANDed, not merged as a sibling `OR`: two `OR` keys on one object
      // silently overwrite each other, which would discard `visibility` and
      // return every row matching the search regardless of ownership.
      ...(query.search
        ? { AND: [{ OR: [{ title: { contains: query.search } }, { content: { contains: query.search } }] }] }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.feedback.findMany({
        where,
        include: {
          // Author identity is only exposed to users who may read all feedback.
          ...(canReadAll
            ? { author: { select: { id: true, firstName: true, lastName: true, email: true } } }
            : {}),
          recipient: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.feedback.count({ where }),
    ]);

    return {
      items: items.map((item) => this.present(item, canReadAll)),
      meta: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) },
    };
  }

  async getById(user: AuthenticatedUser, id: string) {
    const canReadAll = roleHasPermission(user.role, PERMISSIONS.FEEDBACK_READ_ALL);
    const feedback = await prisma.feedback.findUnique({
      where: { id },
      include: {
        ...(canReadAll
          ? { author: { select: { id: true, firstName: true, lastName: true, email: true } } }
          : {}),
        recipient: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!feedback) throw new NotFoundError('Feedback');
    if (!canReadAll && feedback.authorId !== user.id) {
      // Covers the anonymous case too: an anonymous item has no `authorId`, so
      // the previous `&& !feedback.isAnonymous` exemption let any employee read
      // any anonymous item simply by guessing its id.
      throw new ForbiddenError('You are not allowed to view this feedback');
    }

    return this.present(feedback, canReadAll);
  }

  async create(user: AuthenticatedUser, input: CreateFeedbackInput) {
    const privacy = await settingsService.getPrivacySettings();
    if (!privacy.feedbackEnabled) {
      throw new ServiceUnavailableError('Feedback submissions are currently disabled');
    }
    if (input.isAnonymous && !privacy.feedbackAllowAnonymous) {
      throw new ValidationError(
        'Anonymous feedback is not enabled on this platform. Your feedback will be attributed.',
      );
    }
    if (input.recipientId) {
      const recipient = await prisma.employee.findUnique({ where: { id: input.recipientId } });
      if (!recipient) throw new NotFoundError('Feedback recipient');
    }

    // Anonymity is decided by the server, never by the client: if the platform
    // disallows anonymity the submission is stored attributed, and the response
    // tells the user so they are not misled about who can see it.
    const isAnonymous = input.isAnonymous && privacy.feedbackAllowAnonymous;

    const feedback = await prisma.feedback.create({
      data: {
        title: input.title ?? null,
        content: input.content,
        category: input.category,
        channel: input.channel,
        visibility: privacy.feedbackManagerVisible ? input.visibility : 'HR_ONLY',
        isAnonymous,
        authorId: isAnonymous ? null : user.id,
        recipientId: input.recipientId ?? null,
        status: 'SUBMITTED',
      },
      include: { recipient: { select: { id: true, firstName: true, lastName: true } } },
    });

    return {
      ...this.present(feedback, roleHasPermission(user.role, PERMISSIONS.FEEDBACK_READ_ALL)),
      // Anonymity was applied per the configured rules, not as requested.
      submittedAnonymously: isAnonymous,
      anonymousSelfVisible: isAnonymous && privacy.feedbackAnonymousSelfVisible,
    };
  }

  /**
   * The caller's own submissions.
   *
   * An anonymous submission stores no `authorId`, so there is no column that
   * links it back to its author. Returning "every anonymous row" here would hand
   * each employee the entire anonymous inbox, which is the opposite of
   * anonymity. Anonymous items are therefore only visible to principals with
   * `feedback:read-all`, filtered by recipient when they are addressed to one.
   */
  async mySubmissions(user: AuthenticatedUser) {
    const privacy = await settingsService.getPrivacySettings();
    const canReadAll = roleHasPermission(user.role, PERMISSIONS.FEEDBACK_READ_ALL);

    const attributed = await prisma.feedback.findMany({
      where: { authorId: user.id },
      include: { recipient: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
    });

    if (!privacy.feedbackAnonymousSelfVisible) {
      return { items: attributed, anonymousItemsHidden: true };
    }

    // Self-visibility applies to anonymous items addressed to this employee's
    // user account. General anonymous items remain pool-only, so the promise
    // made at submission time is kept without exposing anyone else's entries.
    const self = await prisma.employee.findUnique({ where: { userId: user.id }, select: { id: true } });
    const addressedToMe = self
      ? await prisma.feedback.findMany({
          where: { isAnonymous: true, authorId: null, recipientId: self.id },
          include: { recipient: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { createdAt: 'desc' },
        })
      : [];

    // HR and Admin already see the full pool through `list`, so it is not
    // duplicated here.
    if (canReadAll) {
      return { items: attributed, anonymousItemsHidden: false };
    }

    return {
      items: [...attributed, ...addressedToMe].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
      ),
      anonymousItemsHidden: false,
    };
  }

  async update(user: AuthenticatedUser, id: string, input: UpdateFeedbackInput) {
    const feedback = await prisma.feedback.findUnique({ where: { id } });
    if (!feedback) throw new NotFoundError('Feedback');

    if (input.status) {
      if (!roleHasPermission(user.role, PERMISSIONS.FEEDBACK_UPDATE)) {
        throw new ForbiddenError('You are not allowed to moderate feedback');
      }
      const allowed: Record<string, string[]> = {
        SUBMITTED: ['IN_REVIEW', 'ACKNOWLEDGED', 'REJECTED'],
        IN_REVIEW: ['ACKNOWLEDGED', 'REJECTED'],
        ACKNOWLEDGED: ['ACTIONED', 'CLOSED'],
        ACTIONED: ['CLOSED'],
        CLOSED: [],
        REJECTED: ['IN_REVIEW'],
      };
      if (!allowed[feedback.status]?.includes(input.status)) {
        throw new ValidationError(`Cannot move feedback from ${feedback.status} to ${input.status}`);
      }
    }

    const updated = await prisma.feedback.update({
      where: { id },
      data: {
        ...input,
        ...(input.status === 'ACKNOWLEDGED' ? { acknowledgedAt: new Date() } : {}),
        ...(input.status === 'CLOSED' ? { resolvedAt: new Date() } : {}),
      },
      include: { recipient: { select: { id: true, firstName: true, lastName: true } } },
    });

    return this.present(updated, roleHasPermission(user.role, PERMISSIONS.FEEDBACK_READ_ALL));
  }

  async remove(user: AuthenticatedUser, id: string) {
    const feedback = await prisma.feedback.findUnique({ where: { id } });
    if (!feedback) throw new NotFoundError('Feedback');

    const isOwner = feedback.authorId === user.id;
    if (!isOwner && !roleHasPermission(user.role, PERMISSIONS.FEEDBACK_DELETE)) {
      throw new ForbiddenError('You are not allowed to delete this feedback');
    }
    if (isOwner && feedback.status !== 'SUBMITTED') {
      throw new ValidationError('Feedback can only be withdrawn before it enters review');
    }

    await prisma.feedback.delete({ where: { id } });
  }

  /** Category and sentiment roll-up for the HR dashboard. */
  async summary() {
    const [byCategory, byStatus, bySentiment] = await Promise.all([
      prisma.feedback.groupBy({ by: ['category'], _count: { _all: true } }),
      prisma.feedback.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.feedback.groupBy({ by: ['sentiment'], _count: { _all: true } }),
    ]);

    return {
      byCategory: byCategory.map((row) => ({ key: row.category, count: row._count._all })),
      byStatus: byStatus.map((row) => ({ key: row.status, count: row._count._all })),
      bySentiment: bySentiment
        .filter((row) => row.sentiment !== null)
        .map((row) => ({ key: row.sentiment as string, count: row._count._all })),
    };
  }

  private present<T extends { isAnonymous: boolean; authorId: string | null }>(feedback: T, canReadAll: boolean) {
    if (canReadAll) return feedback;
    return { ...feedback, authorId: null, author: undefined };
  }
}

export const feedbackService = new FeedbackService();
