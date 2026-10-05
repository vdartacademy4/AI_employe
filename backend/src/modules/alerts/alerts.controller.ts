import type { Request, Response } from 'express';
import { asyncHandler } from '../../core/async-handler';
import {
  alertIdParamSchema,
  createAlertSchema,
  listAlertsQuerySchema,
  updateAlertSchema,
} from './alerts.schemas';
import { alertsService } from './alerts.service';

export const alertsController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const query = listAlertsQuerySchema.parse(req.query);
    const { items, meta } = await alertsService.list(req.user!, query);
    res.status(200).json({ data: items, meta });
  }),

  counts: asyncHandler(async (req: Request, res: Response) => {
    const data = await alertsService.counts(req.user!);
    res.status(200).json({ data });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const { id } = alertIdParamSchema.parse(req.params);
    const data = await alertsService.getById(req.user!, id);
    res.status(200).json({ data });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const input = createAlertSchema.parse(req.body);
    const data = await alertsService.create(req.user!, input);
    res.status(201).json({ data });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const { id } = alertIdParamSchema.parse(req.params);
    const input = updateAlertSchema.parse(req.body);
    const data = await alertsService.update(req.user!, id, input);
    res.status(200).json({ data });
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    const { id } = alertIdParamSchema.parse(req.params);
    await alertsService.remove(req.user!, id);
    res.status(204).send();
  }),
};
