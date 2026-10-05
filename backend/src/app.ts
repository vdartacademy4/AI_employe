import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Application, type Request, type Response } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config/env';
import { NotFoundError } from './core/errors';
import { logger } from './core/logger';
import { authenticate } from './middleware/auth.middleware';
import { errorHandler } from './middleware/error.middleware';
import { apiRouter } from './routes';

/**
 * Builds the Express application. Exported separately from the server so tests
 * can mount it without binding a port.
 */
export function createApp(): Application {
  const app = express();

  // Trust the first proxy hop so rate limiting and req.ip see the real client
  // when running behind a load balancer.
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        // Allow same-origin/non-browser callers (health checks, curl).
        if (!origin) return callback(null, true);
        if (config.corsOrigins.includes(origin)) return callback(null, true);
        return callback(new Error(`Origin ${origin} is not allowed by CORS`));
      },
      credentials: true,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  if (!config.isTest) {
    app.use(
      morgan(':method :url :status :response-time[0]ms', {
        skip: (req: Request) => req.url === `${config.apiPrefix}/health`,
      }),
    );
  }

  // Resolve the principal before any route runs, so individual routes only
  // need `requireAuth` / `requirePermission`.
  app.use(authenticate);

  app.use(config.apiPrefix, apiRouter);

  // Unmatched route: consistent envelope rather than Express's HTML page.
  app.use((req: Request, _res: Response, next) => {
    next(new NotFoundError(`Route ${req.method} ${req.originalUrl}`));
  });

  app.use(errorHandler);

  return app;
}

export function logStartup(): void {
  logger.info('API ready', {
    environment: config.env,
    port: config.port,
    prefix: config.apiPrefix,
  });
}
