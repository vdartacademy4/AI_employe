import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Icons } from '@/components/icons';
import { Button, Callout, ErrorState, LoadingState } from '@/components/ui';
import { aiApi } from '@/lib/api';
import { ApiError } from '@/lib/api-client';
import { formatRelative } from '@/lib/format';
import type { AiProviderInfo, ConversationKind, Message } from '@/types';

/** Starter prompts reflect the three conversation kinds, so a new thread is
 *  immediately purposeful rather than an empty textbox. */
const STARTERS: Record<ConversationKind, { title: string; prompt: string }[]> = {
  CHAT: [
    { title: 'Explain my engagement data', prompt: 'Help me understand what my engagement scores mean and how they are calculated.' },
    { title: 'Prepare for a 1:1', prompt: 'Help me prepare talking points for my next one-to-one with my manager.' },
    { title: 'Understand a survey question', prompt: 'A survey question I answered is unclear to me. Can you help me interpret it?' },
  ],
  CHECK_IN: [
    { title: 'Reflect on my week', prompt: 'I would like to reflect on how my week has gone and what is affecting my energy.' },
    { title: 'Talk about workload', prompt: 'I have been finding my workload difficult. Can we talk it through?' },
  ],
  FEEDBACK: [
    { title: 'Draft feedback', prompt: 'Help me write clear, actionable feedback about something I have experienced at work.' },
    { title: 'Make a suggestion', prompt: 'I have an idea that would improve how we work. Help me turn it into a concrete suggestion.' },
  ],
};

const KIND_LABELS: Record<ConversationKind, string> = {
  CHAT: 'AI Chat',
  CHECK_IN: 'Check-in assistant',
  FEEDBACK: 'Feedback assistant',
};

