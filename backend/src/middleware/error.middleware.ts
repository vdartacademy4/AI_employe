import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { config } from '../config/env';
import { AppError, ValidationError } from '../core/errors';
import { logger } from '../core/logger';
import { isUniqueConstraintError } from '../core/prisma';

interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
    stack?: string;
  };
}

/**
 * Terminal error middleware. Every failure in the app funnels through here so
 * the response shape is consistent and unexpected faults never leak internals.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ZodError) {
    const validationError = new ValidationError(
      'Validation failed',
      err.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    );
    send(res, validationError);
    return;
  }

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error(err.message, { code: err.code, stack: err.stack });
    } else {
      logger.warn(err.message, { code: err.code });
    }
    send(res, err);
    return;
  }

  if (isUniqueConstraintError(err)) {
    const conflict = new AppError('Resource already exists', 409, 'CONFLICT');
    send(res, conflict);
    return;
  }

  const unexpected = new AppError('Internal server error', 500, 'INTERNAL_ERROR', undefined, false);
  logger.error('Unhandled error', {
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  send(res, unexpected);
}

function send(res: Response, error: AppError): void {
  const body: ErrorBody = {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details !== undefined ? { details: error.details } : {}),
      ...(config.isProduction ? {} : { stack: error.stack }),
    },
  };
  res.status(error.statusCode).json(body);
}
