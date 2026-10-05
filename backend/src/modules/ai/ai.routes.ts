import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middleware/auth.middleware';
import { PERMISSIONS } from '../auth/permissions';
import { aiController } from './ai.controller';

export const aiRouter = Router();

aiRouter.use(requireAuth);

// Fixed routes are declared before `/:id` so they are not shadowed.
aiRouter.get('/provider', aiController.provider);
aiRouter.post('/sentiment', requirePermission(PERMISSIONS.AI_CHAT), aiController.analyzeSentiment);
aiRouter.post('/summarize', requirePermission(PERMISSIONS.AI_CHAT), aiController.summarize);
aiRouter.get('/usage', aiController.usage);

aiRouter.get('/conversations', aiController.listConversations);
aiRouter.post('/conversations', requirePermission(PERMISSIONS.AI_CHAT), aiController.createConversation);
aiRouter.get('/conversations/:id', aiController.getConversation);
aiRouter.post(
  '/conversations/:id/messages',
  requirePermission(PERMISSIONS.AI_CHAT),
  aiController.sendMessage,
);
aiRouter.patch('/conversations/:id/archive', aiController.archiveConversation);
aiRouter.patch('/conversations/:id', aiController.updateConversation);
