import type { Request, Response } from 'express';
import { asyncHandler } from '../../core/async-handler';
import {
  employeeIdParamSchema,
  listScoresQuerySchema,
  recordScoreSchema,
  trendsQuerySchema,
} from './engagement.schemas';
import { engagementService } from './engagement.service';

export const engagementController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const query = listScoresQuerySchema.parse(req.query);
    const data = await engagementService.listForUser(req.user!, query);
    res.status(200).json({ data });
  }),

  trends: asyncHandler(async (req: Request, res: Response) => {
    const query = trendsQuerySchema.parse(req.query);
    const data = await engagementService.trends(req.user!, query);
    res.status(200).json({ data });
  }),

  distribution: asyncHandler(async (req: Request, res: Response) => {
    const data = await engagementService.distribution(req.user!);
    res.status(200).json({ data });
  }),

  forEmployee: asyncHandler(async (req: Request, res: Response) => {
    const { employeeId } = employeeIdParamSchema.parse(req.params);
    const data = await engagementService.getForEmployee(req.user!, employeeId);
    res.status(200).json({ data });
  }),

  record: asyncHandler(async (req: Request, res: Response) => {
    const input = recordScoreSchema.parse(req.body);
    const data = await engagementService.recordScore(input);
    res.status(201).json({ data });
  }),
};
