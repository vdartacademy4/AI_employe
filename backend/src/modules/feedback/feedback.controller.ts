import type { Request, Response } from 'express';
import { asyncHandler } from '../../core/async-handler';
import {
  createFeedbackSchema,
  feedbackIdParamSchema,
  listFeedbackQuerySchema,
  updateFeedbackSchema,
} from './feedback.schemas';
import { feedbackService } from './feedback.service';

export const feedbackController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const query = listFeedbackQuerySchema.parse(req.query);
    const { items, meta } = await feedbackService.list(req.user!, query);
    res.status(200).json({ data: items, meta });
  }),

  mySubmissions: asyncHandler(async (req: Request, res: Response) => {
    const data = await feedbackService.mySubmissions(req.user!);
    res.status(200).json({ data: data.items, meta: { anonymousItemsHidden: data.anonymousItemsHidden } });
  }),

  summary: asyncHandler(async (_req: Request, res: Response) => {
    const data = await feedbackService.summary();
    res.status(200).json({ data });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const { id } = feedbackIdParamSchema.parse(req.params);
    const data = await feedbackService.getById(req.user!, id);
    res.status(200).json({ data });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const input = createFeedbackSchema.parse(req.body);
    const data = await feedbackService.create(req.user!, input);
    res.status(201).json({ data });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const { id } = feedbackIdParamSchema.parse(req.params);
    const input = updateFeedbackSchema.parse(req.body);
    const data = await feedbackService.update(req.user!, id, input);
    res.status(200).json({ data });
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    const { id } = feedbackIdParamSchema.parse(req.params);
    await feedbackService.remove(req.user!, id);
    res.status(204).send();
  }),
};
