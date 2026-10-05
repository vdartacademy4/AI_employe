import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Wraps an async route handler so a rejected promise is forwarded to Express's
 * error pipeline instead of becoming an unhandled rejection.
 *
 * Without this, every controller would need its own try/catch just to satisfy
 * the error middleware, and a forgotten `await` would hang the request.
 */
export function asyncHandler<
  T extends Request = Request,
  R = unknown,
>(fn: (req: T, res: Response, next: NextFunction) => Promise<R>): RequestHandler {
  return (req, res, next) => {
    void Promise.resolve(fn(req as T, res, next)).catch(next);
  };
}
