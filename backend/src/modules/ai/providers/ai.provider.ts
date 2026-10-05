import type { MessageRole } from '../../../core/enums';

/**
 * Provider-neutral contract for every AI capability the platform will need.
 *
 * Services depend on this interface only, never on an SDK. Adding a provider
 * means implementing `AiProvider` in `./providers` and registering it in
 * `provider.factory.ts`; nothing in the modules changes.
 */
export interface AiProvider {
  readonly id: string;
  readonly defaultModel: string;

  /** False when credentials are missing, so the UI can show setup guidance. */
  isConfigured(): boolean;

  /** Single-turn completion. */
  complete(request: CompletionRequest): Promise<CompletionResult>;

  /** Multi-turn completion driven by the full message history. */
  chat(request: ChatRequest): Promise<CompletionResult>;

  /** Optional capabilities; providers omit what they cannot do. */
  readonly capabilities: {
    chat: boolean;
    sentiment: boolean;
    embeddings: boolean;
    summarization: boolean;
  };
}

export interface CompletionRequest {
  prompt: string;
  system?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ChatRequest {
  messages: { role: MessageRole; content: string }[];
  system?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  /** Opaque handles for retrieval-augmented context. */
  context?: Record<string, unknown>;
}

export interface Usage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface CompletionResult {
  content: string;
  model: string;
  provider: string;
  usage: Usage;
  latencyMs: number;
  /** Set when the provider declined to answer, e.g. not configured. */
  degraded?: boolean;
  finishReason?: string;
}

export class AiProviderError extends Error {
  constructor(
    message: string,
    public readonly providerId: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}
