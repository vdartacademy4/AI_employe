import type { Request, Response } from 'express';
import { asyncHandler } from '../../core/async-handler';
import { overviewQuerySchema } from './analytics.schemas';
import { analyticsService } from './analytics.service';

export const analyticsController = {
  overview: asyncHandler(async (req: Request, res: Response) => {
    const query = overviewQuerySchema.parse(req.query);
    const data = await analyticsService.overview(req.user!, query);
    res.status(200).json({ data });
  }),

  byDepartment: asyncHandler(async (req: Request, res: Response) => {
    const data = await analyticsService.byDepartment(req.user!);
    res.status(200).json({ data });
  }),

  headcount: asyncHandler(async (req: Request, res: Response) => {
    const data = await analyticsService.headcount();
    res.status(200).json({ data });
  }),
};
