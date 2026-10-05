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

/**
 * Google's Gemini `generateContent` API.
 *
 * This is a separate provider rather than a base-URL override on
 * `HttpChatProvider` because Gemini does not speak the OpenAI
 * `/chat/completions` dialect. The differences that matter:
 *
 *  - the credential travels in an `x-goog-api-key` header, not `Authorization`
 *  - the payload is `contents[].parts[].text`, not `messages[].content`
 *  - the assistant role is called `model`, and `system` is a separate
 *    `systemInstruction` field rather than a message
 *  - usage is reported in `usageMetadata`, and reasoning models additionally
 *    report `thoughtsTokenCount`
 *  - a bad key returns HTTP **400** `INVALID_ARGUMENT`, not 401/403, so status
 *    code alone cannot distinguish a bad key from a malformed request
 *
 * All of that is contained here: callers depend only on `AiProvider`.
 */
export class GeminiProvider implements AiProvider {
  readonly id = 'gemini';

  /**
   * `gemini-3.5-flash-lite` answers in roughly a second. The non-lite
   * `gemini-3.5-flash` is a reasoning model: measured at ~23s for a one-line
   * reply, spending ~230 tokens on internal reasoning. It is usable via
   * `AI_MODEL`, but it is a poor default for an interactive chat surface.
   */
  readonly defaultModel = config.ai.model ?? 'gemini-3.5-flash-lite';

  readonly capabilities = {
    chat: true,
    // Classification is done by prompting for JSON, so no bespoke endpoint is
    // needed. `analyzeSentiment` is not routed through here, but a caller that
    // completes a prompt gets the same capability.
    sentiment: true,
    embeddings: false,
    summarization: true,
  };

  private readonly baseUrl = (config.ai.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta').replace(
    /\/$/,
    '',
  );

