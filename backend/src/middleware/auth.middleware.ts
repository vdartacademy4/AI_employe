import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ForbiddenError, UnauthorizedError } from '../core/errors';
import { roleHasPermission, type Permission } from '../modules/auth/permissions';
import { verifyAccessToken } from '../modules/auth/auth.tokens';

/**
 * Extracts a bearer token, verifies it and populates `req.user`.
 *
 * Failures are recorded rather than thrown so a single middleware can cover
 * both "optional auth" and "required auth" routes: routes that genuinely need a
 * principal add `requireAuth` afterwards.
 */
export const authenticate = (req: Request, _res: Response, next: NextFunction): void => {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    next();
    return;
  }

  const token = header.slice('Bearer '.length).trim();

  if (!token) {
    next();
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
    };
    next();
  } catch {
    // A malformed or expired token is treated as anonymous; protected routes
    // will answer 401 via `requireAuth`.
    req.user = undefined;
    next();
  }
};

/** Rejects the request when no valid principal was resolved. */
export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.user) {
    next(new UnauthorizedError());
    return;
  }
  next();
};

/**
 * Route guard factory: `requirePermission(PERMISSIONS.SURVEY_CREATE)`.
 * Enforces the matrix declared in `modules/auth/permissions.ts`.
 */
export function requirePermission(permission: Permission): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      next(new UnauthorizedError());
      return;
    }
    if (!roleHasPermission(req.user.role, permission)) {
      next(
        new ForbiddenError(`Role ${req.user.role} is not allowed to perform this action`, {
          required: permission,
        }),
      );
      return;
    }
    next();
  };
}

/**
 * Route guard factory: satisfy any one of several permissions.
 *
 * Needed where two roles reach a surface by different routes through the
 * matrix - a manager holds `*:read-team` while HR holds `*:read-all`, and both
 * are legitimately entitled to the same view. `requirePermission` can only
 * express one of them, and using it for either alone silently locks the other
 * role out.
 */
export function requireAnyPermission(...permissions: Permission[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      next(new UnauthorizedError());
      return;
    }
    if (!permissions.some((permission) => roleHasPermission(req.user!.role, permission))) {
      next(
        new ForbiddenError(`Role ${req.user.role} is not allowed to perform this action`, {
          requiredAnyOf: permissions,
        }),
      );
      return;
    }
    next();
  };
}

/**
 * Route guard factory: allow only the listed roles.
 */
export function requireRole(...roles: string[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      next(new UnauthorizedError());
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(new ForbiddenError(`Requires one of the following roles: ${roles.join(', ')}`));
      return;
    }
    next();
  };
}

/** Rejects the request when no valid principal was resolved. */
export function requirePrincipal(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next(new UnauthorizedError());
    return;
  }
  next();
}
