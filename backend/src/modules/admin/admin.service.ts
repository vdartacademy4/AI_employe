import { prisma } from '../../core/prisma';
import { purgeExpiredTokens } from '../auth/auth.refresh-tokens';
import { describeAiProvider } from '../ai/providers/provider.factory';
import { PERMISSIONS, permissionsForRole } from '../auth/permissions';
import { config } from '../../config/env';

/** Administrative read models: row counts and role/permission introspection. */
export class AdminService {
  async stats() {
    const [
      users,
      employees,
      departments,
      surveys,
      surveyResponses,
      feedback,
      engagementScores,
      riskPredictions,
      alerts,
      actionItems,
      reports,
      aiConversations,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.employee.count(),
      prisma.department.count(),
      prisma.survey.count(),
      prisma.surveyResponse.count(),
      prisma.feedback.count(),
      prisma.engagementScore.count(),
      prisma.riskPrediction.count(),
      prisma.alert.count(),
      prisma.actionItem.count(),
      prisma.report.count(),
      prisma.aiConversation.count(),
    ]);

    return {
      users,
      employees,
      departments,
      surveys,
      surveyResponses,
      feedback,
      engagementScores,
      riskPredictions,
      alerts,
      actionItems,
      reports,
      aiConversations,
    };
  }

  /** Row counts per table, grouped by role. Useful during access reviews. */
  async roleBreakdown() {
    const users = await prisma.user.groupBy({ by: ['role'], _count: { _all: true } });
    return users.map((row) => ({
      role: row.role,
      users: row._count._all,
      permissions: permissionsForRole(row.role).length,
    }));
  }

  /** The full RBAC matrix, so the UI can document what each role may do. */
  roleMatrix() {
    const roles = ['EMPLOYEE', 'MANAGER', 'HR', 'ADMIN'] as const;
    return roles.map((role) => ({
      role,
      permissions: permissionsForRole(role),
      total: permissionsForRole(role).length,
    }));
  }

  /** Non-secret runtime configuration, safe to expose to an admin UI. */
  systemInfo() {
    return {
      environment: config.env,
      apiPrefix: config.apiPrefix,
      databaseProvider: config.env === 'production' ? 'postgresql' : 'sqlite',
      ai: describeAiProvider(),
      totalPermissions: Object.keys(PERMISSIONS).length,
      uptimeSeconds: Math.round(process.uptime()),
      nodeVersion: process.version,
    };
  }

  async runMaintenance(input: { purgeExpiredTokens: boolean }) {
    const result: Record<string, number> = {};
    if (input.purgeExpiredTokens) {
      result.purgedRefreshTokens = await purgeExpiredTokens();
    }
    return result;
  }
}

export const adminService = new AdminService();
