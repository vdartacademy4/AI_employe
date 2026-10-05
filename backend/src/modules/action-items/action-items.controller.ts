import type { Request, Response } from 'express';
import { asyncHandler } from '../../core/async-handler';
import {
  actionItemIdParamSchema,
  createActionItemSchema,
  listActionItemsQuerySchema,
  updateActionItemSchema,
} from './action-items.schemas';
import { actionItemsService } from './action-items.service';

export const actionItemsController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const query = listActionItemsQuerySchema.parse(req.query);
    const { items, meta } = await actionItemsService.list(req.user!, query);
    res.status(200).json({ data: items, meta });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const { id } = actionItemIdParamSchema.parse(req.params);
    const data = await actionItemsService.getById(req.user!, id);
    res.status(200).json({ data });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const input = createActionItemSchema.parse(req.body);
    const data = await actionItemsService.create(req.user!, input);
    res.status(201).json({ data });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const { id } = actionItemIdParamSchema.parse(req.params);
    const input = updateActionItemSchema.parse(req.body);
    const data = await actionItemsService.update(req.user!, id, input);
    res.status(200).json({ data });
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    const { id } = actionItemIdParamSchema.parse(req.params);
    await actionItemsService.remove(req.user!, id);
    res.status(204).send();
  }),
};
