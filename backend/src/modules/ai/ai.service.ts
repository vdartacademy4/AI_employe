import { NotFoundError, ServiceUnavailableError } from '../../core/errors';
import { prisma } from '../../core/prisma';
import type { AuthenticatedUser } from '../../types/express';
import { getAiProvider } from './providers/provider.factory';
import type { CompletionResult } from './providers/ai.provider';
import type {
  AnalyzeSentimentInput,
  CreateConversationInput,
  ListConversationsQuery,
  SendMessageInput,
  SummarizeInput,
  UpdateConversationInput,
} from './ai.schemas';

/**
 * Per-kind system prompts.
 *
 * These define the assistant's role in each surface and are the natural place
 * to state the boundaries that matter for employee data: a wellbeing assistant
 * must not produce medical or legal conclusions, and must not reveal another
 * employee's information. They are passed to whichever provider is configured,
 * so a real model inherits the guardrails automatically.
 */
const SYSTEM_PROMPTS: Record<string, string> = {
  CHAT: [
    'You are the employee experience assistant inside a workplace intelligence platform.',
    'Help employees understand their own engagement data, surveys and wellbeing resources.',
    'You may only discuss the signed-in employee\'s own records.',
    'Never speculate about, summarise or reveal information about another identifiable employee.',
    'If asked for something outside the platform\'s data, say so plainly and point the user to Settings.',
  ].join(' '),
  CHECK_IN: [
    'You are a check-in assistant helping an employee reflect on how work is going.',
    'Be supportive and concrete. Ask at most one follow-up question per reply.',
    'Do not diagnose mental or physical health conditions, and do not give legal or medical advice.',
    'If the user describes a serious safety or wellbeing risk, encourage them to contact their manager or HR, and the appropriate emergency services where relevant.',
    'You may summarise themes from the employee\'s own check-in history to aid reflection.',
  ].join(' '),
  FEEDBACK: [
    'You are helping an employee prepare workplace feedback, a suggestion or a concern.',
    'Help them make the submission specific and actionable: what happened, what impact it had, and what change would help.',
    'Do not promise that feedback will be shared with anyone, and do not draft anything the employee has not described.',
    'If the feedback describes harassment, discrimination or a safety issue, advise the employee to raise it through the formal HR channel as well.',
  ].join(' '),
};

function systemPromptFor(kind: string): string {
  return SYSTEM_PROMPTS[kind] ?? SYSTEM_PROMPTS.CHAT!;
}

/**
 * Orchestrates AI access: conversation persistence, provider invocation and the
 * usage ledger. Persistence happens here rather than inside a provider, so any
 * provider inherits history, cost accounting and auditability for free.
 */
export class AiService {
  async listConversations(user: AuthenticatedUser, query: ListConversationsQuery) {
    const where = {
      userId: user.id,
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.includeArchived ? {} : { isArchived: false }),
    };

    const [items, total] = await Promise.all([
      prisma.aiConversation.findMany({
        where,
        select: {
          id: true,
          title: true,
          kind: true,
          provider: true,
          model: true,
          isArchived: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { messages: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.aiConversation.count({ where }),
    ]);

    return {
      items,
      meta: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) },
    };
  }

  async createConversation(user: AuthenticatedUser, input: CreateConversationInput) {
    const provider = getAiProvider();
    return prisma.aiConversation.create({
      data: {
        userId: user.id,
        title: input.title,
        kind: input.kind,
        provider: provider.id,
        model: provider.defaultModel,
        context: input.context ? JSON.stringify(input.context) : null,
      },
      select: { id: true, title: true, kind: true, provider: true, model: true, createdAt: true },
    });
  }

  /** Renames or archives a thread from the conversation list. */
  async updateConversation(user: AuthenticatedUser, id: string, input: UpdateConversationInput) {
    const conversation = await prisma.aiConversation.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
    });
    if (!conversation) throw new NotFoundError('Conversation');

