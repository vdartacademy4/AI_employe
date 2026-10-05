import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middleware/auth.middleware';
import { PERMISSIONS } from '../auth/permissions';
import { surveysController } from './surveys.controller';

export const surveysRouter = Router();

surveysRouter.use(requireAuth);

surveysRouter.get('/', requirePermission(PERMISSIONS.SURVEY_READ), surveysController.list);
surveysRouter.post('/', requirePermission(PERMISSIONS.SURVEY_CREATE), surveysController.create);

// Response routes must be registered before `/:id` to avoid shadowing.
surveysRouter.post('/responses', requirePermission(PERMISSIONS.SURVEY_RESPOND), surveysController.submitResponse);
surveysRouter.get(
  '/:id/results',
  requirePermission(PERMISSIONS.SURVEY_READ_ALL_RESPONSES),
  surveysController.results,
);
surveysRouter.get('/:id/my-response', requirePermission(PERMISSIONS.SURVEY_RESPOND), surveysController.myResponse);
surveysRouter.patch(
  '/:id/status',
  requirePermission(PERMISSIONS.SURVEY_UPDATE),
  surveysController.changeStatus,
);

surveysRouter.get('/:id', requirePermission(PERMISSIONS.SURVEY_READ), surveysController.getById);
surveysRouter.patch('/:id', requirePermission(PERMISSIONS.SURVEY_UPDATE), surveysController.update);
surveysRouter.delete('/:id', requirePermission(PERMISSIONS.SURVEY_DELETE), surveysController.remove);
