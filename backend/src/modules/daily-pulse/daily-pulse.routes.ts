import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middleware/auth.middleware';
import { PERMISSIONS } from '../auth/permissions';
import { dailyPulseController } from './daily-pulse.controller';

export const dailyPulseRouter = Router();

dailyPulseRouter.use(requireAuth);

// Employee-facing: the five questions and the caller's own submission.
dailyPulseRouter.get('/today', dailyPulseController.today);
dailyPulseRouter.post('/submit', dailyPulseController.submit);
dailyPulseRouter.get('/my', dailyPulseController.myHistory);

// Team/organisation participation. No per-employee flags are ever returned, so
// this does not require employee-read access.
dailyPulseRouter.get(
  '/participation',
  requirePermission(PERMISSIONS.PULSE_READ_TEAM),
  dailyPulseController.participation,
);

/**
 * The answers themselves, not just the count.
 *
 * HR/Admin only, on PULSE_READ_ALL. A manager gets participation counts from
 * `/participation` but not the individual answers: who gave a low rating, and
 * what they wrote about their manager, is the detail that makes a pulse feel
 * surveilled rather than voluntary.
 */
dailyPulseRouter.get(
  '/responses',
  requirePermission(PERMISSIONS.PULSE_READ_ALL),
  dailyPulseController.responses,
);

// HR/Admin configuration.
dailyPulseRouter.get(
  '/questions',
  requirePermission(PERMISSIONS.PULSE_MANAGE),
  dailyPulseController.listQuestions,
);
dailyPulseRouter.get(
  '/config',
  requirePermission(PERMISSIONS.PULSE_MANAGE),
  dailyPulseController.getConfig,
);
dailyPulseRouter.post(
  '/questions',
  requirePermission(PERMISSIONS.PULSE_MANAGE),
  dailyPulseController.createQuestion,
);
dailyPulseRouter.patch(
  '/questions/:id',
  requirePermission(PERMISSIONS.PULSE_MANAGE),
  dailyPulseController.updateQuestion,
);
dailyPulseRouter.patch(
  '/config',
  requirePermission(PERMISSIONS.PULSE_MANAGE),
  dailyPulseController.updateConfig,
);

/**
 * The generated question sets.
 *
 * Declared before `/questions/:id` would be matched only by path shape, but the
 * explicit ordering keeps the read-only views together and makes the intent
 * obvious: these describe sets, that one edits a pool row.
 */
dailyPulseRouter.get(
  '/questions/set',
  requirePermission(PERMISSIONS.PULSE_MANAGE),
  dailyPulseController.questionSet,
);
dailyPulseRouter.get(
  '/questions/sets',
  requirePermission(PERMISSIONS.PULSE_MANAGE),
  dailyPulseController.questionSets,
);
dailyPulseRouter.post(
  '/questions/set/regenerate',
  requirePermission(PERMISSIONS.PULSE_MANAGE),
  dailyPulseController.regenerateQuestionSet,
);

// Dashboards and insight review.
dailyPulseRouter.get('/dashboard', dailyPulseController.dashboard);
dailyPulseRouter.get('/insights', dailyPulseController.listInsights);
dailyPulseRouter.post(
  '/insights/:id/dismiss',
  requirePermission(PERMISSIONS.PULSE_READ_TEAM),
  dailyPulseController.dismissInsight,
);
dailyPulseRouter.get('/my/score', dailyPulseController.recomputeMyScore);

// Written feedback. Listing is guarded by the same "read own" permission every
// role has; the service then applies row scope, and anonymous content is
// released only to roles holding FEEDBACK_READ_ANONYMOUS.
dailyPulseRouter.get('/feedback', dailyPulseController.listFeedback);
dailyPulseRouter.get('/feedback/mine', dailyPulseController.myFeedback);