    return prisma.aiConversation.update({ where: { id }, data: input });
  }

  async getConversation(user: AuthenticatedUser, id: string) {
    const conversation = await prisma.aiConversation.findFirst({
      where: { id, userId: user.id },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });

    if (!conversation) throw new NotFoundError('Conversation');
    return conversation;
  }

  async archiveConversation(user: AuthenticatedUser, id: string) {
    const conversation = await prisma.aiConversation.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
    });
    if (!conversation) throw new NotFoundError('Conversation');
    return prisma.aiConversation.update({ where: { id }, data: { isArchived: true } });
  }

  /**
   * Persists the user turn, calls the provider, persists the assistant turn and
   * writes a usage event. A provider failure is recorded and re-thrown as a
   * 503 so the chat UI can show a retry affordance.
   */
  async sendMessage(user: AuthenticatedUser, conversationId: string, input: SendMessageInput) {
    const conversation = await prisma.aiConversation.findFirst({
      where: { id: conversationId, userId: user.id },
      include: { messages: { orderBy: { createdAt: 'asc' }, take: 50 } },
    });
    if (!conversation) throw new NotFoundError('Conversation');

    const provider = getAiProvider();

    const userMessage = await prisma.aiMessage.create({
      data: { conversationId, role: 'user', content: input.content },
    });

    let result: CompletionResult;
    try {
      result = await provider.chat({
        messages: [...conversation.messages, userMessage].map((message) => ({
          role: message.role as 'user' | 'assistant' | 'system',
          content: message.content,
        })),
        system: systemPromptFor(conversation.kind),
      });
    } catch (error) {
      await prisma.aiUsageEvent.create({
        data: {
          userId: user.id,
          conversationId,
          provider: provider.id,
          model: provider.defaultModel,
          feature: 'chat',
          success: false,
        },
      });
      throw new ServiceUnavailableError(
        error instanceof Error ? error.message : 'The AI provider is unavailable',
      );
    }

    const assistantMessage = await prisma.aiMessage.create({
      data: {
        conversationId,
        role: 'assistant',
        content: result.content,
        provider: result.provider,
        model: result.model,
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        totalTokens: result.usage.totalTokens,
        latencyMs: result.latencyMs,
      },
    });

    await prisma.aiUsageEvent.create({
      data: {
        userId: user.id,
        conversationId,
        provider: result.provider,
        model: result.model,
        feature: 'chat',
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        totalTokens: result.usage.totalTokens,
        latencyMs: result.latencyMs,
        success: true,
      },
    });

    // Keep the thread list ordered by real activity.
    await prisma.aiConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });

    return { userMessage, assistantMessage, degraded: result.degraded ?? false };
  }

  /**
   * Bulk sentiment classification. Returns a per-text result set; the contract
   * is stable regardless of provider, so downstream consumers (feedback triage,
   * survey comment analysis) are already written when a real model lands.
   */
  async analyzeSentiment(user: AuthenticatedUser, input: AnalyzeSentimentInput) {
    const provider = getAiProvider();
    if (!provider.capabilities.sentiment) {
      return {
        configured: false,
        provider: provider.id,
        results: input.texts.map((text, index) => ({
          index,
          label: null as string | null,
          score: null as number | null,
          text,
        })),
      };
    }

    const results = [];
    for (const [index, text] of input.texts.entries()) {
      const result = await provider.complete({
        prompt: `Classify the sentiment of the following text as POSITIVE, NEUTRAL, NEGATIVE or MIXED, and give a confidence between 0 and 1.\n\n${text}`,
      });
      results.push({ index, text, raw: result.content });
    }

    return { configured: true, provider: provider.id, results };
  }

  async summarize(user: AuthenticatedUser, input: SummarizeInput) {
    const provider = getAiProvider();
    const result = await provider.complete({
      prompt: `Summarise the following in at most ${input.maxWords} words:\n\n${input.content}`,
    });

    await prisma.aiUsageEvent.create({
      data: {
        userId: user.id,
        provider: result.provider,
        model: result.model,
        feature: 'summarize',
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        totalTokens: result.usage.totalTokens,
        latencyMs: result.latencyMs,
        success: true,
      },
    });

    return result;
  }

  /** Token spend per feature, for the Settings page. */
  async usageSummary() {
    const rows = await prisma.aiUsageEvent.groupBy({
      by: ['provider', 'model', 'feature'],
      _sum: { promptTokens: true, completionTokens: true, totalTokens: true },
      _count: { _all: true },
    });

    return rows.map((row) => ({
      provider: row.provider,
      model: row.model,
      feature: row.feature,
      calls: row._count._all,
      totalTokens: row._sum.totalTokens ?? 0,
    }));
  }
}

export const aiService = new AiService();
