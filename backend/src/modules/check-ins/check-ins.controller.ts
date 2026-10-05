import type { Request, Response } from 'express';
import { asyncHandler } from '../../core/async-handler';
import {
  checkInSummaryQuerySchema,
  createCheckInSchema,
  listCheckInsQuerySchema,
} from './check-ins.schemas';
import { checkInsService } from './check-ins.service';

export const checkInsController = {
  status: asyncHandler(async (req: Request, res: Response) => {
    const data = await checkInsService.status(req.user!);
    res.status(200).json({ data });
  }),

  submit: asyncHandler(async (req: Request, res: Response) => {
    const input = createCheckInSchema.parse(req.body);
    const data = await checkInsService.submit(req.user!, input);
    res.status(201).json({ data });
  }),

  myHistory: asyncHandler(async (req: Request, res: Response) => {
    const data = await checkInsService.myHistory(req.user!);
    res.status(200).json({ data });
  }),

  list: asyncHandler(async (req: Request, res: Response) => {
    const query = listCheckInsQuerySchema.parse(req.query);
    const { items, meta } = await checkInsService.list(req.user!, query);
    res.status(200).json({ data: items, meta });
  }),

  summary: asyncHandler(async (req: Request, res: Response) => {
    const query = checkInSummaryQuerySchema.parse(req.query);
    const data = await checkInsService.summary(req.user!, query);
    res.status(200).json({ data });
  }),
};
