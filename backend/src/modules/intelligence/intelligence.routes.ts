import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middleware/auth.middleware';
import { PERMISSIONS } from '../auth/permissions';
import { intelligenceController } from './intelligence.controller';

/**
 * AI Intelligence API.
 *
 * Read routes use the tiered analytics permissions, so a Manager sees their
 * team's trends while HR sees the organisation. Write routes (running analysis,
 * recalculating, approving signals, changing weights) are restricted to
 * `ENGAGEMENT_WRITE`, which is held by Manager, HR and Admin - but the routes
 * that process the whole organisation additionally require
 * `ANALYTICS_READ_ORG` so a Manager cannot kick off an org-wide run.
 */
export const intelligenceRouter = Router();

intelligenceRouter.use(requireAuth);

// ------------------------------------------------------------------- trends

intelligenceRouter.get(
  '/trends/sentiment',
  requirePermission(PERMISSIONS.ANALYTICS_READ_SELF),
  intelligenceController.sentimentTrends,
);

intelligenceRouter.get(
  '/trends/themes',
  requirePermission(PERMISSIONS.ANALYTICS_READ_SELF),
  intelligenceController.themeTrends,
);

intelligenceRouter.get(
  '/trends/engagement',
  requirePermission(PERMISSIONS.ANALYTICS_READ_SELF),
  intelligenceController.engagementTrends,
);

intelligenceRouter.get(
  '/domain-scores',
  requirePermission(PERMISSIONS.ANALYTICS_READ_SELF),
  intelligenceController.domainScores,
);

// ---------------------------------------------------------------- employees

intelligenceRouter.get(
  '/employees',
  requirePermission(PERMISSIONS.ANALYTICS_READ_SELF),
  intelligenceController.employeeBreakdown,
);

intelligenceRouter.get(
  '/employees/:employeeId',
  requirePermission(PERMISSIONS.ENGAGEMENT_READ_SELF),
  intelligenceController.employeeDetail,
);

// ----------------------------------------------------------------- review

intelligenceRouter.get(
  '/analyses',
  requirePermission(PERMISSIONS.ANALYTICS_READ_SELF),
  intelligenceController.recentAnalyses,
);

// ------------------------------------------------------------------ config

intelligenceRouter.get(
  '/factors',
  requirePermission(PERMISSIONS.ANALYTICS_READ_SELF),
  intelligenceController.factorConfigs,
);

intelligenceRouter.patch(
  '/factors/:factorKey',
  requirePermission(PERMISSIONS.ENGAGEMENT_WRITE),
  intelligenceController.updateFactorConfig,
);

// --------------------------------------------------------------- signals

intelligenceRouter.get(
  '/signals',
  requirePermission(PERMISSIONS.ANALYTICS_READ_TEAM),
  intelligenceController.listSignals,
);

intelligenceRouter.post(
  '/signals',
  requirePermission(PERMISSIONS.ENGAGEMENT_WRITE),
  intelligenceController.recordSignal,
);

intelligenceRouter.patch(
  '/signals/:signalId/approval',
  requirePermission(PERMISSIONS.ENGAGEMENT_WRITE),
  intelligenceController.approveSignal,
);

// -------------------------------------------------------------- processing

intelligenceRouter.post(
  '/calculate',
  requirePermission(PERMISSIONS.ENGAGEMENT_WRITE),
  intelligenceController.calculate,
);

// Organisation-wide NLP and scoring: the most expensive and broadest operation,
// so it needs both the write and the organisation read capability.
intelligenceRouter.post(
  '/run',
  requirePermission(PERMISSIONS.ANALYTICS_READ_ORG),
  intelligenceController.refresh,
);

intelligenceRouter.post(
  '/analyse',
  requirePermission(PERMISSIONS.ANALYTICS_READ_ORG),
  intelligenceController.runAnalysis,
);
