import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/**
 * Environment contract. Every process-level dependency is declared here so the
 * app fails fast with one readable error instead of an obscure `undefined`
 * further down the stack.
 */
const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    API_PREFIX: z.string().startsWith('/').default('/api/v1'),
    CORS_ORIGIN: z.string().default('http://localhost:5173'),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

    JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 characters'),
    JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 characters'),
    JWT_ACCESS_TTL: z.string().default('15m'),
    JWT_REFRESH_TTL: z.string().default('7d'),
    BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),

    /**
     * Keyed hash for anonymous-ownership receipts. Must be distinct from the
     * JWT secrets: a leaked JWT secret must never let anyone recompute which
     * anonymous survey response is theirs.
     */
    ANALYTICS_HMAC_SECRET: z.string().min(16, 'ANALYTICS_HMAC_SECRET must be at least 16 characters'),

    AI_PROVIDER: z.string().default('null'),
    /**
     * Credential for OpenAI-compatible providers (`AI_PROVIDER=http`).
     * Gemini uses `GEMINI_API_KEY` instead; both are accepted so a single
     * deployment can carry either without the provider silently reading an
     * undefined key.
     */
    AI_API_KEY: z.string().optional(),
    /** Credential for Google's Gemini API (`AI_PROVIDER=gemini`). */
    GEMINI_API_KEY: z.string().optional(),
    AI_MODEL: z.string().optional(),
    /**
     * Overrides the provider's own default endpoint. Left unset by default so
     * each provider can pick the correct base for its wire format - Gemini does
     * not speak the OpenAI `/chat/completions` dialect.
     */
    AI_BASE_URL: z
      .string()
      .url()
      .optional(),
    AI_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
    /**
     * Ceiling on generated tokens. Reasoning ("thinking") models bill and spend
     * this budget on internal tokens before producing any visible text, so a
     * small ceiling can return an empty completion; the default leaves room.
     */
    AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(64).max(32_768).default(2_048),
  })
  .superRefine((env, ctx) => {
    if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_REFRESH_SECRET'],
        message: 'JWT_REFRESH_SECRET must differ from JWT_ACCESS_SECRET',
      });
    }
    if (env.NODE_ENV === 'production') {
      for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
        if (env[key].includes('replace-me')) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} still holds the template value and cannot be used in production`,
          });
        }
      }
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  // Fail before any server or database work happens.
  throw new Error(`Invalid environment configuration:\n${details}`);
}

const env = parsed.data;

export const config = {
  env: env.NODE_ENV,
  isProduction: env.NODE_ENV === 'production',
  isDevelopment: env.NODE_ENV === 'development',
  isTest: env.NODE_ENV === 'test',
  port: env.PORT,
  apiPrefix: env.API_PREFIX,
  corsOrigins: env.CORS_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  database: {
    url: env.DATABASE_URL,
  },
  jwt: {
    accessSecret: env.JWT_ACCESS_SECRET,
    refreshSecret: env.JWT_REFRESH_SECRET,
    accessTtl: env.JWT_ACCESS_TTL,
    refreshTtl: env.JWT_REFRESH_TTL,
  },
  security: {
    bcryptRounds: env.BCRYPT_ROUNDS,
    hmacSecret: env.ANALYTICS_HMAC_SECRET,
  },
  ai: {
    provider: env.AI_PROVIDER,
    apiKey: env.AI_API_KEY,
    geminiApiKey: env.GEMINI_API_KEY,
    model: env.AI_MODEL,
    baseUrl: env.AI_BASE_URL,
    timeoutMs: env.AI_TIMEOUT_MS,
    maxOutputTokens: env.AI_MAX_OUTPUT_TOKENS,
  },
} as const;

export type AppConfig = typeof config;