export function ChatPage() {
  const queryClient = useQueryClient();
  // Other pages deep-link into a specific assistant, e.g. /chat?kind=CHECK_IN.
  const [searchParams, setSearchParams] = useSearchParams();
  const linkedKind = searchParams.get('kind') as ConversationKind | null;
  const [kind, setKind] = useState<ConversationKind>(
    linkedKind && linkedKind in STARTERS ? linkedKind : 'CHAT',
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Follow later link changes without resetting a conversation in progress.
  useEffect(() => {
    if (linkedKind && linkedKind in STARTERS) {
      setKind(linkedKind);
      setActiveId(null);
    }
  }, [linkedKind]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const providerQuery = useQuery({
    queryKey: ['ai', 'provider'],
    queryFn: () => aiApi.provider(),
    staleTime: 5 * 60_000,
  });

  const conversationsQuery = useQuery({
    queryKey: ['ai', 'conversations'],
    queryFn: () => aiApi.listConversations(),
  });

  const conversationQuery = useQuery({
    queryKey: ['ai', 'conversation', activeId],
    queryFn: () => aiApi.getConversation(activeId as string),
    enabled: Boolean(activeId),
  });

  const conversations = useMemo(
    () => conversationsQuery.data?.data.filter((conversation) => conversation.kind === kind) ?? [],
    [conversationsQuery.data, kind],
  );

  const messages = conversationQuery.data?.messages ?? [];
  const isEmpty = !activeId;

  // Keep the transcript pinned to the newest message.
  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages.length, activeId]);

  const startConversation = useMutation({
    mutationFn: () => aiApi.createConversation({ title: 'New conversation', kind }),
    onSuccess: (conversation) => {
      setActiveId(conversation.id);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['ai', 'conversations'] });
      textareaRef.current?.focus();
    },
    onError: (caught) => setError(describeError(caught)),
  });

  const sendMessage = useMutation({
    mutationFn: (content: string) => aiApi.sendMessage(activeId as string, content),
    onSuccess: () => {
      setDraft('');
      void queryClient.invalidateQueries({ queryKey: ['ai', 'conversation', activeId] });
      void queryClient.invalidateQueries({ queryKey: ['ai', 'conversations'] });
    },
    onError: (caught) => setError(describeError(caught)),
  });

  const archiveConversation = useMutation({
    mutationFn: (id: string) => aiApi.archiveConversation(id),
    onSuccess: (_conversation, id) => {
      if (id === activeId) setActiveId(null);
      void queryClient.invalidateQueries({ queryKey: ['ai', 'conversations'] });
    },
    onError: (caught) => setError(describeError(caught)),
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || sendMessage.isPending || !activeId) return;
    setError(null);
    sendMessage.mutate(content);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter inserts a newline.
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSubmit(event);
    }
  }

  const isProviderConfigured = providerQuery.data?.configured ?? false;

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col lg:h-[calc(100vh-3rem)]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">AI Chat</h1>
          <p className="mt-1 text-sm text-slate-600">
            Every conversation is saved to your account and can be resumed at any time.
          </p>
        </div>
        <ProviderBadge provider={providerQuery.data} loading={providerQuery.isLoading} />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[17rem_1fr]">
        {/* Conversation list */}
        <aside className="card flex min-h-0 flex-col overflow-hidden">
          <div className="border-b border-slate-200 p-3">
            <label className="label" htmlFor="kind">
              Assistant
            </label>
            <select
              id="kind"
              className="input"
              value={kind}
              onChange={(event) => {
                const next = event.target.value as ConversationKind;
                setKind(next);
                setActiveId(null);
                setError(null);
                setSearchParams(next === 'CHAT' ? {} : { kind: next }, { replace: true });
              }}
            >
              {Object.entries(KIND_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <Button
              className="mt-3 w-full"
              onClick={() => startConversation.mutate()}
              disabled={startConversation.isPending}
            >
              <Icons.plus className="h-4 w-4" />
              New conversation
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-slim p-2">
            {conversationsQuery.isLoading ? (
              <LoadingState label="Loading chats" />
            ) : conversationsQuery.isError ? (
              <ErrorState message={describeError(conversationsQuery.error)} />
            ) : conversations.length === 0 ? (
              <p className="px-3 py-8 text-center text-xs text-slate-500">
                No saved conversations yet.
                <br />
                Start one above.
              </p>
            ) : (
              <ul className="space-y-1">
                {conversations.map((conversation) => (
                  <li key={conversation.id}>
                    <div
                      className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 ${
                        conversation.id === activeId ? 'bg-brand-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setActiveId(conversation.id);
                          setError(null);
                        }}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="truncate text-sm font-medium text-slate-800">
                          {conversation.title}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {conversation._count?.messages ?? 0} messages ·{' '}
                          {formatRelative(conversation.updatedAt)}
                        </p>
                      </button>
                      <button
                        type="button"
                        className="rounded p-1 text-slate-400 opacity-0 transition-opacity hover:text-rose-600 focus:opacity-100 group-hover:opacity-100"
                        onClick={() => archiveConversation.mutate(conversation.id)}
                        aria-label={`Archive conversation: ${conversation.title}`}
                        title="Archive conversation"
                      >
                        <Icons.trash className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        {/* Transcript */}
        <section className="card flex min-h-0 flex-col overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-slate-900">
                {conversationQuery.data?.title ?? 'New conversation'}
              </h2>
              <p className="text-xs text-slate-500">{KIND_LABELS[kind]}</p>
            </div>
            {activeId ? (
              <Button
                variant="ghost"
                onClick={() => archiveConversation.mutate(activeId)}
                disabled={archiveConversation.isPending}
              >
                Close chat
              </Button>
            ) : null}
          </div>

          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto scrollbar-slim px-4 py-4">
            {isEmpty ? (
              <EmptyThread
                kind={kind}
                isProviderConfigured={isProviderConfigured}
                isLoading={providerQuery.isLoading}
                onStart={() => startConversation.mutate()}
                onPick={(prompt) => {
                  setDraft(prompt);
                  textareaRef.current?.focus();
                }}
              />
            ) : conversationQuery.isLoading ? (
              <LoadingState label="Loading conversation" />
            ) : conversationQuery.isError ? (
              <ErrorState
                message={describeError(conversationQuery.error)}
                onRetry={() => void conversationQuery.refetch()}
              />
            ) : messages.length === 0 ? (
              <div className="flex h-full items-center justify-center px-4 text-center">
                <div>
                  <p className="text-sm font-medium text-slate-900">Start the conversation</p>
                  <p className="mt-1 text-sm text-slate-500">
                    Ask a question below, or pick one of the suggestions.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message) => (
                  <MessageBubble key={message.id} message={message} />
                ))}
                {sendMessage.isPending ? (
                  <MessageBubble
                    message={{
                      id: 'pending',
                      conversationId: activeId ?? '',
                      role: 'assistant',
                      content: '',
                      provider: null,
                      model: null,
                      totalTokens: null,
                      latencyMs: null,
                      error: null,
                      createdAt: new Date().toISOString(),
                      pending: true,
                    }}
                  />
                ) : null}
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 p-3">
            {error ? (
              <div className="mb-2">
                <Callout tone="danger">{error}</Callout>
              </div>
            ) : null}

            <form onSubmit={handleSubmit} className="flex items-end gap-2">
              <textarea
                ref={textareaRef}
                className="input max-h-40 min-h-[2.75rem] flex-1 resize-none py-2.5"
                rows={1}
                value={draft}
                disabled={!activeId || sendMessage.isPending}
                placeholder={
                  activeId
                    ? 'Ask about your engagement data, surveys or wellbeing…'
                    : 'Start a new conversation to begin'
                }
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleKeyDown}
                aria-label="Message"
              />
              <Button
                type="submit"
                disabled={!activeId || !draft.trim() || sendMessage.isPending}
                className="h-11 px-4"
              >
                <Icons.send className="h-4 w-4" />
                <span className="sr-only">Send</span>
              </Button>
            </form>
            <p className="mt-2 px-1 text-xs text-slate-400">
              Press Enter to send, Shift+Enter for a new line. Conversations are private to your
              account.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

function EmptyThread({
  kind,
  isProviderConfigured,
  isLoading,
  onStart,
  onPick,
}: {
  kind: ConversationKind;
  isProviderConfigured: boolean;
  isLoading: boolean;
  onStart: () => void;
  onPick: (prompt: string) => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-4 py-8 text-center">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-brand-600">
        <Icons.chat className="h-5 w-5" />
      </div>
      <h3 className="text-sm font-semibold text-slate-900">{KIND_LABELS[kind]}</h3>
      <p className="mt-1 max-w-md text-sm text-slate-600">
        Start a separate conversation for each topic. You can return to any of them later and the
        full history is kept.
      </p>

      {!isLoading && !isProviderConfigured ? (
        <div className="mt-4 max-w-md">
          <Callout tone="warning" title="AI provider not configured">
            Messages can be composed and saved, but the assistant will reply that no model is
            connected. Set <code className="rounded bg-white px-1">AI_PROVIDER</code> and{' '}
            <code className="rounded bg-white px-1">AI_API_KEY</code> in the backend environment to
            enable responses.
          </Callout>
        </div>
      ) : null}

      <Button className="mt-5" onClick={onStart}>
        <Icons.plus className="h-4 w-4" />
        New conversation
      </Button>

      <div className="mt-6 w-full max-w-lg">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
          Try asking
        </p>
        <div className="grid gap-2 sm:grid-cols-1">
          {STARTERS[kind].map((starter) => (
            <button
              key={starter.title}
              type="button"
              onClick={() => onPick(starter.prompt)}
              className="rounded-lg border border-slate-200 px-3 py-2.5 text-left transition-colors hover:border-brand-300 hover:bg-brand-50"
            >
              <p className="text-sm font-medium text-slate-800">{starter.title}</p>
              <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{starter.prompt}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  if (message.pending) {
    return (
      <div className="flex justify-start">
        <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm bg-slate-100 px-4 py-3">
          <span className="h-2 w-2 animate-pulse rounded-full bg-slate-400" />
          <span className="text-sm text-slate-500">Thinking…</span>
        </div>
      </div>
    );
  }

  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed lg:max-w-[75%] ${
          isUser
            ? 'rounded-br-sm bg-brand-600 text-white'
            : 'rounded-bl-sm bg-slate-100 text-slate-800'
        }`}
      >
        {message.content}
        {!isUser && message.error ? (
          <p className="mt-2 text-xs text-rose-600">{message.error}</p>
        ) : null}
        {!isUser && message.model && message.totalTokens ? (
          <p className="mt-2 text-[0.6875rem] text-slate-400">
            {message.model} · {message.totalTokens} tokens
            {message.latencyMs !== null ? ` · ${message.latencyMs}ms` : ''}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function ProviderBadge({
  provider,
  loading,
}: {
  provider?: AiProviderInfo;
  loading: boolean;
}) {
  if (loading) return <span className="text-xs text-slate-400">Checking AI provider…</span>;

  return (
    <span
      className={`badge ${
        provider?.configured
          ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
          : 'bg-amber-50 text-amber-700 ring-amber-200'
      }`}
    >
      {provider?.configured ? 'AI connected' : 'AI not configured'} · {provider?.id ?? 'unknown'}
    </span>
  );
}

function describeError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'An unexpected error occurred';
}
