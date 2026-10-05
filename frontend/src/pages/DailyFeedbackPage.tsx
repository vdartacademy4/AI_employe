import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader, Card, CardHeader, Button, Callout, EmptyState, Field, LoadingState, ErrorState, Badge, Input, Textarea, Select } from '@/components/ui';
import { dailyPulseApi } from '@/lib/api';
import type { DailyAnswerInput, DailyQuestionView } from '@/types';

/** Free-text category the employee picks for their own written feedback. */
const WRITTEN_CATEGORIES = [
  { value: 'SUGGESTION', label: 'Suggestion' },
  { value: 'CONCERN', label: 'Concern' },
  { value: 'WORK_ISSUE', label: 'Work issue' },
  { value: 'TEAM', label: 'Team feedback' },
  { value: 'MANAGER', label: 'Manager feedback' },
  { value: 'WORKPLACE_EXPERIENCE', label: 'Workplace experience' },
  { value: 'GENERAL', label: 'General comment' },
];

const RATING_LABELS: Record<number, string> = {
  1: 'Very poor',
  2: 'Poor',
  3: 'Okay',
  4: 'Good',
  5: 'Excellent',
};

/**
 * The employee's daily feedback flow: the five questions plus written and
 * optional anonymous feedback, submitted in one request.
 *
 * The page never decides whether a second submission is allowed. It renders
 * `canSubmit` from the server and, on a 409, shows the server's reason rather
 * than a generic failure.
 */
