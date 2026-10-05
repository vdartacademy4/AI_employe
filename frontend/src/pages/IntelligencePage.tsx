import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Callout,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatCard,
  StackedShareChart,
  SuppressedPanel,
  TrendLineChart,
  BarChart,
} from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { intelligenceApi } from '@/lib/api';
import { formatDateTime, titleCase } from '@/lib/format';
import type { AnalyticsLevel, SentimentClass } from '@/types';

const SENTIMENT_BADGES: Record<SentimentClass, string> = {
  POSITIVE: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  NEUTRAL: 'bg-slate-100 text-slate-600 ring-slate-200',
  NEGATIVE: 'bg-rose-50 text-rose-700 ring-rose-200',
};

const METHOD_BADGES: Record<string, string> = {
  AI: 'bg-violet-50 text-violet-700 ring-violet-200',
  LEXICON: 'bg-slate-100 text-slate-600 ring-slate-200',
  UNSCORED: 'bg-amber-50 text-amber-700 ring-amber-200',
};

const MONTHS_OPTIONS = [3, 6, 12] as const;

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function IntelligencePage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();

  const canSeeAll = can('analytics:read-all');
  const [months, setMonths] = useState<number>(6);
  const [level, setLevel] = useState<AnalyticsLevel>('EMPLOYEE');
  const [period, setPeriod] = useState(currentPeriod());
  const [scopeEmployeeId, setScopeEmployeeId] = useState<string>('');

  // Aggregate levels are gated server-side; the control is hidden for scoped
  // users so they are not offered a view that would 403.
  const effectiveLevel: AnalyticsLevel = canSeeAll ? level : 'EMPLOYEE';

  const trendParams = useMemo(
    () => ({ months, ...(scopeEmployeeId ? { employeeId: scopeEmployeeId } : {}) }),
    [months, scopeEmployeeId],
  );

  const sentimentQuery = useQuery({
    queryKey: ['intelligence', 'sentiment', trendParams],
    queryFn: () => intelligenceApi.sentimentTrends(trendParams),
  });

  const themeQuery = useQuery({
    queryKey: ['intelligence', 'themes', trendParams],
    queryFn: () => intelligenceApi.themeTrends(trendParams),
  });

  const engagementQuery = useQuery({
    queryKey: ['intelligence', 'engagement', trendParams, effectiveLevel],
    queryFn: () =>
      intelligenceApi.engagementTrends(
        effectiveLevel === 'EMPLOYEE' ? trendParams : { ...trendParams, level: effectiveLevel },
      ),
  });

  const breakdownQuery = useQuery({
    queryKey: ['intelligence', 'breakdown', period, effectiveLevel],
    queryFn: () =>
      intelligenceApi.employeeBreakdown(
        effectiveLevel === 'ORGANISATION' ? { period } : { period },
      ),
  });

  const analysesQuery = useQuery({
    queryKey: ['intelligence', 'analyses', scopeEmployeeId],
    queryFn: () => intelligenceApi.recentAnalyses({ limit: 25, ...(scopeEmployeeId ? { employeeId: scopeEmployeeId } : {}) }),
  });

  const factorsQuery = useQuery({
    queryKey: ['intelligence', 'factors'],
    queryFn: intelligenceApi.factors,
  });

  const refreshMutation = useMutation({
    mutationFn: () => intelligenceApi.refresh({ period, reanalyze: false }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['intelligence'] });
    },
  });

  const analyseMutation = useMutation({
    mutationFn: () => intelligenceApi.analyse({ reanalyze: true }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['intelligence'] });
    },
  });

  const sentiment = sentimentQuery.data;
  const themes = themeQuery.data;
  const engagement = engagementQuery.data;

  // At an aggregate level each point carries `engagement`; at employee level it
  // carries `value`. Reading the field that matches the requested level keeps
  // the two apart without asserting a shape the API does not guarantee.
  const isAggregate = effectiveLevel !== 'EMPLOYEE';
  const series = engagement?.series ?? [];
  const scoreOf = (point: (typeof series)[number]) => (isAggregate ? point.engagement : point.value);

  const latestThemePeriod = themes?.series[themes.series.length - 1];
  const allSuppressed =
    latestThemePeriod !== undefined && latestThemePeriod.suppressed && latestThemePeriod.sampleSize > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Intelligence"
        description="Sentiment, themes and engagement computed from the platform's own text and activity records."
        actions={
          can('analytics:read-all') ? (
            <>
              <Button
                variant="secondary"
                disabled={analyseMutation.isPending}
                onClick={() => analyseMutation.mutate()}
              >
                {analyseMutation.isPending ? 'Analysing…' : 'Re-analyse text'}
              </Button>
              <Button
                disabled={refreshMutation.isPending}
                onClick={() => refreshMutation.mutate()}
              >
                {refreshMutation.isPending ? 'Refreshing…' : 'Refresh period'}
              </Button>
            </>
          ) : undefined
        }
      />

      {/* Controls */}
      <Card className="px-5 py-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="label" htmlFor="int-level">View</label>
            <select
              id="int-level"
              className="input"
              value={effectiveLevel}
              onChange={(event) => setLevel(event.target.value as AnalyticsLevel)}
              disabled={!canSeeAll}
            >
              <option value="EMPLOYEE">My engagement</option>
              {canSeeAll ? (
                <>
                  <option value="TEAM">Team</option>
                  <option value="DEPARTMENT">Department</option>
                  <option value="ORGANISATION">Organisation</option>
                </>
              ) : null}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="int-months">Range</label>
            <select
              id="int-months"
              className="input"
              value={months}
              onChange={(event) => setMonths(Number(event.target.value))}
            >
              {MONTHS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  Last {option} months
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="int-period">Period</label>
            <input
              id="int-period"
              className="input"
              type="month"
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
            />
          </div>

          <div>
            <label className="label" htmlFor="int-employee">Employee id</label>
            <input
              id="int-employee"
              className="input"
              placeholder="All in your scope"
              value={scopeEmployeeId}
              onChange={(event) => setScopeEmployeeId(event.target.value.trim())}
            />
            <p className="mt-1 text-xs text-slate-500">
              Leave blank for everyone you are allowed to see.
            </p>
          </div>
        </div>
      </Card>

      {refreshMutation.isError ? (
        <Callout tone="danger" title="Refresh failed">
          {refreshMutation.error instanceof Error ? refreshMutation.error.message : 'Unexpected error.'}
        </Callout>
      ) : null}

      {refreshMutation.isSuccess ? (
        <Callout tone="success" title={`Refreshed ${refreshMutation.data.period}`}>
          Analysed {refreshMutation.data.analysis.analysed} texts
          {refreshMutation.data.analysis.failed > 0 ? `, ${refreshMutation.data.analysis.failed} failed` : ''};
          scored {refreshMutation.data.scores.scored} employees; wrote{' '}
          {refreshMutation.data.domains.rows} aggregate rows.
          {refreshMutation.data.analysis.providerConfigured
            ? ` Provider: ${refreshMutation.data.analysis.provider}.`
            : ' No model configured, so the local lexicon produced these results.'}
        </Callout>
      ) : null}

      {/* Provenance + totals */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Texts analysed"
          value={sentiment?.totals.analysed ?? null}
          hint={`${sentiment?.totals.aiAssisted ?? 0} by model, ${sentiment?.totals.lexicon ?? 0} by lexicon`}
          loading={sentimentQuery.isLoading}
        />
        <StatCard
          label="Positive share"
          value={sentiment?.series.length ? formatShare(sentiment.series[sentiment.series.length - 1]) : null}
          hint={sentiment ? `Threshold n≥${sentiment.threshold}` : undefined}
          loading={sentimentQuery.isLoading}
        />
        <StatCard
          label="Periods with a score"
          value={engagementQuery.isLoading ? null : series.filter((point) => scoreOf(point) !== null).length}
          hint={isAggregate ? `${series[series.length - 1]?.groups ?? 0} reporting group(s)` : undefined}
          loading={engagementQuery.isLoading}
        />
        <StatCard
          label="Employees scored"
          value={breakdownQuery.data?.length ?? null}
          hint={period}
          loading={breakdownQuery.isLoading}
        />
      </div>

      {/* Sentiment */}
      <Card>
        <CardHeader
          title="Sentiment over time"
          description="Share of analysed text by label, per period."
        />
        {sentimentQuery.isLoading ? (
          <LoadingState />
        ) : sentimentQuery.isError ? (
          <ErrorState
            message={sentimentQuery.error instanceof Error ? sentimentQuery.error.message : undefined}
            onRetry={() => void sentimentQuery.refetch()}
          />
        ) : (
          <StackedShareChart
            data={sentiment?.series ?? []}
            emptyMessage="No text has been analysed for this range yet. Run a refresh to analyse feedback, surveys, check-ins and chat."
          />
        )}
      </Card>

      {/* Themes */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Themes"
            description={latestThemePeriod ? `Latest period ${latestThemePeriod.period}, n=${latestThemePeriod.sampleSize}` : undefined}
          />
          {themeQuery.isLoading ? (
            <LoadingState />
          ) : themeQuery.isError ? (
            <ErrorState
              message={themeQuery.error instanceof Error ? themeQuery.error.message : undefined}
              onRetry={() => void themeQuery.refetch()}
            />
          ) : allSuppressed ? (
            <SuppressedPanel
              message="The latest period has too few analysed texts to report theme shares."
              hint="Counts remain visible below so you can see that data exists."
            />
          ) : latestThemePeriod ? (
            <BarChart
              data={latestThemePeriod.themes.map((theme) => ({
                label: theme.label,
                value: theme.share === null ? null : Math.round(theme.share * 100),
              }))}
              valueLabel="share of analysed text (%)"
            />
          ) : (
            <EmptyState title="No themes yet" description="Themes appear once text has been analysed." />
          )}
        </Card>

        {/* Engagement */}
        <Card>
          <CardHeader
            title="Engagement trend"
            description={
              isAggregate
                ? `Averaged across ${series[series.length - 1]?.groups ?? 0} reporting group(s).`
                : 'Mean engagement score on 0-100.'
            }
          />
          {engagementQuery.isLoading ? (
            <LoadingState />
          ) : engagementQuery.isError ? (
            <ErrorState
              message={engagementQuery.error instanceof Error ? engagementQuery.error.message : undefined}
              onRetry={() => void engagementQuery.refetch()}
            />
          ) : (
            <TrendLineChart
              data={series.map((point) => ({
                period: point.period,
                value: scoreOf(point),
                suppressed: point.suppressed,
                sampleSize: point.sampleSize,
              }))}
            />
          )}
        </Card>
      </div>

      {/* Factor explainability */}
      <Card>
        <CardHeader
          title="How the score is built"
          description="Factor weights in the current configuration."
        />
        {factorsQuery.isLoading ? (
          <LoadingState />
        ) : factorsQuery.isError ? (
          <ErrorState
            message={factorsQuery.error instanceof Error ? factorsQuery.error.message : undefined}
            onRetry={() => void factorsQuery.refetch()}
          />
        ) : (
          <div className="grid gap-4 px-5 py-4 sm:grid-cols-3">
            {(factorsQuery.data?.factors ?? []).map((factor) => (
              <div key={factor.key} className="rounded-lg border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">{factor.label}</p>
                  <Badge className={factor.enabled ? 'bg-brand-50 text-brand-700 ring-brand-200' : 'bg-slate-100 text-slate-500 ring-slate-200'}>
                    {factor.enabled ? 'On' : 'Off'}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Weight {Math.round(factor.weight * 100)}%{factor.overridden ? ' (overridden)' : ''}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-slate-600">{factor.description}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Employee breakdown */}
      <Card>
        <CardHeader title={`Employee scores for ${period}`} description="Each score, with the factors behind it." />
        {breakdownQuery.isLoading ? (
          <LoadingState />
        ) : breakdownQuery.isError ? (
          <ErrorState
            message={breakdownQuery.error instanceof Error ? breakdownQuery.error.message : undefined}
            onRetry={() => void breakdownQuery.refetch()}
          />
        ) : (breakdownQuery.data?.length ?? 0) === 0 ? (
          <EmptyState title="No employees in scope" description="No scores are available for this period." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead>
                <tr>
                  <th className="table-header">Employee</th>
                  <th className="table-header">Score</th>
                  <th className="table-header">Confidence</th>
                  <th className="table-header">Factors</th>
                  <th className="table-header">Sentiment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {breakdownQuery.data!.map((employee) => (
                  <tr key={employee.employeeId}>
                    <td className="table-cell">
                      <p className="font-medium text-slate-900">{employee.name}</p>
                      <p className="text-xs text-slate-500">
                        {employee.jobTitle ?? '—'}
                        {employee.department ? ` · ${employee.department}` : ''}
                      </p>
                    </td>
                    <td className="table-cell">
                      {employee.overallScore === null ? (
                        <span className="text-slate-400">No data</span>
                      ) : (
                        <span className="font-semibold tabular-nums text-slate-900">
                          {Math.round(employee.overallScore)}
                        </span>
                      )}
                    </td>
                    <td className="table-cell text-slate-600">
                      {employee.confidence === null ? '—' : `${Math.round(employee.confidence * 100)}%`}
                    </td>
                    <td className="table-cell">
                      <div className="space-y-1">
                        {employee.factors.map((factor) => (
                          <div key={factor.key} className="flex items-center gap-2 text-xs">
                            <span className="w-40 truncate text-slate-600" title={factor.key}>
                              {titleCase(factor.key)}
                            </span>
                            {factor.score === null ? (
                              <span className="text-slate-400">no data</span>
                            ) : (
                              <span className="tabular-nums text-slate-700">
                                {Math.round(factor.score)} ({Math.round(factor.contribution)}%)
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="table-cell">
                      <div className="flex gap-1">
                        {(['POSITIVE', 'NEUTRAL', 'NEGATIVE'] as SentimentClass[]).map((label) => (
                          <span
                            key={label}
                            className={`rounded px-1.5 py-0.5 text-xs tabular-nums ${SENTIMENT_BADGES[label]}`}
                            title={label}
                          >
                            {employee.sentiment[label] ?? 0}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Review queue */}
      <Card>
        <CardHeader
          title="Recently analysed text"
          description="The most recent classifications, with how each one was produced."
        />
        {analysesQuery.isLoading ? (
          <LoadingState />
        ) : analysesQuery.isError ? (
          <ErrorState
            message={analysesQuery.error instanceof Error ? analysesQuery.error.message : undefined}
            onRetry={() => void analysesQuery.refetch()}
          />
        ) : (analysesQuery.data?.length ?? 0) === 0 ? (
          <EmptyState title="Nothing analysed yet" description="Run a refresh to analyse your existing feedback, surveys, check-ins and chat." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {analysesQuery.data!.map((analysis) => (
              <li key={analysis.id} className="px-5 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={SENTIMENT_BADGES[analysis.label]}>{titleCase(analysis.label)}</Badge>
                  <Badge className={METHOD_BADGES[analysis.method] ?? 'bg-slate-100 text-slate-600 ring-slate-200'}>
                    {analysis.method}
                    {analysis.provider ? ` · ${analysis.provider}` : ''}
                  </Badge>
                  <span className="text-xs text-slate-500">{titleCase(analysis.sourceType)}</span>
                  <span className="text-xs text-slate-400">{analysis.period}</span>
                  {analysis.employee ? (
                    <span className="text-xs text-slate-500">
                      {analysis.employee.firstName} {analysis.employee.lastName}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">Unattributed</span>
                  )}
                  <span className="ml-auto text-xs text-slate-400">{formatDateTime(analysis.analyzedAt)}</span>
                </div>
                {analysis.excerpt ? (
                  <p className="mt-1 line-clamp-2 text-sm text-slate-700">{analysis.excerpt}</p>
                ) : null}
                {analysis.themes.length > 0 ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {analysis.themes.map((theme) => (
                      <Badge key={theme.theme} className="bg-indigo-50 text-indigo-700 ring-indigo-200">
                        {theme.label} {Math.round(theme.confidence * 100)}%
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function formatShare(point: { positive: number | null; suppressed: boolean } | undefined): string | null {
  if (!point || point.positive === null) return null;
  return `${Math.round(point.positive * 100)}%`;
}
