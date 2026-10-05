import { config } from '../config/env';

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_WEIGHT: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const MIN_LEVEL: Level = config.isProduction ? 'info' : 'debug';

function shouldLog(level: Level): boolean {
  return LEVEL_WEIGHT[level] >= LEVEL_WEIGHT[MIN_LEVEL];
}

function emit(level: Level, message: string, meta?: Record<string, unknown>): void {
  if (!shouldLog(level)) return;

  const entry = {
    level,
    time: new Date().toISOString(),
    message,
    ...(meta ?? {}),
  };

  const line = config.isProduction ? JSON.stringify(entry) : formatHuman(entry);

  // This module is the single place in the app that writes to the console;
  // everywhere else logs through `logger`, which is what makes output
  // suppressible and structured in production.
  /* eslint-disable no-console */
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
  /* eslint-enable no-console */
}

function formatHuman(entry: Record<string, unknown>): string {
  const { time, message, ...rest } = entry;
  const level = String(entry.level).toUpperCase();
  const stamp = String(time).slice(11, 23);
  const tag = level.padEnd(5);
  const extras = Object.keys(rest).length > 0 ? ` ${JSON.stringify(rest)}` : '';
  return `${stamp} ${tag} ${String(message)}${extras}`;
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => emit('debug', message, meta),
  info: (message: string, meta?: Record<string, unknown>) => emit('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => emit('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => emit('error', message, meta),
};
