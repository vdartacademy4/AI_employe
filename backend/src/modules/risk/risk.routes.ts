import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middleware/auth.middleware';
import { PERMISSIONS } from '../auth/permissions';
import { riskController } from './risk.controller';

export const riskRouter = Router();

riskRouter.use(requireAuth);

riskRouter.get('/', requirePermission(PERMISSIONS.RISK_READ_SELF), riskController.list);
riskRouter.post(
  '/run',
  requirePermission(PERMISSIONS.RISK_MODEL_RUN),
  riskController.runModel,
);
riskRouter.get(
  '/employee/:id',
  requirePermission(PERMISSIONS.RISK_READ_SELF),
  riskController.forEmployee,
);
