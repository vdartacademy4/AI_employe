import type { Request, Response } from 'express';
import { asyncHandler } from '../../core/async-handler';
import {
  adminCreateUserSchema,
  adminUpdateUserSchema,
  changePasswordSchema,
  listUsersQuerySchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  updateProfileSchema,
  userIdParamSchema,
} from './auth.schemas';
import { authService } from './auth.service';

function requestContext(req: Request) {
  return {
    userAgent: req.get('user-agent') ?? undefined,
    ipAddress: req.ip,
  };
}

export const authController = {
  login: asyncHandler(async (req: Request, res: Response) => {
    const input = loginSchema.parse(req.body);
    const result = await authService.login(input, requestContext(req));
    res.status(200).json({ data: result });
  }),

  register: asyncHandler(async (req: Request, res: Response) => {
    const input = registerSchema.parse(req.body);
    const result = await authService.register(input, requestContext(req));
    res.status(201).json({ data: result });
  }),

  refresh: asyncHandler(async (req: Request, res: Response) => {
    const { refreshToken } = refreshSchema.parse(req.body);
    const result = await authService.refresh(refreshToken, requestContext(req));
    res.status(200).json({ data: result });
  }),

  logout: asyncHandler(async (req: Request, res: Response) => {
    const { refreshToken } = refreshSchema.parse(req.body);
    await authService.logout(refreshToken);
    res.status(204).send();
  }),

  me: asyncHandler(async (req: Request, res: Response) => {
    const data = await authService.me(req.user!.id);
    res.status(200).json({ data });
  }),

  updateProfile: asyncHandler(async (req: Request, res: Response) => {
    const input = updateProfileSchema.parse(req.body);
    const data = await authService.updateProfile(req.user!.id, input);
    res.status(200).json({ data });
  }),

  changePassword: asyncHandler(async (req: Request, res: Response) => {
    const input = changePasswordSchema.parse(req.body);
    await authService.changePassword(req.user!.id, input);
    res.status(204).send();
  }),

  listUsers: asyncHandler(async (req: Request, res: Response) => {
    const query = listUsersQuerySchema.parse(req.query);
    const { items, meta } = await authService.listUsers(query);
    res.status(200).json({ data: items, meta });
  }),

  createUser: asyncHandler(async (req: Request, res: Response) => {
    const input = adminCreateUserSchema.parse(req.body);
    const data = await authService.createUser(input);
    res.status(201).json({ data });
  }),

  updateUser: asyncHandler(async (req: Request, res: Response) => {
    const { id } = userIdParamSchema.parse(req.params);
    const input = adminUpdateUserSchema.parse(req.body);
    const data = await authService.updateUser(id, input, req.user!.id);
    res.status(200).json({ data });
  }),
};
