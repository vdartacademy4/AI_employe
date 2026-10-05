/**
 * Express type augmentation.
 *
 * `Request.user` is populated by `authenticate` in
 * `src/middleware/auth.middleware.ts`. Routes that run behind `requireAuth`
 * can rely on it being present; the optional marker forces every consumer to
 * handle the anonymous case explicitly rather than crashing at runtime.
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}