  isConfigured(): boolean {
    return Boolean(config.ai.geminiApiKey && this.defaultModel);
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
    if (!config.ai.geminiApiKey) {
      throw new AiProviderError(
        'GEMINI_API_KEY is not set. Add it to backend/.env to enable the Gemini provider.',
        this.id,
        false,
      );
    }

    const model = request.model ?? this.defaultModel;
    const system = [request.system, ...request.messages.filter((m) => m.role === 'system').map((m) => m.content)]
      .filter((text): text is string => Boolean(text?.trim()))
      .join('\n\n');

    const contents = toGeminiContents(request.messages);
    if (contents.length === 0) {
      throw new AiProviderError('Gemini requires at least one user message', this.id, false);
    }

    const startedAt = Date.now();
    const payload = {
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents,
      generationConfig: {
        temperature: request.temperature ?? 0.3,
        maxOutputTokens: request.maxTokens ?? config.ai.maxOutputTokens,
      },
    };

    // Transient upstream faults are common on a shared endpoint and the platform
    // is not latency-critical here, so one bounded retry turns a spurious chat
    // failure into a slightly slower success. Configuration errors are not
    // retried - a wrong key fails identically every time.
    const maxAttempts = 2;
    let lastError: AiProviderError | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await this.send(model, payload, startedAt);
      } catch (error) {
        if (!(error instanceof AiProviderError)) throw error;
        lastError = error;
        const canRetry = error.retryable && attempt < maxAttempts;
        logger.warn('Gemini request failed', {
          attempt,
          model,
          retryable: error.retryable,
          message: error.message,
        });
        if (!canRetry) break;
        await sleep(400 * attempt);
      }
    }

    throw lastError ?? new AiProviderError('Gemini request failed', this.id, false);
  }

  /** One HTTP round-trip, with all Gemini wire handling and error mapping. */
  private async send(
    model: string,
    payload: Record<string, unknown>,
    startedAt: number,
  ): Promise<CompletionResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.ai.timeoutMs);

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': config.ai.geminiApiKey!,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError';
      throw new AiProviderError(
        aborted
          ? `Gemini timed out after ${config.ai.timeoutMs}ms`
          : `Gemini is unreachable: ${error instanceof Error ? error.message : 'unknown error'}`,
        this.id,
        !aborted,
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw await this.toProviderError(response, model);
    }

    let body: GeminiResponse;
    try {
      body = (await response.json()) as GeminiResponse;
    } catch {
      throw new AiProviderError('Gemini returned a non-JSON response', this.id, true);
    }

    const candidate = body.candidates?.[0];

    // A prompt blocked before generation has no candidate at all.
    const blockReason = body.promptFeedback?.blockReason;
    if (blockReason) {
      throw new AiProviderError(`Gemini blocked the request (${blockReason})`, this.id, false);
    }

    const content = (candidate?.content?.parts ?? [])
      .map((part) => part.text ?? '')
      .join('')
      .trim();

    if (content === '') {
      // Not an error upstream, but useless here. The finish reason is the only
      // explanation: SAFETY means the content was withheld, MAX_TOKENS means a
      // reasoning model spent the whole budget before emitting text.
      const reason = candidate?.finishReason ?? 'UNKNOWN';
      const hint =
        reason === 'MAX_TOKENS'
          ? ' Raise AI_MAX_OUTPUT_TOKENS, or choose a non-reasoning model.'
          : reason === 'SAFETY'
            ? ' The content was withheld by Gemini safety filters.'
            : '';
      throw new AiProviderError(
        `Gemini returned an empty completion (finishReason=${reason}).${hint}`,
        this.id,
        reason === 'MAX_TOKENS' ? false : true,
      );
    }

    const usage = body.usageMetadata;

    return {
      content,
      model: body.modelVersion ?? model,
      provider: this.id,
      usage: {
        promptTokens: usage?.promptTokenCount ?? 0,
        completionTokens: usage?.candidatesTokenCount ?? 0,
        totalTokens: usage?.totalTokenCount ?? 0,
      },
      latencyMs: Date.now() - startedAt,
      finishReason: candidate?.finishReason ?? undefined,
    };
  }

  /**
   * Maps a failed response to a typed error.
   *
   * Gemini returns **400** for an invalid key, so status alone is ambiguous: a
   * 400 whose message mentions the key is a configuration error, and a 404 is
   * almost always a model that has been retired rather than a typo.
   */
  private async toProviderError(response: Response, model: string): Promise<AiProviderError> {
    const status = response.status;
    // Truncated: upstream bodies can echo the prompt back.
    const raw = (await response.text().catch(() => '')).slice(0, 500);
    let message = raw;
    try {
      const parsed = JSON.parse(raw) as { error?: { message?: string; status?: string } };
      message = parsed.error?.message ?? raw;
    } catch {
      /* keep the raw text */
    }

    const lower = message.toLowerCase();
    const keyProblem = lower.includes('api key') || lower.includes('api_key');
    const retryable = status === 429 || status === 503 || (status >= 500 && status !== 501);

    if (status === 400 && keyProblem) {
      return new AiProviderError('Gemini rejected the API key', this.id, false);
    }
    if (status === 401 || status === 403 || (status === 400 && lower.includes('permission'))) {
      return new AiProviderError('Gemini rejected the API key or blocked this project', this.id, false);
    }
    if (status === 404) {
      return new AiProviderError(
        `Gemini model "${model}" is not available to this key. ` +
          'Older models are retired for new API keys - check the model list and update AI_MODEL.',
        this.id,
        false,
      );
    }
    if (status === 429) {
      return new AiProviderError('Gemini rate limit or quota exceeded', this.id, true);
    }
    if (retryable) {
      return new AiProviderError(`Gemini is unavailable (HTTP ${status})`, this.id, true);
    }
    return new AiProviderError(`Gemini rejected the request (HTTP ${status}): ${message}`, this.id, false);
  }
}

interface GeminiPart {
  text?: string;
}

interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
    thoughtsTokenCount?: number;
  };
  modelVersion?: string;
}

/**
 * Converts the platform's message shape into Gemini's `contents`.
 *
 * Gemini is stricter than the OpenAI dialect about turn structure: the first
 * turn must be `user`, a trailing `model` turn (an unanswered reply awaiting
 * generation) is rejected, and consecutive same-role turns are not valid. Since
 * history comes from the database and may contain anything an earlier provider
 * stored, it is normalised here rather than trusted.
 */
function toGeminiContents(
  messages: { role: MessageRole; content: string }[],
): { role: 'user' | 'model'; parts: GeminiPart[] }[] {
  const turns = messages
    .filter((message) => message.role !== 'system')
    .filter((message) => message.content.trim() !== '')
    .map((message) => ({
      role: (message.role === 'assistant' ? 'model' : 'user') as 'user' | 'model',
      parts: [{ text: message.content }],
    }));

  // Drop leading and trailing model turns, then merge consecutive same-role
  // turns so the alternation invariant holds.
  while (turns.length > 0 && turns[0]!.role === 'model') turns.shift();
  while (turns.length > 0 && turns[turns.length - 1]!.role === 'model') turns.pop();

  const merged: { role: 'user' | 'model'; parts: GeminiPart[] }[] = [];
  for (const turn of turns) {
    const previous = merged[merged.length - 1];
    if (previous && previous.role === turn.role) {
      previous.parts.push(...turn.parts);
    } else {
      merged.push({ role: turn.role, parts: [...turn.parts] });
    }
  }
  return merged;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}