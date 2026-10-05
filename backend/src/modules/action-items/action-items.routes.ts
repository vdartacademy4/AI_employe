import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middleware/auth.middleware';
import { PERMISSIONS } from '../auth/permissions';
import { actionItemsController } from './action-items.controller';

export const actionItemsRouter = Router();

actionItemsRouter.use(requireAuth);

actionItemsRouter.get(
  '/',
  requirePermission(PERMISSIONS.ACTION_ITEM_READ_OWN),
  actionItemsController.list,
);
actionItemsRouter.post(
  '/',
  requirePermission(PERMISSIONS.ACTION_ITEM_WRITE),
  actionItemsController.create,
);
actionItemsRouter.get('/:id', actionItemsController.getById);
actionItemsRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.ACTION_ITEM_WRITE),
  actionItemsController.update,
);
actionItemsRouter.delete(
  '/:id',
  requirePermission(PERMISSIONS.ACTION_ITEM_WRITE),
  actionItemsController.remove,
);
