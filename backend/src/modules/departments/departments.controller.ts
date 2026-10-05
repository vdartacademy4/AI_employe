import type { NextFunction, Request, Response } from 'express';
import { asyncHandler } from '../../core/async-handler';
import {
  createDepartmentSchema,
  departmentIdParamSchema,
  listDepartmentsQuerySchema,
  updateDepartmentSchema,
} from './departments.schemas';
import { departmentsService } from './departments.service';

export const departmentsController = {
  list: asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const query = listDepartmentsQuerySchema.parse(req.query);
    const data = await departmentsService.list(query);
    res.status(200).json({ data });
  }),

  hierarchy: asyncHandler(async (_req: Request, res: Response) => {
    const data = await departmentsService.getHierarchy();
    res.status(200).json({ data });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const { id } = departmentIdParamSchema.parse(req.params);
    const data = await departmentsService.getById(id);
    res.status(200).json({ data });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const input = createDepartmentSchema.parse(req.body);
    const data = await departmentsService.create(input);
    res.status(201).json({ data });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const { id } = departmentIdParamSchema.parse(req.params);
    const input = updateDepartmentSchema.parse(req.body);
    const data = await departmentsService.update(id, input);
    res.status(200).json({ data });
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    const { id } = departmentIdParamSchema.parse(req.params);
    await departmentsService.remove(id);
    res.status(204).send();
  }),
};
