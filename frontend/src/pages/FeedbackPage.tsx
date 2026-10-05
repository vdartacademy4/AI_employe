import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icons } from '@/components/icons';
import {
  Badge,
  BarChart,
  Button,
  Callout,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  PageHeader,
  Select,
  StatusBadge,
  Textarea,
} from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { feedbackApi, settingsApi } from '@/lib/api';
import { ApiError } from '@/lib/api-client';
import { STATUS_CLASSES, formatDate, titleCase } from '@/lib/format';
import type { Feedback, FeedbackStatus } from '@/types';

const CATEGORIES = [
  'WORKLOAD',
  'MANAGEMENT',
  'COMPENSATION',
  'CULTURE',
  'TOOLS',
  'WELLBEING',
  'CAREER_GROWTH',
  'OTHER',
];

const STATUSES: FeedbackStatus[] = [
  'SUBMITTED',
  'IN_REVIEW',
  'ACKNOWLEDGED',
  'ACTIONED',
  'CLOSED',
  'REJECTED',
];

function Composer({ onCreated }: { onCreated: () => void }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('OTHER');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Feedback | null>(null);

  const privacyQuery = useQuery({
    queryKey: ['settings', 'privacy'],
    queryFn: settingsApi.privacy,
  });

  const create = useMutation({
    mutationFn: () =>
      feedbackApi.create({
        title: title.trim() || null,
        content: content.trim(),
        category,
        isAnonymous,
      }),
    onSuccess: (feedback) => {
      setTitle('');
      setContent('');
      setReceipt(feedback);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['feedback'] });
      onCreated();
    },
    onError: (caught) =>
      setError(caught instanceof ApiError ? caught.message : 'Unable to submit your feedback'),
  });

  const allowAnonymous = privacyQuery.data?.settings.feedbackAllowAnonymous ?? true;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setReceipt(null);
    create.mutate();
  }

  return (
    <Card>
      <CardHeader
        title="Share feedback"
        description="Suggestions, concerns or something that is not working. Every submission is recorded and reviewable."
      />
      <form onSubmit={handleSubmit} className="space-y-4 px-5 pb-5">
        <Field label="Summary" htmlFor="feedback-title" hint="Optional. A short headline helps triage.">
          <Input
            id="feedback-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="One line describing the issue"
            maxLength={160}
          />
        </Field>

        <Field label="Category" htmlFor="feedback-category">
          <Select
            id="feedback-category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            {CATEGORIES.map((option) => (
              <option key={option} value={option}>
                {titleCase(option)}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Details" htmlFor="feedback-content">
          <Textarea
            id="feedback-content"
            rows={5}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            required
            placeholder="What happened, what would help, and who it affects…"
          />
        </Field>

        {allowAnonymous ? (
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={isAnonymous}
              onChange={(event) => setIsAnonymous(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <span>
              Submit anonymously
              <span className="block text-xs text-slate-500">
                Your identity is not stored on the record. It is visible to HR only, never to your
                manager.
              </span>
            </span>
          </label>
        ) : (
          <Callout tone="info">
            Anonymous feedback is currently disabled by your administrator, so this submission will
            be attributed to you.
          </Callout>
        )}

        {error ? <Callout tone="danger">{error}</Callout> : null}

        {receipt ? (
          <Callout tone="success" title="Feedback received">
            Your reference is{' '}
            <code className="rounded bg-white px-1 py-0.5 text-xs">{receipt.id}</code>. You can track
            its status under “My submissions”.
          </Callout>
        ) : null}

        <Button type="submit" disabled={create.isPending || !content.trim()}>
          {create.isPending ? 'Submitting…' : 'Submit feedback'}
        </Button>
      </form>
    </Card>
  );
}

function SubmissionList() {
  const query = useQuery({
    queryKey: ['feedback', 'mine'],
    queryFn: feedbackApi.mine,
  });

  if (query.isLoading) return <LoadingState label="Loading your submissions" />;
  if (query.isError) {
    return (
      <ErrorState
        message={query.error instanceof ApiError ? query.error.message : undefined}
        onRetry={() => void query.refetch()}
      />
    );
  }

  const items = query.data?.data ?? [];
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Icons.inbox className="h-9 w-9" />}
        title="No submissions yet"
        description="Anything you submit appears here with its current status."
      />
    );
  }

  return (
    <ul className="divide-y divide-slate-100">
      {items.map((item) => (
        <li key={item.id} className="px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium text-slate-900">{item.title ?? 'Untitled feedback'}</h3>
            <div className="flex items-center gap-2">
              {item.isAnonymous ? (
                <Badge className="bg-slate-100 text-slate-600 ring-slate-200">Anonymous</Badge>
              ) : null}
              <StatusBadge status={item.status} />
            </div>
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-slate-600">{item.content}</p>
          <p className="mt-1.5 text-xs text-slate-400">
            {titleCase(item.category)} · {formatDate(item.createdAt)} ·{' '}
            <code className="rounded bg-slate-100 px-1">{item.id}</code>
          </p>
        </li>
      ))}
    </ul>
  );
}

