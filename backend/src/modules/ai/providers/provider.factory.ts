import { config } from '../../../config/env';
import { logger } from '../../../core/logger';
import type { AiProvider } from './ai.provider';
import { GeminiProvider } from './providers.gemini';
import { HttpChatProvider } from './providers.http';
import { NullAiProvider } from './providers.null';

/** Every provider implementation the platform knows about. */
const REGISTRY: Record<string, () => AiProvider> = {
  null: () => new NullAiProvider(),
  http: () => new HttpChatProvider(),
  gemini: () => new GeminiProvider(),
};

let cached: AiProvider | null = null;

/**
 * Resolves the configured provider once per process.
 *
 * An unknown `AI_PROVIDER` value falls back to the null provider and logs a
 * warning rather than crashing: a misconfigured AI setting must not take the
 * whole platform offline.
 */
export function getAiProvider(): AiProvider {
  if (cached) return cached;

  const factory = REGISTRY[config.ai.provider];
  if (!factory) {
    logger.warn('Unknown AI_PROVIDER, falling back to the null provider', {
      configured: config.ai.provider,
      known: Object.keys(REGISTRY),
    });
    cached = new NullAiProvider();
    return cached;
  }

  cached = factory();

  // A real provider that resolved but has no credential would otherwise fail
  // silently on the first chat, long after the mistake was made. Name the
  // specific variable that is missing so the cause is obvious from the log.
  if (!cached.isConfigured()) {
    const missing =
      cached.id === 'gemini'
        ? config.ai.geminiApiKey
          ? ['AI_MODEL']
          : ['GEMINI_API_KEY']
        : config.ai.apiKey
          ? ['AI_MODEL']
          : ['AI_API_KEY'];
    logger.warn('AI provider selected but not configured', {
      provider: cached.id,
      model: config.ai.model ?? null,
      missingEnvVars: missing,
    });
  }

  logger.info('AI provider resolved', { provider: cached.id, configured: cached.isConfigured() });
  return cached;
}

/** Reported to the frontend so the UI can show honest capability badges. */
export function describeAiProvider() {
  const provider = getAiProvider();
  return {
    id: provider.id,
    model: provider.defaultModel,
    configured: provider.isConfigured(),
    capabilities: provider.capabilities,
  };
}
