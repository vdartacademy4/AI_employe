import type { AiProvider, ChatRequest, CompletionRequest, CompletionResult } from './ai.provider';

/**
 * Default provider.
 *
 * It is intentionally *not* a mock: it performs no inference and invents no
 * content. It reports itself as unconfigured, so every AI surface in the
 * product can be built, demonstrated and tested end to end while the real
 * model choice is still open, and a user is never shown fabricated output
 * presented as analysis of their workforce.
 */
export class NullAiProvider implements AiProvider {
  readonly id = 'null';
  readonly defaultModel = 'none';
  readonly capabilities = {
    chat: false,
    sentiment: false,
    embeddings: false,
    summarization: false,
  };

  isConfigured(): boolean {
    return false;
  }

  async complete(_request: CompletionRequest): Promise<CompletionResult> {
    return this.degraded('completion');
  }

  async chat(_request: ChatRequest): Promise<CompletionResult> {
    return this.degraded('chat');
  }

  private degraded(capability: string): CompletionResult {
    return {
      content:
        `The AI ${capability} provider is not configured yet. ` +
        'Set AI_PROVIDER and AI_API_KEY in the backend environment and register a provider ' +
        'implementation under src/modules/ai/providers to enable this feature.',
      model: this.defaultModel,
      provider: this.id,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      latencyMs: 0,
      degraded: true,
      finishReason: 'provider_not_configured',
    };
  }
}
