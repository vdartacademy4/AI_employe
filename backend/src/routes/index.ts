import { Router } from 'express';
import { actionItemsRouter } from '../modules/action-items/action-items.routes';
import { adminRouter } from '../modules/admin/admin.routes';
import { aiRouter } from '../modules/ai/ai.routes';
import { alertsRouter } from '../modules/alerts/alerts.routes';
import { analyticsRouter } from '../modules/analytics/analytics.routes';
import { authRouter } from '../modules/auth/auth.routes';
import { checkInsRouter } from '../modules/check-ins/check-ins.routes';
import { dailyPulseRouter } from '../modules/daily-pulse/daily-pulse.routes';
import { departmentsRouter } from '../modules/departments/departments.routes';
import { employeesRouter } from '../modules/employees/employees.routes';
import { engagementRouter } from '../modules/engagement/engagement.routes';
import { feedbackRouter } from '../modules/feedback/feedback.routes';
import { intelligenceRouter } from '../modules/intelligence/intelligence.routes';
import { reportsRouter } from '../modules/reports/reports.routes';
import { riskRouter } from '../modules/risk/risk.routes';
import { settingsRouter } from '../modules/settings/settings.routes';
import { surveysRouter } from '../modules/surveys/surveys.routes';

/**
 * Single composition point for the API surface. Each domain owns its own
 * routes; this file only wires them under the configured prefix, so adding a
 * module is one import and one line.
 */
export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => {
  res.status(200).json({
    data: {
      status: 'ok',
      service: 'ai-employee-intelligence-platform',
      timestamp: new Date().toISOString(),
    },
  });
});

apiRouter.use('/auth', authRouter);
apiRouter.use('/admin', adminRouter);
apiRouter.use('/departments', departmentsRouter);
apiRouter.use('/employees', employeesRouter);
apiRouter.use('/surveys', surveysRouter);
apiRouter.use('/check-ins', checkInsRouter);
// The daily pulse owns its own question, submission, dashboard, insight and
// written-feedback routes so the flow is not split across the older survey and
// feedback modules.
apiRouter.use('/daily-pulse', dailyPulseRouter);
apiRouter.use('/feedback', feedbackRouter);
apiRouter.use('/engagement', engagementRouter);
apiRouter.use('/risk', riskRouter);
apiRouter.use('/alerts', alertsRouter);
apiRouter.use('/action-items', actionItemsRouter);
apiRouter.use('/reports', reportsRouter);
apiRouter.use('/settings', settingsRouter);
apiRouter.use('/analytics', analyticsRouter);
apiRouter.use('/intelligence', intelligenceRouter);
apiRouter.use('/ai', aiRouter);