export function DailyFeedbackPage() {
  const queryClient = useQueryClient();
  const [answers, setAnswers] = useState<Record<string, DailyAnswerInput>>({});
  const [written, setWritten] = useState({ category: 'GENERAL', content: '' });
  const [anonymous, setAnonymous] = useState({ category: 'CONCERN', content: '' });
  const [includeAnonymous, setIncludeAnonymous] = useState(false);
  /**
   * The exact confirmation shown after a successful submission.
   *
   * Held as state rather than inferred from `alreadySubmitted`, so the message
   * appears once on submission instead of being permanently true the next time
   * the page is opened on a day already answered.
   */
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const todayQuery = useQuery({ queryKey: ['pulse', 'today'], queryFn: () => dailyPulseApi.today() });
  const historyQuery = useQuery({ queryKey: ['pulse', 'history'], queryFn: () => dailyPulseApi.myHistory() });

  const submit = useMutation({
    mutationFn: () =>
      dailyPulseApi.submit({
        answers: Object.values(answers),
        writtenFeedback: written,
        ...(includeAnonymous && anonymous.content.trim().length >= 3
          ? { anonymousFeedback: anonymous }
          : {}),
      }),
    onSuccess: () => {
      setAnswers({});
      setWritten({ category: 'GENERAL', content: '' });
      setAnonymous({ category: 'CONCERN', content: '' });
      setIncludeAnonymous(false);
      setConfirmation("Today's feedback submitted successfully.");
      void queryClient.invalidateQueries({ queryKey: ['pulse'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const today = todayQuery.data;
  const questions = today?.questions;

  const answeredCount = useMemo(
    () => (questions ?? []).filter((question) => isAnswered(answers[question.id])).length,
    [questions, answers],
  );

  if (todayQuery.isLoading) return <LoadingState label="Loading today's questions" />;
  if (todayQuery.isError || !today || !questions) {
    return <ErrorState title="Could not load today's questions" onRetry={() => void todayQuery.refetch()} />;
  }

  const allAnswered = answeredCount === questions.length && questions.length > 0;
  const canSubmit = today.canSubmit && allAnswered && !submit.isPending;
  const writtenValid = written.content.trim().length >= 3;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Daily Feedback"
        description={`${questions.length} questions for ${formatDay(today.responseDate)}`}
        actions={
          today.alreadySubmitted ? (
            <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200">Submitted today</Badge>
          ) : (
            <Badge className="bg-amber-50 text-amber-700 ring-amber-200">Not submitted</Badge>
          )
        }
      />

      <p className="text-xs text-slate-500">
        These five questions come from the fixed bank of 20 and rotate daily.
      </p>

      {!today.isActive ? (
        <Callout tone="info" title="The daily pulse is paused">
          HR has temporarily turned off the daily questions. Your dashboard and history are still available.
        </Callout>
      ) : null}

      {confirmation ? (
        <Callout tone="success" title="Feedback submitted">
          {confirmation} You can see your score and history on the dashboard.
        </Callout>
      ) : today.alreadySubmitted ? (
        <Callout tone="success" title="Thanks — your feedback is in">
          You have already answered today&rsquo;s questions. You can see your score and history on the dashboard.
        </Callout>
      ) : null}

      {questions.length === 0 ? (
        <Card>
          <EmptyState
            title="Today&rsquo;s questions could not be prepared"
            description="Questions are prepared automatically each day. Please try again shortly."
          />
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader
              title={`Your answers (${answeredCount}/${questions.length})`}
              description="All questions must be answered before you can submit."
            />
            <div className="space-y-6">
              {questions.map((question) => (
                <QuestionField
                  key={question.id}
                  question={question}
                  value={answers[question.id]}
                  disabled={!today.canSubmit || submit.isPending}
                  onChange={(next) =>
                    setAnswers((current) => ({ ...current, [question.id]: next }))
                  }
                />
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Written feedback"
              description="Only you can see this. It is analysed for sentiment and themes."
            />
            <div className="space-y-4">
              <Field label="Category" htmlFor="written-category">
                <Select
                  id="written-category"
                  value={written.category}
                  disabled={!today.canSubmit || submit.isPending}
                  onChange={(event) => setWritten((c) => ({ ...c, category: event.target.value }))}
                >
                  {WRITTEN_CATEGORIES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Your comments"
                htmlFor="written-content"
                hint={`${written.content.trim().length}/5000 characters. At least 3 required.`}
              >
                <Textarea
                  id="written-content"
                  rows={4}
                  maxLength={5000}
                  value={written.content}
                  disabled={!today.canSubmit || submit.isPending}
                  placeholder="What is on your mind today?"
                  onChange={(event) => setWritten((c) => ({ ...c, content: event.target.value }))}
                />
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Anonymous feedback (optional)"
              description="Stored in a separate table with no link to your identity. HR sees it as an unattributed pool."
            />
            <div className="space-y-4">
              <label className="flex items-start gap-3 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={includeAnonymous}
                  disabled={!today.canSubmit || submit.isPending}
                  onChange={(event) => setIncludeAnonymous(event.target.checked)}
                />
                <span>
                  I also want to send anonymous feedback
                  <span className="block text-xs text-slate-500">
                    Your name is never stored with this text.
                  </span>
                </span>
              </label>

              {includeAnonymous ? (
                <>
                  <Field label="Anonymous category" htmlFor="anonymous-category">
                    <Select
                      id="anonymous-category"
                      value={anonymous.category}
                      disabled={submit.isPending}
                      onChange={(event) => setAnonymous((c) => ({ ...c, category: event.target.value }))}
                    >
                      {WRITTEN_CATEGORIES.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field
                    label="Anonymous comments"
                    htmlFor="anonymous-content"
                    hint="At least 3 characters. Shown to HR without any attribution."
                  >
                    <Textarea
                      id="anonymous-content"
                      rows={4}
                      maxLength={5000}
                      value={anonymous.content}
                      disabled={submit.isPending}
                      placeholder="Say what needs to change."
                      onChange={(event) => setAnonymous((c) => ({ ...c, content: event.target.value }))}
                    />
                  </Field>
                </>
              ) : null}
            </div>
          </Card>

          {submit.isError ? (
            <Callout tone="danger" title="Could not submit">
              {errorMessage(submit.error)}
            </Callout>
          ) : null}

          <div className="flex items-center justify-end gap-3">
            <span className="text-sm text-slate-500">
              {allAnswered
                ? `All ${questions.length} questions answered`
                : `${questions.length - answeredCount} question${questions.length - answeredCount === 1 ? '' : 's'} remaining`}
            </span>
            <Button onClick={() => submit.mutate()} disabled={!canSubmit || !writtenValid}>
              {submit.isPending ? 'Submitting…' : 'Submit today’s feedback'}
            </Button>
          </div>
          {!writtenValid ? (
            <p className="text-right text-xs text-slate-500">
              Written feedback is required with every daily submission.
            </p>
          ) : null}
        </>
      )}

      <Card>
        <CardHeader title="Your submission history" description="Dates you have completed the pulse." />
        {historyQuery.isLoading ? (
          <LoadingState />
        ) : (historyQuery.data?.length ?? 0) === 0 ? (
          <EmptyState title="No submissions yet" description="Your completed days will appear here." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {historyQuery.data!.map((entry) => (
              <li key={entry.feedbackDate} className="flex items-center justify-between py-3 text-sm">
                <span className="font-medium text-slate-800">{formatDay(entry.feedbackDate)}</span>
                <span className="flex items-center gap-2 text-slate-500">
                  <span>{entry.questionCount} answers</span>
                  {entry.hasAnonymous ? <Badge>Anonymous sent</Badge> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/** Renders one question with the input its answer type requires. */
function QuestionField({
  question,
  value,
  disabled,
  onChange,
}: {
  question: DailyQuestionView;
  value: DailyAnswerInput | undefined;
  disabled: boolean;
  onChange: (value: DailyAnswerInput) => void;
}) {
  const numeric = value?.numericValue;

  return (
    <fieldset className="border-0 p-0">
      <legend className="mb-1 flex w-full items-start gap-2 text-sm font-medium text-slate-900">
        <span className="text-slate-400">{question.position}.</span>
        <span className="flex-1">{question.prompt}</span>
        <Badge>{question.answerType.replace('_', ' ').toLowerCase()}</Badge>
      </legend>
      {question.helpText ? <p className="mb-2 pl-6 text-xs text-slate-500">{question.helpText}</p> : null}

      <div className="pl-6">
        {question.answerType === 'RATING' ? (
          <div className="flex flex-wrap items-center gap-2">
            {[1, 2, 3, 4, 5].map((score) => (
              <button
                key={score}
                type="button"
                disabled={disabled}
                onClick={() => onChange({ questionId: question.id, numericValue: score })}
                className={`min-w-[4.5rem] rounded-md border px-3 py-2 text-sm transition ${
                  numeric === score
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
              >
                {score}
                <span className="block text-[11px] font-normal opacity-80">{RATING_LABELS[score]}</span>
              </button>
            ))}
          </div>
        ) : null}

        {question.answerType === 'YES_NO' ? (
          <div className="flex items-center gap-2">
            {[
              { value: 1, label: 'Yes' },
              { value: 0, label: 'No' },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                disabled={disabled}
                onClick={() => onChange({ questionId: question.id, numericValue: option.value })}
                className={`rounded-md border px-4 py-2 text-sm transition ${
                  numeric === option.value
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}

        {question.answerType === 'MULTIPLE_CHOICE' ? (
          <div className="flex flex-wrap gap-2">
            {question.options.map((option) => {
              const selected = value?.selectedOptions?.includes(option) ?? false;
              return (
                <button
                  key={option}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    const current = value?.selectedOptions ?? [];
                    const next = selected
                      ? current.filter((item) => item !== option)
                      : [...current, option];
                    onChange({ questionId: question.id, selectedOptions: next });
                  }}
                  className={`rounded-md border px-3 py-1.5 text-sm transition ${
                    selected
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
                >
                  {option}
                </button>
              );
            })}
          </div>
        ) : null}

        {question.answerType === 'SHORT_TEXT' ? (
          <Input
            maxLength={2000}
            value={value?.textValue ?? ''}
            disabled={disabled}
            placeholder="Short answer"
            onChange={(event) => onChange({ questionId: question.id, textValue: event.target.value })}
          />
        ) : null}
      </div>
    </fieldset>
  );
}

function isAnswered(answer: DailyAnswerInput | undefined): boolean {
  if (!answer) return false;
  if (answer.numericValue !== undefined) return true;
  if (answer.textValue && answer.textValue.trim().length > 0) return true;
  return (answer.selectedOptions?.length ?? 0) > 0;
}

function formatDay(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  });
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'Please try again.';
}
