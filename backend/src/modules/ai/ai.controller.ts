import type { Request, Response } from 'express';
import { asyncHandler } from '../../core/async-handler';
import { describeAiProvider } from './providers/provider.factory';
import {
  analyzeSentimentSchema,
  conversationIdParamSchema,
  createConversationSchema,
  listConversationsQuerySchema,
  sendMessageSchema,
  summarizeSchema,
  updateConversationSchema,
} from './ai.schemas';
import { aiService } from './ai.service';

export const aiController = {
  provider: asyncHandler(async (_req: Request, res: Response) => {
    res.status(200).json({ data: describeAiProvider() });
  }),

  listConversations: asyncHandler(async (req: Request, res: Response) => {
    const query = listConversationsQuerySchema.parse(req.query);
    const { items, meta } = await aiService.listConversations(req.user!, query);
    res.status(200).json({ data: items, meta });
  }),

  createConversation: asyncHandler(async (req: Request, res: Response) => {
    const input = createConversationSchema.parse(req.body);
    const data = await aiService.createConversation(req.user!, input);
    res.status(201).json({ data });
  }),

  getConversation: asyncHandler(async (req: Request, res: Response) => {
    const { id } = conversationIdParamSchema.parse(req.params);
    const data = await aiService.getConversation(req.user!, id);
    res.status(200).json({ data });
  }),

  sendMessage: asyncHandler(async (req: Request, res: Response) => {
    const { id } = conversationIdParamSchema.parse(req.params);
    const input = sendMessageSchema.parse(req.body);
    const data = await aiService.sendMessage(req.user!, id, input);
    res.status(201).json({ data });
  }),

  archiveConversation: asyncHandler(async (req: Request, res: Response) => {
    const { id } = conversationIdParamSchema.parse(req.params);
    const data = await aiService.archiveConversation(req.user!, id);
    res.status(200).json({ data });
  }),

  updateConversation: asyncHandler(async (req: Request, res: Response) => {
    const { id } = conversationIdParamSchema.parse(req.params);
    const input = updateConversationSchema.parse(req.body);
    const data = await aiService.updateConversation(req.user!, id, input);
    res.status(200).json({ data });
  }),

  analyzeSentiment: asyncHandler(async (req: Request, res: Response) => {
    const input = analyzeSentimentSchema.parse(req.body);
    const data = await aiService.analyzeSentiment(req.user!, input);
    res.status(200).json({ data });
  }),

  summarize: asyncHandler(async (req: Request, res: Response) => {
    const input = summarizeSchema.parse(req.body);
    const data = await aiService.summarize(req.user!, input);
    res.status(200).json({ data });
  }),

  usage: asyncHandler(async (_req: Request, res: Response) => {
    const data = await aiService.usageSummary();
    res.status(200).json({ data });
  }),
};
