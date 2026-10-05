import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middleware/auth.middleware';
import { PERMISSIONS } from '../auth/permissions';
import { analyticsController } from './analytics.controller';

export const analyticsRouter = Router();

analyticsRouter.use(requireAuth);

analyticsRouter.get(
  '/overview',
  requirePermission(PERMISSIONS.ANALYTICS_READ_SELF),
  analyticsController.overview,
);
analyticsRouter.get(
  '/by-department',
  requirePermission(PERMISSIONS.ANALYTICS_READ_SELF),
  analyticsController.byDepartment,
);
analyticsRouter.get(
  '/headcount',
  requirePermission(PERMISSIONS.ANALYTICS_READ_ORG),
  analyticsController.headcount,
);
