import type { Request, Response } from 'express';
import { asyncHandler } from '../../core/async-handler';
import {
  assignManagerSchema,
  createEmployeeSchema,
  employeeIdParamSchema,
  listEmployeesQuerySchema,
  listManagersQuerySchema,
  updateEmployeeSchema,
} from './employees.schemas';
import { employeesService } from './employees.service';

export const employeesController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const query = listEmployeesQuerySchema.parse(req.query);
    const { items, meta } = await employeesService.list(req.user!, query);
    res.status(200).json({ data: items, meta });
  }),

  me: asyncHandler(async (req: Request, res: Response) => {
    const data = await employeesService.getOwnProfile(req.user!);
    res.status(200).json({ data });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const { id } = employeeIdParamSchema.parse(req.params);
    const data = await employeesService.getById(req.user!, id);
    res.status(200).json({ data });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const input = createEmployeeSchema.parse(req.body);
    const data = await employeesService.create(input);
    res.status(201).json({ data });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const { id } = employeeIdParamSchema.parse(req.params);
    const input = updateEmployeeSchema.parse(req.body);
    const data = await employeesService.update(id, input);
    res.status(200).json({ data });
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    const { id } = employeeIdParamSchema.parse(req.params);
    await employeesService.remove(id);
    res.status(204).send();
  }),

  listManagers: asyncHandler(async (req: Request, res: Response) => {
    const query = listManagersQuerySchema.parse(req.query);
    const data = await employeesService.listManagers(query);
    res.status(200).json({ data });
  }),

  assignManager: asyncHandler(async (req: Request, res: Response) => {
    const input = assignManagerSchema.parse(req.body);
    const data = await employeesService.assignManager(input);
    res.status(201).json({ data });
  }),

  endManagerAssignment: asyncHandler(async (req: Request, res: Response) => {
    const { id } = employeeIdParamSchema.parse(req.params);
    const data = await employeesService.endManagerAssignment(id);
    res.status(200).json({ data });
  }),
};
