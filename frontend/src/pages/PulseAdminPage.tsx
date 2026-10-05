import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader, Card, CardHeader, Button, Callout, EmptyState, LoadingState, ErrorState, Badge, Input, Textarea, Field } from '@/components/ui';
import { dailyPulseApi } from '@/lib/api';
import type { DailyAnswerType, DailyQuestionSet, DailyPulseResponseDetail } from '@/types';

const ANSWER_TYPES: Array<{ value: DailyAnswerType; label: string; needsOptions: boolean }> = [
  { value: 'RATING', label: 'Rating (1-5)', needsOptions: false },
  { value: 'YES_NO', label: 'Yes / No', needsOptions: false },
  { value: 'MULTIPLE_CHOICE', label: 'Multiple choice', needsOptions: true },
  { value: 'SHORT_TEXT', label: 'Short text', needsOptions: false },
];

/**
 * HR/Admin view of the daily pulse.
 *
 * Two things are deliberately not editable here: the five questions employees
 * answer each day, and the wording of any day already asked. Both are decided
 * by the daily rotation and frozen once written, because answers recorded
 * against a question that later changes stop meaning what they said.
 */
export function PulseAdminPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [viewDate, setViewDate] = useState(() => todayInputValue());

  const questions = useQuery({ queryKey: ['pulse', 'questions'], queryFn: () => dailyPulseApi.listQuestions() });
  const config = useQuery({ queryKey: ['pulse', 'config'], queryFn: () => dailyPulseApi.getConfig() });
  const recentSets = useQuery({ queryKey: ['pulse', 'questionSets'], queryFn: () => dailyPulseApi.recentQuestionSets({ limit: 14 }) });
  const todaysSet = useQuery({
    queryKey: ['pulse', 'questionSet', viewDate],
    queryFn: () => dailyPulseApi.questionSet({ date: viewDate }),
  });
  const responses = useQuery({
    queryKey: ['pulse', 'responses', viewDate],
    queryFn: () => dailyPulseApi.responses({ date: viewDate }),
  });

  const createQuestion = useMutation({
    mutationFn: (payload: Parameters<typeof dailyPulseApi.createQuestion>[0]) =>
      dailyPulseApi.createQuestion(payload),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['pulse'] }),
  });

  const updateQuestion = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof dailyPulseApi.updateQuestion>[1] }) =>
      dailyPulseApi.updateQuestion(id, payload),
    onSuccess: () => {
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ['pulse'] });
    },
  });

  const updateConfig = useMutation({
    mutationFn: (payload: Parameters<typeof dailyPulseApi.updateConfig>[0]) =>
      dailyPulseApi.updateConfig(payload),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['pulse'] }),
  });

  const regenerate = useMutation({
    mutationFn: (date: string) => dailyPulseApi.regenerateQuestionSet({ date }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pulse', 'questionSet'] });
      void queryClient.invalidateQueries({ queryKey: ['pulse', 'questionSets'] });
    },
  });

  if (questions.isLoading || config.isLoading) return <LoadingState label="Loading pulse settings" />;
  if (questions.isError || config.isError) {
    return <ErrorState title="Could not load pulse settings" onRetry={() => void questions.refetch()} />;
  }

  const items = questions.data ?? [];
  const settings = config.data;
  const todaysQuestions = todaysSet.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Daily Pulse Settings"
        description="Review the questions asked each day and the responses they collected."
      />

      <Card>
        <CardHeader title="Submission policy" />
        <div className="space-y-4">
          <label className="flex items-start gap-3 text-sm text-slate-700">
            <input
              type="checkbox"
              className="mt-1"
              checked={settings?.allowResubmission ?? false}
              onChange={(event) => updateConfig.mutate({ allowResubmission: event.target.checked })}
            />
            <span>
              Allow employees to submit again the same day
              <span className="block text-xs text-slate-500">
                Off by default. When on, a resubmission replaces the previous answers rather than adding to them.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 text-sm text-slate-700">
            <input
              type="checkbox"
              className="mt-1"
              checked={settings?.isActive ?? true}
              onChange={(event) => updateConfig.mutate({ isActive: event.target.checked })}
            />
            <span>
              Pulse is active
              <span className="block text-xs text-slate-500">
                Turning this off pauses submissions without deleting any history.
              </span>
            </span>
          </label>

          <p className="text-xs text-slate-500">
            Questions per day is fixed at {settings?.questionsPerDay ?? 5} by the product specification.
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Today’s questions"
          description="Prepared automatically each day: the model writes them, and the curated bank covers any outage. The same five are shown to everyone, and they do not change once asked."
          actions={
            <Button
              variant="secondary"
              disabled={regenerate.isPending || (responses.data?.responses.length ?? 0) > 0}
              onClick={() => regenerate.mutate(viewDate)}
            >
              {regenerate.isPending ? 'Regenerating…' : 'Regenerate'}
            </Button>
          }
        />

        {todaysSet.isLoading ? (
          <LoadingState label="Loading questions" />
        ) : todaysSet.isError ? (
          <ErrorState title="Could not load the question set" onRetry={() => void todaysSet.refetch()} />
        ) : !todaysQuestions ? (
          <EmptyState title="No questions for this day" />
        ) : (
          <SetQuestions set={todaysQuestions} />
        )}

        {regenerate.isError ? (
          <Callout tone="danger" title="Could not regenerate">
            {messageOf(regenerate.error)}
          </Callout>
        ) : null}
        {(responses.data?.responses.length ?? 0) > 0 ? (
          <p className="mt-3 text-xs text-slate-500">
            {responses.data!.responses.length}{' '}
            {responses.data!.responses.length === 1 ? 'person has' : 'people have'} already answered this
            day, so the questions are locked. Regenerating would leave their answers describing wording they
            never saw.
          </p>
        ) : null}
      </Card>

      <Card>
        <CardHeader
          title="Responses"
          description="Each employee’s answers to the questions above."
          actions={
            <Input
              type="date"
              value={viewDate}
              onChange={(event) => setViewDate(event.target.value || todayInputValue())}
              className="w-auto"
            />
          }
        />

        {responses.isLoading ? (
          <LoadingState label="Loading responses" />
        ) : responses.isError ? (
          <ErrorState title="Could not load responses" onRetry={() => void responses.refetch()} />
        ) : (responses.data?.responses.length ?? 0) === 0 ? (
          <EmptyState
            title="No responses for this day"
            description="Responses appear here as employees submit."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {responses.data!.responses.map((response) => (
              <ResponseRow key={response.id} response={response} />
            ))}
          </ul>
        )}
      </Card>

      {recentSets.data && recentSets.data.length > 0 ? (
        <Card>
          <CardHeader
            title="Recent days"
            description="How each day’s five questions were produced."
          />
          <ul className="divide-y divide-slate-100">
            {recentSets.data.map((set) => (
              <li key={set.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span className="font-medium text-slate-800">{formatDay(set.responseDate)}</span>
                <span className="flex items-center gap-2 text-slate-500">
                  {set.source === 'GEMINI' ? (
                    <Badge className="bg-violet-50 text-violet-700 ring-violet-200">AI</Badge>
                  ) : (
                    <Badge>Question bank</Badge>
                  )}
                  {set.model ? <span className="text-xs">{set.model}</span> : null}
                  {set.note ? <span className="text-xs">{set.note}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title={`Fallback question bank (${items.filter((q) => q.isActive).length} active)`}
          description="Used to draw a day’s questions when the model is unavailable. Editing these never changes a day that has already been asked."
        />

        {items.length === 0 ? (
          <EmptyState
            title="No questions configured"
            description="Add the first question to get the daily pulse started."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((question) => (
              <li key={question.id} className="py-4">
                {editing === question.id ? (
                  <QuestionEditor
                    initial={question}
                    saving={updateQuestion.isPending}
                    error={updateQuestion.isError ? String((updateQuestion.error as { message?: string }).message ?? '') : null}
                    onCancel={() => setEditing(null)}
                    onSave={(payload) => updateQuestion.mutate({ id: question.id, payload })}
                  />
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-slate-900">
                          {question.position}. {question.prompt}
                        </span>
                        <Badge>{question.answerType.replace('_', ' ').toLowerCase()}</Badge>
                        {!question.isActive ? <Badge>Retired</Badge> : null}
                      </div>
                      {question.options.length > 0 ? (
                        <p className="mt-1 text-xs text-slate-500">Options: {question.options.join(', ')}</p>
                      ) : null}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="secondary" onClick={() => setEditing(question.id)}>
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => updateQuestion.mutate({ id: question.id, payload: { isActive: !question.isActive } })}
                      >
                        {question.isActive ? 'Retire' : 'Restore'}
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Add a bank question"
          description="Takes the next free slot in the fallback pool, not in today’s set."
        />
        <QuestionEditor
          saving={createQuestion.isPending}
          error={createQuestion.isError ? String((createQuestion.error as { message?: string }).message ?? '') : null}
          nextPosition={nextFreePosition(items.map((q) => q.position))}
          onSave={(payload) => createQuestion.mutate(payload)}
        />
      </Card>
    </div>
  );
}

/** Renders a day's five questions with their provenance. */
function SetQuestions({ set }: { set: DailyQuestionSet }) {
  return (
    <div className="space-y-4">
      <p className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>{formatDay(set.responseDate)}</span>
        {set.source === 'GEMINI' ? (
          <Badge className="bg-violet-50 text-violet-700 ring-violet-200">Written by AI</Badge>
        ) : (
          <Badge>Drawn from the question bank</Badge>
        )}
        {set.model ? <span>{set.model}</span> : null}
      </p>
      {set.note ? <Callout tone="info" title="Why the bank was used">{set.note}</Callout> : null}
      <ol className="space-y-3">
        {set.questions.map((question) => (
          <li key={question.id} className="flex items-start gap-2 text-sm">
            <span className="text-slate-400">{question.position}.</span>
            <span className="flex-1">
              <span className="font-medium text-slate-900">{question.prompt}</span>
              <span className="ml-2 align-middle">
                <Badge>{question.answerType.replace('_', ' ').toLowerCase()}</Badge>
              </span>
              {question.topic ? (
                <span className="ml-1 align-middle text-xs text-slate-400">{topicLabel(question.topic)}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** One employee's five answers, grouped under the question that asked for them. */
function ResponseRow({ response }: { response: DailyPulseResponseDetail }) {
  return (
    <li className="py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-slate-900">{response.employee.name}</span>
        <span className="flex items-center gap-2 text-xs text-slate-500">
          {response.employee.department ? <span>{response.employee.department}</span> : null}
          {response.employee.jobTitle ? <span>{response.employee.jobTitle}</span> : null}
          <span>{formatTime(response.submittedAt)}</span>
          {response.summaryValue !== null ? (
            <Badge>Average {response.summaryValue}</Badge>
          ) : null}
        </span>
      </div>
      <dl className="mt-2 space-y-1">
        {response.answers.map((answer) => (
          <div key={answer.questionId} className="flex items-start gap-2 text-sm">
            <dt className="flex-1 text-slate-500">{answer.prompt}</dt>
            <dd className="font-medium text-slate-800">{formatAnswer(answer)}</dd>
          </div>
        ))}
      </dl>
    </li>
  );
}

function formatAnswer(answer: {
  answerType: string;
  numericValue: number | null;
  textValue: string | null;
}): string {
  if (answer.textValue) return answer.textValue;
  if (answer.numericValue === null) return '—';
  if (answer.answerType === 'YES_NO') return answer.numericValue === 1 ? 'Yes' : 'No';
  return String(answer.numericValue);
}

const TOPIC_LABELS: Record<string, string> = {
  WORKLOAD: 'Workload',
  WORK_LIFE_BALANCE: 'Work-life balance',
  MANAGER_SUPPORT: 'Manager support',
  TEAMWORK: 'Teamwork',
  COMMUNICATION: 'Communication',
  RECOGNITION: 'Recognition',
  GROWTH: 'Growth',
  ENGAGEMENT: 'Engagement',
  SATISFACTION: 'Satisfaction',
  OVERALL_EXPERIENCE: 'Overall',
};

function topicLabel(topic: string): string {
  return TOPIC_LABELS[topic] ?? topic;
}

function formatDay(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  });
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/** Today as a `yyyy-mm-dd` value, which is what a date input expects. */
function todayInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

function messageOf(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'Please try again.';
}

function QuestionEditor({
  initial,
  nextPosition,
  saving,
  error,
  onSave,
  onCancel,
}: {
  initial?: {
    id: string;
    prompt: string;
    answerType: string;
    options: string[];
    helpText: string | null;
    position: number;
  };
  nextPosition?: number;
  saving: boolean;
  error: string | null;
  onSave: (payload: {
    prompt: string;
    answerType: string;
    options?: string[];
    helpText?: string;
    position: number;
  }) => void;
  onCancel?: () => void;
}) {
  const [prompt, setPrompt] = useState(initial?.prompt ?? '');
  const [answerType, setAnswerType] = useState(initial?.answerType ?? 'RATING');
  const [options, setOptions] = useState((initial?.options ?? []).join(', '));
  const [helpText, setHelpText] = useState(initial?.helpText ?? '');
  const [position, setPosition] = useState(initial?.position ?? nextPosition ?? 1);

  const needsOptions = answerType === 'MULTIPLE_CHOICE';
  const valid = prompt.trim().length >= 5;

  return (
    <div className="space-y-4">
      <Field label="Question" htmlFor={`prompt-${initial?.id ?? 'new'}`}>
        <Input
          id={`prompt-${initial?.id ?? 'new'}`}
          value={prompt}
          maxLength={500}
          placeholder="How are you feeling about your workload today?"
          onChange={(event) => setPrompt(event.target.value)}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Answer type" htmlFor={`type-${initial?.id ?? 'new'}`}>
          <select
            id={`type-${initial?.id ?? 'new'}`}
            className="input"
            value={answerType}
            onChange={(event) => setAnswerType(event.target.value)}
          >
            {ANSWER_TYPES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Position" htmlFor={`position-${initial?.id ?? 'new'}`} hint="1-5, unique.">
          <Input
            id={`position-${initial?.id ?? 'new'}`}
            type="number"
            min={1}
            max={5}
            value={position}
            onChange={(event) => setPosition(Number(event.target.value))}
          />
        </Field>
      </div>

      {needsOptions ? (
        <Field
          label="Options"
          htmlFor={`options-${initial?.id ?? 'new'}`}
          hint="Comma separated, e.g. Blocked, Slow, Missing access"
        >
          <Input
            id={`options-${initial?.id ?? 'new'}`}
            value={options}
            onChange={(event) => setOptions(event.target.value)}
          />
        </Field>
      ) : null}

      <Field label="Help text (optional)" htmlFor={`help-${initial?.id ?? 'new'}`}>
        <Textarea
          id={`help-${initial?.id ?? 'new'}`}
          rows={2}
          value={helpText}
          maxLength={500}
          onChange={(event) => setHelpText(event.target.value)}
        />
      </Field>

      {error ? <Callout tone="danger" title="Could not save">{error}</Callout> : null}

      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button
          disabled={!valid || saving}
          onClick={() =>
            onSave({
              prompt: prompt.trim(),
              answerType,
              ...(needsOptions && options.trim()
                ? { options: options.split(',').map((option) => option.trim()).filter(Boolean) }
                : {}),
              ...(helpText.trim() ? { helpText: helpText.trim() } : {}),
              position,
            })
          }
        >
          {saving ? 'Saving…' : 'Save question'}
        </Button>
      </div>
    </div>
  );
}

function nextFreePosition(used: number[]): number {
  for (let position = 1; position <= 5; position += 1) {
    if (!used.includes(position)) return position;
  }
  return 1;
}
