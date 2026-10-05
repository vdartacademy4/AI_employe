import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth, requirePermission } from '../../middleware/auth.middleware';
import { authController } from './auth.controller';
import { permissionsForRole, PERMISSIONS } from './permissions';

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many authentication attempts, please try again later',
    },
  },
});

export const authRouter = Router();

/** Public authentication endpoints. */
authRouter.post('/login', loginLimiter, authController.login);
authRouter.post('/register', loginLimiter, authController.register);
authRouter.post('/refresh', authController.refresh);
authRouter.post('/logout', authController.logout);

/** Returns the caller's profile and effective permissions. */
authRouter.get('/me', requireAuth, authController.me);
authRouter.patch('/me', requireAuth, authController.updateProfile);
authRouter.post('/me/change-password', requireAuth, authController.changePassword);

/** Exposes the role -> permission matrix so the UI never hardcodes it. */
authRouter.get('/permissions', requireAuth, (req, res) => {
  res.status(200).json({ data: permissionsForRole(req.user!.role) });
});

/** User administration, restricted to ADMIN. */
authRouter.get(
  '/users',
  requireAuth,
  requirePermission(PERMISSIONS.USER_READ),
  authController.listUsers,
);
authRouter.post(
  '/users',
  requireAuth,
  requirePermission(PERMISSIONS.USER_WRITE),
  authController.createUser,
);
authRouter.patch(
  '/users/:id',
  requireAuth,
  requirePermission(PERMISSIONS.USER_WRITE),
  authController.updateUser,
);
