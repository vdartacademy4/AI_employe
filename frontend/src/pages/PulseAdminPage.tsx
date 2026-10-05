import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader, Card, CardHeader, Button, Callout, EmptyState, LoadingState, ErrorState, Badge, Input } from '@/components/ui';
import { dailyPulseApi } from '@/lib/api';
import type {
  DailyQuestionBreakdownEntry,
  DailyQuestionSet,
  DailyPulseResponseDetail,
  DailyTrendPoint,
} from '@/types';

/**
 * HR/Admin view of the daily pulse.
 *
 * Three things are deliberately not editable here. The bank of 20 questions is
 * fixed in code, so editing it would desynchronise the rotation from what
 * employees are actually asked. The five questions of any day are decided by the
 * rotation and frozen once written, because answers recorded against a question
 * that later changes stop meaning what they said.
 *
 * The page therefore reads: today's set, who answered it, and how each question
 * and each day has trended.
 */
export function PulseAdminPage() {
  const queryClient = useQueryClient();
  const [viewDate, setViewDate] = useState(() => todayInputValue());
  const [rangeStart, setRangeStart] = useState(() => daysAgoInputValue(29));
  const [rangeEnd, setRangeEnd] = useState(() => todayInputValue());

  const config = useQuery({ queryKey: ['pulse', 'config'], queryFn: () => dailyPulseApi.getConfig() });
  const bank = useQuery({ queryKey: ['pulse', 'questions'], queryFn: () => dailyPulseApi.listQuestions() });
  const recentSets = useQuery({
    queryKey: ['pulse', 'questionSets'],
    queryFn: () => dailyPulseApi.recentQuestionSets({ limit: 14 }),
  });
  const selectedSet = useQuery({
    queryKey: ['pulse', 'questionSet', viewDate],
    queryFn: () => dailyPulseApi.questionSet({ date: viewDate }),
  });
  const responses = useQuery({
    queryKey: ['pulse', 'responses', viewDate],
    queryFn: () => dailyPulseApi.responses({ date: viewDate }),
  });
  const breakdown = useQuery({
    queryKey: ['pulse', 'questionBreakdown', rangeStart, rangeEnd],
    queryFn: () => dailyPulseApi.questionBreakdown({ startDate: rangeStart, endDate: rangeEnd }),
    enabled: Boolean(rangeStart && rangeEnd),
  });
  const trends = useQuery({
    queryKey: ['pulse', 'trends', rangeStart, rangeEnd],
    queryFn: () => dailyPulseApi.trends({ startDate: rangeStart, endDate: rangeEnd }),
    enabled: Boolean(rangeStart && rangeEnd),
  });

  const updateConfig = useMutation({
    mutationFn: (payload: Parameters<typeof dailyPulseApi.updateConfig>[0]) =>
      dailyPulseApi.updateConfig(payload),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['pulse', 'config'] }),
  });

  const regenerate = useMutation({
    mutationFn: (date: string) => dailyPulseApi.regenerateQuestionSet({ date }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pulse', 'questionSet'] });
      void queryClient.invalidateQueries({ queryKey: ['pulse', 'questionSets'] });
    },
  });

  if (config.isLoading) return <LoadingState label="Loading pulse settings" />;
  if (config.isError) {
    return <ErrorState title="Could not load pulse settings" onRetry={() => void config.refetch()} />;
  }

  const settings = config.data;
  const responseCount = responses.data?.responses.length ?? 0;

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
            Each employee submits once per day. Questions per day is fixed at{' '}
            {settings?.questionsPerDay ?? 5} by the product specification.
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="The day’s questions"
          description="Five drawn from the fixed bank of 20 and rotated daily. The same five are shown to everyone, and they do not change once asked."
          actions={
            <Button
              variant="secondary"
              disabled={regenerate.isPending || responseCount > 0}
              onClick={() => regenerate.mutate(viewDate)}
            >
              {regenerate.isPending ? 'Regenerating…' : 'Regenerate'}
            </Button>
          }
        />

        <div className="mb-4">
          <Input
            type="date"
            aria-label="Day to review"
            value={viewDate}
            onChange={(event) => setViewDate(event.target.value || todayInputValue())}
            className="w-auto"
          />
        </div>

        {selectedSet.isLoading ? (
          <LoadingState label="Loading questions" />
        ) : selectedSet.isError ? (
          <ErrorState title="Could not load the question set" onRetry={() => void selectedSet.refetch()} />
        ) : !selectedSet.data ? (
          <EmptyState title="No questions for this day" />
        ) : (
          <SetQuestions set={selectedSet.data} />
        )}

        {regenerate.isError ? (
          <Callout tone="danger" title="Could not regenerate">
            {messageOf(regenerate.error)}
          </Callout>
        ) : null}
        {responseCount > 0 ? (
          <p className="mt-3 text-xs text-slate-500">
            {responseCount} {responseCount === 1 ? 'person has' : 'people have'} already answered this
            day, so the questions are locked. Regenerating would leave their answers describing wording they
            never saw.
          </p>
        ) : null}
      </Card>

      <Card>
        <CardHeader
          title="Responses"
          description="Each employee’s answers to the questions above."
        />

        {responses.isLoading ? (
          <LoadingState label="Loading responses" />
        ) : responses.isError ? (
          <ErrorState title="Could not load responses" onRetry={() => void responses.refetch()} />
        ) : responseCount === 0 ? (
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

      <Card>
        <CardHeader
          title="Results by question"
          description="Every question that collected an answer in this period, most-asked first."
          actions={<RangePicker start={rangeStart} end={rangeEnd} onChange={setRangeStart} onEnd={setRangeEnd} />}
        />

        {breakdown.isLoading ? (
          <LoadingState label="Loading question results" />
        ) : breakdown.isError ? (
          <ErrorState title="Could not load question results" onRetry={() => void breakdown.refetch()} />
        ) : (breakdown.data?.questions.length ?? 0) === 0 ? (
          <EmptyState
            title="No answers in this period"
            description="Per-question results appear here once employees start submitting."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {breakdown.data!.questions.map((entry) => (
              <BreakdownRow key={entry.prompt} entry={entry} />
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Trends"
          description="Submissions and average score per day. Days with no responses are shown as gaps rather than zero."
          actions={<RangePicker start={rangeStart} end={rangeEnd} onChange={setRangeStart} onEnd={setRangeEnd} />}
        />

        {trends.isLoading ? (
          <LoadingState label="Loading trends" />
        ) : trends.isError ? (
          <ErrorState title="Could not load trends" onRetry={() => void trends.refetch()} />
        ) : (
          <TrendTable points={trends.data?.days ?? []} eligible={trends.data?.eligible ?? 0} />
        )}
      </Card>

      {recentSets.data && recentSets.data.length > 0 ? (
        <Card>
          <CardHeader title="Recent days" description="The five questions asked on each recent day." />
          <ul className="divide-y divide-slate-100">
            {recentSets.data.map((set) => (
              <li key={set.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span className="font-medium text-slate-800">{formatDay(set.responseDate)}</span>
                <span className="text-xs text-slate-500">
                  {set.questions.map((question) => question.position).join(', ')} of the bank
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Question bank"
          description="The 20 questions employees are asked, in rotation order. This list is fixed and cannot be edited."
        />

        {bank.isLoading ? (
          <LoadingState label="Loading the question bank" />
        ) : bank.isError ? (
          <ErrorState title="Could not load the question bank" onRetry={() => void bank.refetch()} />
        ) : (bank.data?.length ?? 0) === 0 ? (
          <EmptyState title="No questions configured" />
        ) : (
          <ol className="divide-y divide-slate-100">
            {bank.data!.map((question, index) => (
              <li key={question.id} className="flex items-start gap-3 py-3 text-sm">
                <span className="w-6 shrink-0 text-slate-400">{index + 1}.</span>
                <span className="flex-1">
                  <span className="text-slate-900">{question.prompt}</span>
                  <Badge className="ml-2 align-middle">
                    {question.answerType.replace('_', ' ').toLowerCase()}
                  </Badge>
                </span>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}

/** Renders a day's five questions. */
function SetQuestions({ set }: { set: DailyQuestionSet }) {
  return (
    <div className="space-y-4">
      <p className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>{formatDay(set.responseDate)}</span>
        <Badge>Drawn from the question bank</Badge>
      </p>
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
          {response.summaryValue !== null ? <Badge>Average {response.summaryValue}</Badge> : null}
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

/** One question's results over the period. */
function BreakdownRow({ entry }: { entry: DailyQuestionBreakdownEntry }) {
  return (
    <li className="py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="flex-1 text-sm font-medium text-slate-900">{entry.prompt}</p>
        <span className="flex shrink-0 items-center gap-2 text-xs text-slate-500">
          <Badge>{entry.answerType.replace('_', ' ').toLowerCase()}</Badge>
          <Badge>{entry.responses} answered</Badge>
        </span>
      </div>
      <p className="mt-1 flex flex-wrap items-center gap-3 text-sm text-slate-600">
        {entry.average !== null ? <span>Average {entry.average}</span> : <span>No numeric answers</span>}
        {entry.yesShare !== null ? <span>{entry.yesShare}% answered yes</span> : null}
        {entry.textAnswers > 0 ? <span>{entry.textAnswers} written</span> : null}
      </p>
      {entry.recentTexts.length > 0 ? (
        <ul className="mt-2 space-y-1 border-l-2 border-slate-100 pl-3">
          {entry.recentTexts.map((text, index) => (
            <li key={index} className="text-sm italic text-slate-600">
              “{text}”
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/**
 * The daily series as a table.
 *
 * A table rather than a chart: with at most 30 rows and no charting library in
 * the project, it shows the exact per-day numbers, and the gaps stay visible.
 */
function TrendTable({ points, eligible }: { points: DailyTrendPoint[]; eligible: number }) {
  if (points.length === 0) {
    return <EmptyState title="No days in this period" description="Widen the date range to see trends." />;
  }

  const best = points.reduce<DailyTrendPoint | null>((top, point) => {
    if (point.averageScore === null) return top;
    if (top === null || top.averageScore === null || point.averageScore > top.averageScore) return point;
    return top;
  }, null);

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        {eligible} active {eligible === 1 ? 'employee' : 'employees'} eligible to respond.
        {best?.averageScore !== null && best ? (
          <>
            {' '}
            Best day {formatDay(best.date)} at {best.averageScore}.
          </>
        ) : null}
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
            <th scope="col" className="py-2">Day</th>
            <th scope="col" className="py-2">Submissions</th>
            <th scope="col" className="py-2">Participation</th>
            <th scope="col" className="py-2">Average score</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.date} className="border-b border-slate-100 last:border-0">
              <td className="py-2 text-slate-700">{formatDay(point.date)}</td>
              <td className="py-2 text-slate-700">{point.submissions}</td>
              <td className="py-2 text-slate-700">
                {/* A dash, not a zero: nobody answering is not the same as a measured 0%. */}
                {point.participationRate !== null ? `${point.participationRate}%` : '—'}
              </td>
              <td className="py-2 text-slate-700">
                {point.averageScore !== null ? point.averageScore : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Two date inputs bounding a period. */
function RangePicker({
  start,
  end,
  onChange,
  onEnd,
}: {
  start: string;
  end: string;
  onChange: (value: string) => void;
  onEnd: (value: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Input
        type="date"
        aria-label="Period start"
        value={start}
        onChange={(event) => onChange(event.target.value)}
        className="w-auto"
      />
      <span className="text-xs text-slate-400">to</span>
      <Input
        type="date"
        aria-label="Period end"
        value={end}
        onChange={(event) => onEnd(event.target.value)}
        className="w-auto"
      />
    </div>
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
  SATISFACTION: 'Satisfaction',
  ENGAGEMENT: 'Engagement',
  WORKLOAD: 'Workload',
  MOTIVATION: 'Motivation',
  MANAGER_SUPPORT: 'Manager support',
  WORK_ENVIRONMENT: 'Work environment',
  STRESS: 'Stress',
  COLLABORATION: 'Collaboration',
  RECOGNITION: 'Recognition',
  OVERALL_EXPERIENCE: 'Overall experience',
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

/** `days` ago as a `yyyy-mm-dd` value, for the default trend period. */
function daysAgoInputValue(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function messageOf(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'Please try again.';
}