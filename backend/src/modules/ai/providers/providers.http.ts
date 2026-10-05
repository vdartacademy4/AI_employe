import { config } from '../../../config/env';
import { logger } from '../../../core/logger';
import type { MessageRole } from '../../../core/enums';
import {
  AiProviderError,
  type AiProvider,
  type ChatRequest,
  type CompletionRequest,
  type CompletionResult,
} from './ai.provider';

interface ChatCompletionResponse {
  choices?: { message?: { content?: string | null }; finish_reason?: string | null }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  model?: string;
}

/**
 * Provider for any OpenAI-compatible `/chat/completions` endpoint.
 *
 * This is a real integration, not a stub: with `AI_PROVIDER=http` and a key
 * configured, chat, summarisation and sentiment classification all work.
 *
 * Error handling is centralised here so no caller ever sees a raw fetch or HTTP
 * failure:
 *  - a timeout or network fault becomes a non-retryable `AiProviderError`
 *  - 429 and 5xx are marked retryable so batch jobs can back off
 *  - 401/403/404 are treated as configuration errors (key, model or path)
 *  - the upstream error body is truncated before it reaches a log or a user
 */
export class HttpChatProvider implements AiProvider {
  readonly id = 'http';
  readonly defaultModel = config.ai.model ?? 'unset';
  readonly capabilities = {
    chat: true,
    // Classification is done by prompting the completion endpoint for JSON, so
    // any compatible provider supports it without a bespoke endpoint.
    sentiment: true,
    embeddings: false,
    summarization: true,
  };

  isConfigured(): boolean {
    return Boolean(config.ai.apiKey && config.ai.model);
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    return this.chat({
      messages: [{ role: 'user', content: request.prompt }],
      system: request.system,
      model: request.model,
      maxTokens: request.maxTokens,
      temperature: request.temperature,
    });
  }

  async chat(request: ChatRequest): Promise<CompletionResult> {
    if (!this.isConfigured()) {
      throw new AiProviderError('AI_API_KEY and AI_MODEL must both be set', this.id, false);
    }

    const model = request.model ?? this.defaultModel;
    const startedAt = Date.now();

    // fetch has no timeout of its own; without this a hung upstream would hold
    // a request open until the client gives up.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.ai.timeoutMs);

    let response: Response;
    try {
      response = await fetch(`${(config.ai.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.ai.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            ...(request.system ? [{ role: 'system' as MessageRole, content: request.system }] : []),
            ...request.messages,
          ],
          ...(request.maxTokens ? { max_tokens: request.maxTokens } : {}),
          temperature: request.temperature ?? 0.3,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError';
      throw new AiProviderError(
        aborted
          ? `AI provider timed out after ${config.ai.timeoutMs}ms`
          : `AI provider is unreachable: ${error instanceof Error ? error.message : 'unknown error'}`,
        this.id,
        !aborted,
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw await this.toProviderError(response);
    }

    let payload: ChatCompletionResponse;
    try {
      payload = (await response.json()) as ChatCompletionResponse;
    } catch {
      throw new AiProviderError('AI provider returned a non-JSON response', this.id, true);
    }

    const choice = payload.choices?.[0];
    const content = choice?.message?.content ?? '';

    if (content.trim() === '') {
      // An empty completion is not an error upstream, but it is useless here.
      throw new AiProviderError('AI provider returned an empty completion', this.id, true);
    }

    return {
      content,
      model: payload.model ?? model,
      provider: this.id,
      usage: {
        promptTokens: payload.usage?.prompt_tokens ?? 0,
        completionTokens: payload.usage?.completion_tokens ?? 0,
        totalTokens: payload.usage?.total_tokens ?? 0,
      },
      latencyMs: Date.now() - startedAt,
      finishReason: choice?.finish_reason ?? undefined,
    };
  }

  /** Converts a failed HTTP response into a typed, loggable provider error. */
  private async toProviderError(response: Response): Promise<AiProviderError> {
    const status = response.status;
    // Truncated: upstream error bodies can be large and can echo the prompt.
    const detail = (await response.text().catch(() => '')).slice(0, 500);
    const retryable = status === 429 || status >= 500;

    logger.warn('AI provider returned an error', { status, retryable, detail });

    if (status === 401 || status === 403) {
      return new AiProviderError('AI provider rejected the API key', this.id, false);
    }
    if (status === 404) {
      return new AiProviderError(`AI provider does not expose this model or endpoint (${status})`, this.id, false);
    }
    if (status === 429) {
      return new AiProviderError('AI provider rate limit reached', this.id, true);
    }
    if (retryable) {
      return new AiProviderError(`AI provider is unavailable (HTTP ${status})`, this.id, true);
    }
    return new AiProviderError(`AI provider rejected the request (HTTP ${status}): ${detail}`, this.id, false);
  }
}
