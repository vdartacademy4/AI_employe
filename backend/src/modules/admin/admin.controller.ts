import type { Request, Response } from 'express';
import { asyncHandler } from '../../core/async-handler';
import { maintenanceSchema } from './admin.schemas';
import { adminService } from './admin.service';

export const adminController = {
  stats: asyncHandler(async (_req: Request, res: Response) => {
    const data = await adminService.stats();
    res.status(200).json({ data });
  }),

  roles: asyncHandler(async (_req: Request, res: Response) => {
    const data = await adminService.roleBreakdown();
    res.status(200).json({ data });
  }),

  roleMatrix: asyncHandler(async (_req: Request, res: Response) => {
    const data = await adminService.roleMatrix();
    res.status(200).json({ data });
  }),

  system: asyncHandler(async (_req: Request, res: Response) => {
    const data = await adminService.systemInfo();
    res.status(200).json({ data });
  }),

  maintenance: asyncHandler(async (req: Request, res: Response) => {
    const input = maintenanceSchema.parse(req.body ?? {});
    const data = await adminService.runMaintenance(input);
    res.status(200).json({ data });
  }),
};
