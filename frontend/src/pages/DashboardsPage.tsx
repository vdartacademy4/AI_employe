import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader, Card, CardHeader, EmptyState, LoadingState, ErrorState, Badge, Button, StackedShareChart, TrendLineChart } from '@/components/ui';
import { dailyPulseApi } from '@/lib/api';
import type { AiInsight, DashboardMetric } from '@/types';
import { THEME_LABELS } from '@/lib/theme-labels';

/**
 * The role-appropriate dashboard.
 *
 * One endpoint serves all four roles and the server decides the scope, so this
 * component cannot accidentally show a manager organisation data: the only
 * thing role changes here is the copy and which panels are meaningful.
 *
 * Every figure below comes from stored rows. A metric with no data is rendered
 * as a dash, never as a zero.
 */
export function DashboardsPage() {
  const queryClient = useQueryClient();
  const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: () => dailyPulseApi.dashboard() });

  const dismiss = useMutation({
    mutationFn: (id: string) => dailyPulseApi.dismissInsight(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
  });

  if (dashboard.isLoading) return <LoadingState label="Loading your dashboard" />;
  if (dashboard.isError || !dashboard.data) {
    return (
      <ErrorState
        title="Could not load the dashboard"
        onRetry={() => void dashboard.refetch()}
      />
    );
  }

  const data = dashboard.data;
  const isTeamView = data.role === 'MANAGER' || data.role === 'HR' || data.role === 'ADMIN';

  return (
    <div className="space-y-6">
      <PageHeader
        title={isTeamView ? 'Team Dashboard' : 'My Dashboard'}
        description={data.scopeLabel}
      />

      {data.isEmpty ? (
        <Card>
          <EmptyState
            title="No feedback yet"
            description={
              isTeamView
                ? 'Once employees submit the daily questions, participation, sentiment and insights will appear here.'
                : 'Answer today’s questions to start building your engagement history.'
            }
            action={!isTeamView ? <Button onClick={() => window.location.assign('/daily-feedback')}>Go to daily feedback</Button> : undefined}
          />
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {data.metrics.map((metric) => (
          <MetricTile key={metric.key} metric={metric} />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Engagement trend"
            description="Daily score over the last 30 days. Gaps are days with no submission."
          />
          {data.trend.some((point) => point.score !== null) ? (
            <TrendLineChart
              data={data.trend.map((point) => ({
                period: point.date,
                value: point.score,
                sampleSize: point.score === null ? 0 : 1,
              }))}
              suffix=" score"
            />
          ) : (
            <EmptyState
              title="No scores yet"
              description="An engagement score appears once a day has both answers or written feedback."
            />
          )}
        </Card>

        <Card>
          <CardHeader
            title="Sentiment"
            description={
              data.sentiment
                ? `Share of ${data.sentiment.sampleSize} analysed comment${data.sentiment.sampleSize === 1 ? '' : 's'}.`
                : 'No written feedback has been analysed in this period.'
            }
          />
          {data.sentiment ? (
            <StackedShareChart
              data={[
                {
                  period: data.windowEnd.slice(0, 10),
                  suppressed: false,
                  sampleSize: data.sentiment.sampleSize,
                  positive: data.sentiment.positive,
                  neutral: data.sentiment.neutral,
                  negative: data.sentiment.negative,
                },
              ]}
            />
          ) : (
            <EmptyState
              title="No analysed comments"
              description="Sentiment appears once employees write feedback and the analysis job has run."
            />
          )}
        </Card>
      </div>

      {data.topThemes.length > 0 ? (
        <Card>
          <CardHeader
            title="Most mentioned themes"
            description="Detected in written feedback by the sentiment analysis pipeline."
          />
          <ul className="space-y-2">
            {data.topThemes.map((theme) => (
              <li key={theme.theme} className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-800">
                  {THEME_LABELS[theme.theme] ?? theme.label}
                </span>
                <Badge>{theme.count} mention{theme.count === 1 ? '' : 's'}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <InsightsPanel
        insights={data.insights}
        canDismiss={data.role !== 'EMPLOYEE'}
        onDismiss={(id) => dismiss.mutate(id)}
      />
    </div>
  );
}

function MetricTile({ metric }: { metric: DashboardMetric }) {
  // A null value is an absence of data, not a zero. Rendering 0 here would be
  // the single easiest way for this dashboard to start lying.
  const display =
    metric.value === null
      ? '—'
      : metric.unit === 'percent'
        ? `${metric.value}%`
        : metric.unit === 'days'
          ? `${metric.value} day${metric.value === 1 ? '' : 's'}`
          : metric.value.toFixed(1);

  return (
    <Card className="p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{metric.label}</p>
      <p
        className={`mt-2 text-2xl font-semibold ${
          metric.value === null ? 'text-slate-400' : 'text-slate-900'
        }`}
      >
        {display}
      </p>
      <p className="mt-1 text-xs text-slate-500">{metric.hint}</p>
    </Card>
  );
}

/**
 * Generated observations. Each one states the window and the number of records
 * it rests on, so a reader can judge it rather than take it on trust.
 */
function InsightsPanel({
  insights,
  canDismiss,
  onDismiss,
}: {
  insights: AiInsight[];
  canDismiss: boolean;
  onDismiss: (id: string) => void;
}) {
  return (
    <Card>
      <CardHeader
        title="AI insights"
        description="Generated from stored responses. Each insight shows the evidence behind it."
      />
      {insights.length === 0 ? (
        <EmptyState
          title="No insights yet"
          description="Insights appear once there is enough data to support a claim. Nothing is generated from thin evidence."
        />
      ) : (
        <ul className="divide-y divide-slate-100">
          {insights.map((insight) => (
            <li key={insight.id} className="py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-slate-900">{insight.headline}</span>
                    <SeverityBadge severity={insight.severity} />
                    <Badge>{insight.targetName}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{insight.detail}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Based on {insight.evidenceSize} record
                    {insight.evidenceSize === 1 ? '' : 's'} between {formatDate(insight.windowStart)} and{' '}
                    {formatDate(insight.windowEnd)}
                  </p>
                </div>
                {canDismiss ? (
                  <Button variant="ghost" onClick={() => onDismiss(insight.id)}>
                    Dismiss
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function SeverityBadge({ severity }: { severity: AiInsight['severity'] }) {
  const styles: Record<string, string> = {
    INFO: 'bg-sky-50 text-sky-700 ring-sky-200',
    WARNING: 'bg-amber-50 text-amber-700 ring-amber-200',
    CRITICAL: 'bg-rose-50 text-rose-700 ring-rose-200',
  };
  return <Badge className={styles[severity] ?? styles.INFO}>{severity.toLowerCase()}</Badge>;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
