import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middleware/auth.middleware';
import { PERMISSIONS } from '../auth/permissions';
import { reportsController } from './reports.controller';

export const reportsRouter = Router();

reportsRouter.use(requireAuth);

reportsRouter.get('/', requirePermission(PERMISSIONS.REPORT_READ_OWN), reportsController.list);
reportsRouter.get('/catalogue', reportsController.catalogue);
reportsRouter.post(
  '/',
  requirePermission(PERMISSIONS.REPORT_GENERATE),
  reportsController.generate,
);
reportsRouter.get('/:id', reportsController.getById);
reportsRouter.delete(
  '/:id',
  requirePermission(PERMISSIONS.REPORT_READ_ALL),
  reportsController.remove,
);
