import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middleware/auth.middleware';
import { PERMISSIONS } from '../auth/permissions';
import { feedbackController } from './feedback.controller';

export const feedbackRouter = Router();

feedbackRouter.use(requireAuth);

feedbackRouter.get('/', requirePermission(PERMISSIONS.FEEDBACK_READ_OWN), feedbackController.list);
feedbackRouter.get('/mine', requirePermission(PERMISSIONS.FEEDBACK_READ_OWN), feedbackController.mySubmissions);
feedbackRouter.get('/summary', requirePermission(PERMISSIONS.FEEDBACK_READ_ALL), feedbackController.summary);
feedbackRouter.post('/', requirePermission(PERMISSIONS.FEEDBACK_CREATE), feedbackController.create);
feedbackRouter.get('/:id', requirePermission(PERMISSIONS.FEEDBACK_READ_OWN), feedbackController.getById);
feedbackRouter.patch('/:id', requirePermission(PERMISSIONS.FEEDBACK_UPDATE), feedbackController.update);
feedbackRouter.delete('/:id', requirePermission(PERMISSIONS.FEEDBACK_DELETE), feedbackController.remove);
