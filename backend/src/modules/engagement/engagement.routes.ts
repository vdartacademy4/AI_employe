import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middleware/auth.middleware';
import { PERMISSIONS } from '../auth/permissions';
import { engagementController } from './engagement.controller';

export const engagementRouter = Router();

engagementRouter.use(requireAuth);

engagementRouter.get('/', requirePermission(PERMISSIONS.ENGAGEMENT_READ_SELF), engagementController.list);
engagementRouter.get('/trends', requirePermission(PERMISSIONS.ENGAGEMENT_READ_SELF), engagementController.trends);
engagementRouter.get(
  '/distribution',
  requirePermission(PERMISSIONS.ANALYTICS_READ_SELF),
  engagementController.distribution,
);
engagementRouter.get(
  '/employee/:employeeId',
  requirePermission(PERMISSIONS.ENGAGEMENT_READ_SELF),
  engagementController.forEmployee,
);
engagementRouter.post('/', requirePermission(PERMISSIONS.ENGAGEMENT_WRITE), engagementController.record);
