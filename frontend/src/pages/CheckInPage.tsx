import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Icons } from '@/components/icons';
import {
  Button,
  Callout,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  PageHeader,
  StatusBadge,
  Textarea,
} from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { checkInsApi } from '@/lib/api';
import { ApiError } from '@/lib/api-client';
import { formatDate, titleCase } from '@/lib/format';

const SCALE = 5;

function ScaleSlider({
  label,
  value,
  onChange,
  lowLabel,
  highLabel,
  required,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  lowLabel: string;
  highLabel: string;
  required?: boolean;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <label className="label mb-0">
          {label}
          {required ? <span className="ml-0.5 text-rose-500">*</span> : null}
        </label>
        <span className="text-sm font-semibold tabular-nums text-slate-700">{value}</span>
      </div>
      <div className="flex gap-1.5">
        {Array.from({ length: SCALE }, (_, index) => index + 1).map((option) => {
          const selected = option === value;
          return (
            <button
              key={option}
              type="button"
              onClick={() => onChange(option)}
              aria-pressed={selected}
              aria-label={`${label}: ${option} out of ${SCALE}`}
              className={`h-11 flex-1 rounded-lg border text-sm font-semibold transition-colors ${
                selected
                  ? 'border-brand-600 bg-brand-600 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-brand-300 hover:bg-brand-50'
              }`}
            >
              {option}
            </button>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-xs text-slate-500">
        <span>{lowLabel}</span>
        <span>{highLabel}</span>
      </div>
    </div>
  );
}

function scoreTone(value: number): string {
  if (value <= 2) return 'text-rose-600';
  if (value === 3) return 'text-amber-600';
  return 'text-emerald-600';
}

export function CheckInPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { can } = useAuth();

  const [mood, setMood] = useState(3);
  const [energy, setEnergy] = useState(3);
  const [workload, setWorkload] = useState(3);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const statusQuery = useQuery({
    queryKey: ['check-ins', 'status'],
    queryFn: checkInsApi.status,
  });

  const historyQuery = useQuery({
    queryKey: ['check-ins', 'mine'],
    queryFn: checkInsApi.myHistory,
  });

  const submit = useMutation({
    mutationFn: () =>
      checkInsApi.submit({
        mood,
        energy,
        workload,
        // A blank note is stored as NULL, not as an empty string.
        note: note.trim() ? note.trim() : null,
      }),
    onSuccess: () => {
      setNote('');
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['check-ins'] });
    },
    onError: (caught) => setError(caught instanceof ApiError ? caught.message : 'Unable to save your check-in'),
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    submit.mutate();
  }

  const status = statusQuery.data;

  if (statusQuery.isLoading) {
    return (
      <>
        <PageHeader title="Check-in" description="A short, private monthly reflection." />
        <Card>
          <LoadingState label="Loading your check-in status" />
        </Card>
      </>
    );
  }

  if (statusQuery.isError) {
    return (
      <>
        <PageHeader title="Check-in" />
        <Card>
          <ErrorState
            message={statusQuery.error instanceof ApiError ? statusQuery.error.message : undefined}
            onRetry={() => void statusQuery.refetch()}
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Check-in"
        description="Tell us how work has felt this month. One submission per person per month, and it can be updated until the period closes."
        actions={
          <Button variant="secondary" onClick={() => navigate('/chat?kind=CHECK_IN')}>
            <Icons.chat className="h-4 w-4" />
            Talk it through
          </Button>
        }
      />

      {!status?.enabled ? (
        <Card>
          <EmptyState
            icon={<Icons.checkin className="h-10 w-10" />}
            title="Check-ins are not open right now"
            description="An administrator has paused check-ins. You can still use AI Chat to reflect, and your history stays available below."
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
          <Card>
            <CardHeader
              title={status.alreadySubmitted ? 'Update your check-in' : 'How are you doing?'}
              description={`Period ${status.period}${status.alreadySubmitted ? ' · you can revise this until it closes' : ''}`}
            />
            <form onSubmit={handleSubmit} className="space-y-6 px-5 pb-5">
              <ScaleSlider
                label="Overall mood"
                value={mood}
                onChange={setMood}
                lowLabel="Struggling"
                highLabel="Thriving"
                required
              />
              <ScaleSlider
                label="Energy levels"
                value={energy}
                onChange={setEnergy}
                lowLabel="Drained"
                highLabel="Energised"
              />
              <ScaleSlider
                label="Workload balance"
                value={workload}
                onChange={setWorkload}
                lowLabel="Overloaded"
                highLabel="Well balanced"
              />

              <Field
                label="Anything else on your mind?"
                htmlFor="note"
                hint="Optional. Free-text notes are never included in aggregate reports."
              >
                <Textarea
                  id="note"
                  rows={4}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="What has gone well, what has been difficult, what would help…"
                />
              </Field>

              {error ? <Callout tone="danger">{error}</Callout> : null}

              <Button type="submit" disabled={submit.isPending} className="w-full sm:w-auto">
                {submit.isPending
                  ? 'Saving…'
                  : status.alreadySubmitted
                    ? 'Update check-in'
                    : 'Submit check-in'}
              </Button>
            </form>
          </Card>

          <div className="space-y-4">
            {!status.hasLinkedEmployeeRecord ? (
              <Callout tone="warning" title="No employee record linked">
                Your account is not linked to an employee record, so a check-in cannot be stored yet.
                Ask an administrator to connect your user to your employee profile, then reload this
                page.
              </Callout>
            ) : null}

            {can('analytics:read-self') ? (
              <AggregateCard />
            ) : (
              <Callout tone="info" title="Your data stays private">
                Only you can see your individual check-in. Aggregated figures are shown to managers
                and HR only when enough colleagues have responded.
              </Callout>
            )}

            <Card>
              <CardHeader title="Your history" description="Only visible to you." />
              {historyQuery.isLoading ? (
                <LoadingState label="Loading your history" />
              ) : historyQuery.isError ? (
                <ErrorState
                  message={historyQuery.error instanceof ApiError ? historyQuery.error.message : undefined}
                  onRetry={() => void historyQuery.refetch()}
                />
              ) : (historyQuery.data?.length ?? 0) === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-slate-500">
                  You have not submitted a check-in yet.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {historyQuery.data?.map((entry) => (
                    <li key={entry.id} className="px-5 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-slate-900">{entry.period}</span>
                          {entry.sentiment ? <StatusBadge status={entry.sentiment} /> : null}
                        </div>
                        <div className="flex gap-3 text-xs text-slate-500">
                          <span className={scoreTone(entry.mood)}>Mood {entry.mood}</span>
                          {entry.energy !== null ? (
                            <span className={scoreTone(entry.energy)}>Energy {entry.energy}</span>
                          ) : null}
                          {entry.workload !== null ? (
                            <span className={scoreTone(entry.workload)}>Workload {entry.workload}</span>
                          ) : null}
                        </div>
                      </div>
                      {entry.note ? (
                        <p className="mt-1.5 whitespace-pre-wrap text-sm text-slate-600">{entry.note}</p>
                      ) : null}
                      <p className="mt-1 text-xs text-slate-400">
                        {titleCase(entry.period)} · updated {formatDate(entry.updatedAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

/** Team-level averages, subject to the server's minimum group size. */
function AggregateCard() {
  const summaryQuery = useQuery({
    queryKey: ['check-ins', 'summary'],
    queryFn: () => checkInsApi.summary(),
  });

  if (summaryQuery.isLoading) {
    return (
      <Card>
        <LoadingState label="Loading aggregate" />
      </Card>
    );
  }

  if (summaryQuery.isError) {
    return (
      <Card>
        <CardHeader title="Team summary" />
        <ErrorState
          message={summaryQuery.error instanceof ApiError ? summaryQuery.error.message : undefined}
          onRetry={() => void summaryQuery.refetch()}
        />
      </Card>
    );
  }

  const summary = summaryQuery.data;
  if (!summary) return null;

  if (summary.suppressed) {
    return (
      <Card>
        <CardHeader title="Team summary" description={`Period ${summary.period}`} />
        <p className="px-5 py-6 text-sm text-slate-500">
          Withheld until at least {summary.minimumGroupSize} colleagues have responded, so that
          individuals cannot be identified. {summary.sampleSize} response
          {summary.sampleSize === 1 ? '' : 's'} so far.
        </p>
      </Card>
    );
  }

  const rows = [
    { label: 'Mood', value: summary.mood },
    { label: 'Energy', value: summary.energy },
    { label: 'Workload', value: summary.workload },
  ];

  return (
    <Card>
      <CardHeader
        title="Team summary"
        description={`Period ${summary.period} · ${summary.sampleSize} response${summary.sampleSize === 1 ? '' : 's'}`}
      />
      <div className="grid grid-cols-3 divide-x divide-slate-100 px-2 py-4">
        {rows.map((row) => (
          <div key={row.label} className="px-3 text-center">
            <p
              className={`text-2xl font-semibold tabular-nums ${
                row.value === null ? 'text-slate-300' : scoreTone(row.value)
              }`}
            >
              {row.value ?? '—'}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">{row.label}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
