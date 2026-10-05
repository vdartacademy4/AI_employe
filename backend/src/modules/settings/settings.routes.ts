import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middleware/auth.middleware';
import { PERMISSIONS } from '../auth/permissions';
import { settingsController } from './settings.controller';

export const settingsRouter = Router();

settingsRouter.use(requireAuth);

// Every authenticated user can read the effective privacy rules: the Feedback
// and Check-in pages need them to explain anonymity and reporting behaviour.
settingsRouter.get('/privacy', settingsController.getPrivacy);

// Only HR/Admin may change them.
settingsRouter.patch(
  '/privacy',
  requirePermission(PERMISSIONS.SYSTEM_MANAGE),
  settingsController.updatePrivacy,
);
