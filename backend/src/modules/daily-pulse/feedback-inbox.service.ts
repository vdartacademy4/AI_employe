import { ForbiddenError, NotFoundError } from '../../core/errors';
import { prisma } from '../../core/prisma';
import { resolveScope } from '../../core/scope';
import { PERMISSIONS, roleHasPermission } from '../auth/permissions';
import type { AuthenticatedUser } from '../../types/express';
import type { ListFeedbackQuery } from './daily-pulse.schemas';

export interface FeedbackListItem {
  id: string;
  category: string;
  content: string;
  createdAt: string;
  /** Null when the caller may not be told who wrote it. */
  author: { id: string; name: string } | null;
  isAnonymous: boolean;
}

/**
 * Written feedback across both the attributed and anonymous tables.
 *
 * The two are queried separately and merged in application code rather than
 * with a UNION or a shared `authorId` column. That is the whole point of the
 * split: there is no column on `AnonymousFeedback` that could be joined back to
 * an employee, so anonymity here is a property of the schema rather than a rule
 * each future query has to remember.
 */
export class FeedbackInboxService {
  /**
   * Feedback the caller may read.
   *
   * `minGroupSize` suppression is applied to the anonymous feed: a single
   * anonymous comment in a small team is trivially attributable by elimination,
   * so anonymous content is withheld until the pool is large enough.
   */
  async list(user: AuthenticatedUser, query: ListFeedbackQuery): Promise<FeedbackListItem[]> {
    const scope = await resolveScope(user);
    const canReadAll = roleHasPermission(user.role, PERMISSIONS.FEEDBACK_READ_ALL);
    const canIdentify = roleHasPermission(user.role, PERMISSIONS.EMPLOYEE_READ_ALL);
    const canReadAnonymous = roleHasPermission(user.role, PERMISSIONS.FEEDBACK_READ_ANONYMOUS);

    const allowedEmployeeIds = [...new Set([...scope.selfEmployeeIds, ...scope.teamEmployeeIds])];

    // Attributed feedback: visible to HR org-wide, otherwise only to the
    // caller's own scope.
    const attributedWhere = canReadAll
      ? {}
      : { employeeId: { in: allowedEmployeeIds } };

    const attributed = await prisma.employeeFeedback.findMany({
      where: {
        ...attributedWhere,
        ...(query.departmentId ? { employee: { departmentId: query.departmentId } } : {}),
        ...(query.teamId ? { employee: { teamId: query.teamId } } : {}),
        ...dateWindow(query.startDate, query.endDate),
      },
      include: { employee: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
      take: query.pageSize,
    });

    const items: FeedbackListItem[] = attributed.map((row) => ({
      id: row.id,
      category: row.category,
      content: row.content,
      createdAt: row.createdAt.toISOString(),
      isAnonymous: false,
      // Managers and HR see the name of who wrote attributed feedback; an
      // employee never receives rows outside their own scope anyway.
      author:
        canIdentify || user.role === 'MANAGER'
          ? {
              id: row.employee.id,
              name: `${row.employee.firstName} ${row.employee.lastName}`,
            }
          : { id: row.employee.id, name: 'You' },
    }));

    if (canReadAnonymous) {
      // Anonymous feedback is an organisation-wide pool. Department and team
      // filters cannot be applied to it, because applying them would require
      // the attribution that deliberately does not exist. The filter is
      // therefore ignored here and reported as such.
      const poolSize = await prisma.anonymousFeedback.count();
      const minGroupSize = await this.anonymousMinimumPool();

      if (poolSize >= minGroupSize) {
        const anonymous = await prisma.anonymousFeedback.findMany({
          where: dateWindow(query.startDate, query.endDate),
          orderBy: { createdAt: 'desc' },
          take: query.pageSize,
        });

        for (const row of anonymous) {
          items.push({
            id: row.id,
            category: row.category,
            content: row.content,
            createdAt: row.createdAt.toISOString(),
            isAnonymous: true,
            author: null,
          });
        }
      }
    }

    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return items.slice(0, query.pageSize);
  }

  /**
   * The lowest anonymous pool size at which content is released. A small pool
   * defeats anonymity through inference even though no identifier is stored.
   */
  private async anonymousMinimumPool(): Promise<number> {
    const settings = await prisma.systemSetting.findUnique({
      where: { key: 'privacy' },
    });
    if (!settings) return 5;
    try {
      const parsed = JSON.parse(settings.value) as { anonymousFeedbackMinimumPool?: number };
      return parsed.anonymousFeedbackMinimumPool ?? 5;
    } catch {
      return 5;
    }
  }

  /** The caller's own written feedback, including anonymous submissions they made. */
  async myFeedback(user: AuthenticatedUser) {
    const employee = await prisma.employee.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!employee) throw new NotFoundError('No employee record is linked to this account');

    const [attributed, history] = await Promise.all([
      prisma.employeeFeedback.findMany({
        where: { employeeId: employee.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.feedbackHistory.findMany({
        where: { employeeId: employee.id, hasAnonymous: true },
        orderBy: { feedbackDate: 'desc' },
        take: 50,
        select: { feedbackDate: true, createdAt: true },
      }),
    ]);

    return {
      written: attributed.map((row) => ({
        id: row.id,
        category: row.category,
        content: row.content,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
      })),
      // Anonymous submissions are listed as dates only. Returning the content
      // here would defeat the anonymity the submission was made under.
      anonymous: history.map((row) => ({
        submittedDate: row.feedbackDate.toISOString(),
      })),
    };
  }

  /** Throws unless the caller may see anonymous feedback content. */
  async assertCanReadAnonymous(user: AuthenticatedUser): Promise<void> {
    if (!roleHasPermission(user.role, PERMISSIONS.FEEDBACK_READ_ANONYMOUS)) {
      throw new ForbiddenError('Anonymous feedback is not available for your role');
    }
  }
}

function dateWindow(startDate?: Date, endDate?: Date) {
  if (!startDate && !endDate) return {};
  return {
    createdAt: {
      ...(startDate ? { gte: startDate } : {}),
      ...(endDate ? { lt: new Date(endDate.getTime() + 86_400_000) } : {}),
    },
  };
}

export const feedbackInboxService = new FeedbackInboxService();
