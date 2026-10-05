import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middleware/auth.middleware';
import { PERMISSIONS } from '../auth/permissions';
import { checkInsController } from './check-ins.controller';

export const checkInsRouter = Router();

checkInsRouter.use(requireAuth);

// The caller's own check-in: available to every role.
checkInsRouter.get('/status', checkInsController.status);
checkInsRouter.post('/', checkInsController.submit);
checkInsRouter.get('/my', checkInsController.myHistory);

// Team/organisation aggregates, subject to the privacy threshold.
checkInsRouter.get(
  '/summary',
  requirePermission(PERMISSIONS.ANALYTICS_READ_SELF),
  checkInsController.summary,
);
checkInsRouter.get(
  '/',
  requirePermission(PERMISSIONS.ANALYTICS_READ_SELF),
  checkInsController.list,
);
