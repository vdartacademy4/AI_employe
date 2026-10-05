import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middleware/auth.middleware';
import { PERMISSIONS } from '../auth/permissions';
import { employeesController } from './employees.controller';

export const employeesRouter = Router();

employeesRouter.use(requireAuth);

employeesRouter.get('/', requirePermission(PERMISSIONS.EMPLOYEE_READ_SELF), employeesController.list);
employeesRouter.get('/me', employeesController.me);
employeesRouter.get('/managers', requirePermission(PERMISSIONS.EMPLOYEE_READ_TEAM), employeesController.listManagers);
employeesRouter.post(
  '/managers',
  requirePermission(PERMISSIONS.EMPLOYEE_WRITE),
  employeesController.assignManager,
);
employeesRouter.delete(
  '/managers/:id',
  requirePermission(PERMISSIONS.EMPLOYEE_WRITE),
  employeesController.endManagerAssignment,
);
employeesRouter.post('/', requirePermission(PERMISSIONS.EMPLOYEE_WRITE), employeesController.create);
employeesRouter.get('/:id', employeesController.getById);
employeesRouter.patch('/:id', requirePermission(PERMISSIONS.EMPLOYEE_WRITE), employeesController.update);
employeesRouter.delete('/:id', requirePermission(PERMISSIONS.EMPLOYEE_WRITE), employeesController.remove);