export function FeedbackPage() {
  const { can, canAny } = useAuth();
  const [tab, setTab] = useState<'compose' | 'mine' | 'inbox'>(
    canAny('feedback:read-all', 'feedback:update') ? 'inbox' : 'compose',
  );

  const tabs = [
    { value: 'compose' as const, label: 'Submit feedback' },
    { value: 'mine' as const, label: 'My submissions' },
    ...(canAny('feedback:read-all', 'feedback:update') ? [{ value: 'inbox' as const, label: 'Inbox' }] : []),
  ];

  return (
    <>
      <PageHeader
        title="Feedback"
        description="Raise a concern or suggestion, follow its progress, and review the queue if you are responsible for it."
      />

      <div className="mb-5 flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
        {tabs.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setTab(item.value)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === item.value
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'compose' ? <Composer onCreated={() => undefined} /> : null}
      {tab === 'mine' ? (
        <Card>
          <CardHeader title="My submissions" description="Status updates as your feedback is reviewed." />
          <SubmissionList />
        </Card>
      ) : null}
      {tab === 'inbox' && can('feedback:read-all') ? <Inbox /> : null}
      {tab === 'inbox' && can('feedback:update') && !can('feedback:read-all') ? <Inbox /> : null}
    </>
  );
}

function Inbox() {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [status, setStatus] = useState<string>('');
  const [category, setCategory] = useState<string>('');

  const query = useQuery({
    queryKey: ['feedback', 'inbox', status, category],
    queryFn: () =>
      feedbackApi.list({
        ...(status ? { status: status as FeedbackStatus } : {}),
        ...(category ? { category } : {}),
        pageSize: 50,
      }),
  });

  const summaryQuery = useQuery({
    queryKey: ['feedback', 'summary'],
    queryFn: feedbackApi.summary,
    enabled: can('feedback:read-all'),
  });

  const update = useMutation({
    mutationFn: ({ id, next }: { id: string; next: FeedbackStatus }) =>
      feedbackApi.update(id, { status: next }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['feedback'] });
    },
  });

  const items = query.data?.data ?? [];

  return (
    <div className="space-y-4">
      {can('feedback:read-all') && summaryQuery.data ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader title="By category" />
            <BarChart
              data={summaryQuery.data.byCategory.map((row) => ({
                label: titleCase(row.key),
                value: row.count,
              }))}
              valueLabel="submissions"
            />
          </Card>
          <Card>
            <CardHeader title="By status" />
            <BarChart
              data={summaryQuery.data.byStatus.map((row) => ({
                label: titleCase(row.key),
                value: row.count,
              }))}
              valueLabel="submissions"
            />
          </Card>
          <Card>
            <CardHeader title="By sentiment" />
            <BarChart
              data={summaryQuery.data.bySentiment.map((row) => ({
                label: titleCase(row.key),
                value: row.count,
              }))}
              valueLabel="submissions"
            />
          </Card>
        </div>
      ) : null}

      <Card>
        <CardHeader
          title="Feedback queue"
          description="Anonymous items never reveal the author. Manager visibility follows your privacy settings."
          actions={
            <div className="flex flex-wrap gap-2">
              <Select
                className="w-auto"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                aria-label="Filter by status"
              >
                <option value="">All statuses</option>
                {STATUSES.map((option) => (
                  <option key={option} value={option}>
                    {titleCase(option)}
                  </option>
                ))}
              </Select>
              <Select
                className="w-auto"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                aria-label="Filter by category"
              >
                <option value="">All categories</option>
                {CATEGORIES.map((option) => (
                  <option key={option} value={option}>
                    {titleCase(option)}
                  </option>
                ))}
              </Select>
            </div>
          }
        />

        {query.isLoading ? (
          <LoadingState label="Loading feedback" />
        ) : query.isError ? (
          <ErrorState
            message={query.error instanceof ApiError ? query.error.message : undefined}
            onRetry={() => void query.refetch()}
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Icons.inbox className="h-9 w-9" />}
            title="Nothing in the queue"
            description="Feedback matching these filters will appear here."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((item) => (
              <FeedbackRow
                key={item.id}
                feedback={item}
                canUpdate={can('feedback:update')}
                onStatusChange={(next) => update.mutate({ id: item.id, next })}
              />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function FeedbackRow({
  feedback,
  canUpdate,
  onStatusChange,
}: {
  feedback: Feedback;
  canUpdate: boolean;
  onStatusChange: (status: FeedbackStatus) => void;
}) {
  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium text-slate-900">
              {feedback.title ?? 'Untitled feedback'}
            </h3>
            <Badge className={STATUS_CLASSES[feedback.status] ?? ''}>{titleCase(feedback.status)}</Badge>
            {feedback.isAnonymous ? (
              <Badge className="bg-slate-100 text-slate-600 ring-slate-200">Anonymous</Badge>
            ) : null}
            {feedback.aiSummary ? (
              <Badge className="bg-violet-50 text-violet-700 ring-violet-200">AI summary</Badge>
            ) : null}
          </div>
          <p className="mt-1.5 whitespace-pre-wrap text-sm text-slate-600">{feedback.content}</p>
          {feedback.aiSummary ? (
            <p className="mt-2 rounded-lg bg-violet-50/60 px-3 py-2 text-xs text-violet-900">
              {feedback.aiSummary}
            </p>
          ) : null}
          <p className="mt-1.5 text-xs text-slate-400">
            {feedback.isAnonymous
              ? 'Author hidden'
              : `${feedback.author?.firstName ?? 'Unknown'} ${feedback.author?.lastName ?? ''}`}{' '}
            · {titleCase(feedback.category)} · {formatDate(feedback.createdAt)}
          </p>
        </div>

        {canUpdate ? (
          <Select
            className="w-auto"
            value={feedback.status}
            onChange={(event) => onStatusChange(event.target.value as FeedbackStatus)}
            aria-label={`Change status for ${feedback.title ?? 'feedback'}`}
          >
            {STATUSES.map((option) => (
              <option key={option} value={option}>
                {titleCase(option)}
              </option>
            ))}
          </Select>
        ) : null}
      </div>
    </li>
  );
}
