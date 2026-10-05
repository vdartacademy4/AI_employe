import { ForbiddenError, NotFoundError } from '../../core/errors';
import { prisma } from '../../core/prisma';
import { roleHasPermission } from '../auth/permissions';
import { PERMISSIONS } from '../auth/permissions';
import type { AuthenticatedUser } from '../../types/express';
import type { GenerateReportInput, ListReportsQuery } from './reports.schemas';

export type ReportPayload =
  | { kind: 'ENGAGEMENT'; rows: unknown[]; summary: Record<string, unknown> }
  | { kind: 'RISK'; rows: unknown[]; summary: Record<string, unknown> }
  | { kind: 'SURVEY_SUMMARY'; rows: unknown[]; summary: Record<string, unknown> }
  | { kind: 'FEEDBACK_DIGEST'; rows: unknown[]; summary: Record<string, unknown> }
  | { kind: 'TURNOVER'; rows: unknown[]; summary: Record<string, unknown> };

export class ReportsService {
  async list(user: AuthenticatedUser, query: ListReportsQuery) {
    const canReadAll = roleHasPermission(user.role, PERMISSIONS.REPORT_READ_ALL);

    const where = {
      ...(canReadAll ? {} : { generatedById: user.id }),
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.report.findMany({
        where,
        select: {
          id: true,
          title: true,
          description: true,
          type: true,
          format: true,
          status: true,
          errorMessage: true,
          scheduledFor: true,
          startedAt: true,
          completedAt: true,
          createdAt: true,
          generatedBy: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.report.count({ where }),
    ]);

    return {
      items,
      meta: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) },
    };
  }

  /**
   * Builds a report synchronously and records the run.
   *
   * `storageKey` is left null: the aggregation result is returned inline and
   * persisted as the report's own metadata, so the Reports page has something
   * real to show without needing object storage wired up first. A worker-based
   * generator can be added against the same `status` lifecycle.
   */
  async generate(user: AuthenticatedUser, input: GenerateReportInput) {
    if (!roleHasPermission(user.role, PERMISSIONS.REPORT_GENERATE)) {
      throw new ForbiddenError('Your role cannot generate reports');
    }

    const report = await prisma.report.create({
      data: {
        title: input.title ?? defaultTitle(input.type),
        type: input.type,
        format: input.format,
        status: 'RUNNING',
        generatedById: user.id,
        startedAt: new Date(),
        scheduledFor: input.scheduledFor ?? null,
        parameters: JSON.stringify({ format: input.format }),
      },
    });

    try {
      const payload = await this.buildPayload(input.type, user);
      const storageKey = `reports/${report.id}.${input.format.toLowerCase()}`;

      const completed = await prisma.report.update({
        where: { id: report.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          storageKey,
          parameters: JSON.stringify({
            format: input.format,
            rowCount: payload.rows.length,
            kind: payload.kind,
          }),
        },
      });

      return { report: completed, payload };
    } catch (error) {
      await prisma.report.update({
        where: { id: report.id },
        data: {
          status: 'FAILED',
          errorMessage: error instanceof Error ? error.message : 'Report generation failed',
        },
      });
      throw error;
    }
  }

  async getById(user: AuthenticatedUser, id: string) {
    const report = await prisma.report.findUnique({
      where: { id },
      include: { generatedBy: { select: { id: true, firstName: true, lastName: true } } },
    });

    if (!report) throw new NotFoundError('Report');
    if (report.generatedById !== user.id && !roleHasPermission(user.role, PERMISSIONS.REPORT_READ_ALL)) {
      throw new ForbiddenError('You are not allowed to access this report');
    }
    return report;
  }

  async remove(user: AuthenticatedUser, id: string) {
    const report = await prisma.report.findUnique({ where: { id } });
    if (!report) throw new NotFoundError('Report');

    if (report.generatedById !== user.id && !roleHasPermission(user.role, PERMISSIONS.REPORT_READ_ALL)) {
      throw new ForbiddenError('You are not allowed to delete this report');
    }
    await prisma.report.delete({ where: { id } });
  }

  /** The report catalogue exposed to the Reports page. */
  catalogue() {
    return {
      ENGAGEMENT: 'Engagement overview by department and period',
      RISK: 'Attrition risk register with contributing factors',
      TURNOVER: 'Headcount movement and tenure distribution',
      SURVEY_SUMMARY: 'Per-survey participation and score summary',
      FEEDBACK_DIGEST: 'Feedback volume by category, status and sentiment',
      DEPARTMENT_COMPARISON: 'Department-by-department comparison of key measures',
      CUSTOM: 'Ad-hoc report, parameters recorded for audit',
    };
  }

  private async buildPayload(type: GenerateReportInput['type'], user: AuthenticatedUser): Promise<ReportPayload> {
    switch (type) {
      case 'ENGAGEMENT': {
        const rows = await prisma.engagementScore.findMany({
          include: {
            employee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                department: { select: { id: true, name: true } },
              },
            },
          },
          orderBy: [{ period: 'desc' }],
          take: 1000,
        });
        return { kind: 'ENGAGEMENT', rows, summary: { totalScores: rows.length } };
      }
      case 'RISK': {
        const rows = await prisma.riskPrediction.findMany({
          include: {
            employee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                department: { select: { id: true, name: true } },
              },
            },
          },
          orderBy: { riskScore: 'desc' },
          take: 1000,
        });
        return { kind: 'RISK', rows, summary: { totalPredictions: rows.length } };
      }
      case 'SURVEY_SUMMARY': {
        const rows = await prisma.survey.findMany({
          where: { deletedAt: null },
          include: { _count: { select: { responses: true, questions: true } } },
          orderBy: { createdAt: 'desc' },
        });
        return { kind: 'SURVEY_SUMMARY', rows, summary: { totalSurveys: rows.length } };
      }
      case 'FEEDBACK_DIGEST': {
        const rows = await prisma.feedback.findMany({
          include: { recipient: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { createdAt: 'desc' },
          take: 1000,
        });
        return { kind: 'FEEDBACK_DIGEST', rows, summary: { totalFeedback: rows.length } };
      }
      case 'TURNOVER':
      case 'DEPARTMENT_COMPARISON':
      case 'CUSTOM':
      default: {
        const rows = await prisma.employee.findMany({
          where: { deletedAt: null },
          select: {
            id: true,
            employeeNumber: true,
            firstName: true,
            lastName: true,
            jobTitle: true,
            status: true,
            employmentType: true,
            hireDate: true,
            terminationDate: true,
            department: { select: { id: true, name: true } },
          },
          orderBy: { lastName: 'asc' },
          take: 1000,
        });
        return {
          kind: 'TURNOVER',
          rows,
          summary: { totalEmployees: rows.length, requestedBy: user.email, type },
        };
      }
    }
  }
}

function defaultTitle(type: GenerateReportInput['type']): string {
  const titles: Record<string, string> = {
    ENGAGEMENT: 'Engagement report',
    RISK: 'Attrition risk report',
    TURNOVER: 'Turnover report',
    SURVEY_SUMMARY: 'Survey summary report',
    FEEDBACK_DIGEST: 'Feedback digest report',
    DEPARTMENT_COMPARISON: 'Department comparison report',
    CUSTOM: 'Custom report',
  };
  return titles[type] ?? 'Report';
}

export const reportsService = new ReportsService();
