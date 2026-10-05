import type { Request, Response } from 'express';
import { asyncHandler } from '../../core/async-handler';
import {
  generateReportSchema,
  listReportsQuerySchema,
  reportIdParamSchema,
} from './reports.schemas';
import { reportsService } from './reports.service';

export const reportsController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const query = listReportsQuerySchema.parse(req.query);
    const { items, meta } = await reportsService.list(req.user!, query);
    res.status(200).json({ data: items, meta });
  }),

  catalogue: asyncHandler(async (_req: Request, res: Response) => {
    const data = reportsService.catalogue();
    res.status(200).json({ data });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const { id } = reportIdParamSchema.parse(req.params);
    const data = await reportsService.getById(req.user!, id);
    res.status(200).json({ data });
  }),

  generate: asyncHandler(async (req: Request, res: Response) => {
    const input = generateReportSchema.parse(req.body);
    const data = await reportsService.generate(req.user!, input);
    res.status(201).json({ data });
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    const { id } = reportIdParamSchema.parse(req.params);
    await reportsService.remove(req.user!, id);
    res.status(204).send();
  }),
};
