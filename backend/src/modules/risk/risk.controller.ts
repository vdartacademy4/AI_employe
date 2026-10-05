import type { Request, Response } from 'express';
import { asyncHandler } from '../../core/async-handler';
import { riskIdParamSchema, listRiskQuerySchema, runRiskModelSchema } from './risk.schemas';
import { riskService } from './risk.service';

export const riskController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const query = listRiskQuerySchema.parse(req.query);
    const { items, meta } = await riskService.list(req.user!, query);
    res.status(200).json({ data: items, meta });
  }),

  forEmployee: asyncHandler(async (req: Request, res: Response) => {
    const { id } = riskIdParamSchema.parse(req.params);
    const data = await riskService.getForEmployee(req.user!, id);
    res.status(200).json({ data });
  }),

  runModel: asyncHandler(async (req: Request, res: Response) => {
    const input = runRiskModelSchema.parse(req.body);
    const data = await riskService.runModel(req.user!, input);
    res.status(200).json({ data });
  }),
};
