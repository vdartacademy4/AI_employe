import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middleware/auth.middleware';
import { PERMISSIONS } from '../auth/permissions';
import { alertsController } from './alerts.controller';

export const alertsRouter = Router();

alertsRouter.use(requireAuth);

alertsRouter.get('/', requirePermission(PERMISSIONS.ALERT_READ_OWN), alertsController.list);
alertsRouter.get('/counts', requirePermission(PERMISSIONS.ALERT_READ_OWN), alertsController.counts);
alertsRouter.post('/', requirePermission(PERMISSIONS.ALERT_WRITE), alertsController.create);
alertsRouter.get('/:id', requirePermission(PERMISSIONS.ALERT_READ_OWN), alertsController.getById);
alertsRouter.patch('/:id', requirePermission(PERMISSIONS.ALERT_WRITE), alertsController.update);
alertsRouter.delete('/:id', requirePermission(PERMISSIONS.ALERT_WRITE), alertsController.remove);
