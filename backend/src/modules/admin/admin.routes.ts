import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middleware/auth.middleware';
import { PERMISSIONS } from '../auth/permissions';
import { adminController } from './admin.controller';

export const adminRouter = Router();

// Every administration endpoint is ADMIN-only.
adminRouter.use(requireAuth, requirePermission(PERMISSIONS.SYSTEM_MANAGE));

adminRouter.get('/stats', adminController.stats);
adminRouter.get('/roles', adminController.roles);
adminRouter.get('/role-matrix', adminController.roleMatrix);
adminRouter.get('/system', adminController.system);
adminRouter.post('/maintenance', adminController.maintenance);
