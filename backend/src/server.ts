import { config } from './config/env';
import { createApp, logStartup } from './app';
import { connectDatabase, disconnectDatabase } from './core/prisma';
import { logger } from './core/logger';

async function main(): Promise<void> {
  await connectDatabase();

  const app = createApp();
  const server = app.listen(config.port, () => logStartup());

  const shutdown = (signal: string) => {
    logger.info(`Received ${signal}, shutting down`);
    server.close(async () => {
      await disconnectDatabase();
      logger.info('Shutdown complete');
      process.exit(0);
    });
    // Do not let a hung connection block the exit indefinitely.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
  logger.error('Failed to start the server', {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  process.exit(1);
});
