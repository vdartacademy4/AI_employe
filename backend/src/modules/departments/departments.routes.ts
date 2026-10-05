import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middleware/auth.middleware';
import { PERMISSIONS } from '../auth/permissions';
import { departmentsController } from './departments.controller';

export const departmentsRouter = Router();

departmentsRouter.use(requireAuth);

departmentsRouter.get('/', requirePermission(PERMISSIONS.DEPARTMENT_READ), departmentsController.list);
departmentsRouter.get('/hierarchy', requirePermission(PERMISSIONS.DEPARTMENT_READ), departmentsController.hierarchy);
departmentsRouter.get('/:id', requirePermission(PERMISSIONS.DEPARTMENT_READ), departmentsController.getById);

departmentsRouter.post(
  '/',
  requirePermission(PERMISSIONS.DEPARTMENT_WRITE),
  departmentsController.create,
);
departmentsRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.DEPARTMENT_WRITE),
  departmentsController.update,
);
departmentsRouter.delete(
  '/:id',
  requirePermission(PERMISSIONS.DEPARTMENT_WRITE),
  departmentsController.remove,
);
