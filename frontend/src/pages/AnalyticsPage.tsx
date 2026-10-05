import { useQuery } from '@tanstack/react-query';
import {
  BarChart,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatCard,
} from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { analyticsApi, engagementApi, surveysApi } from '@/lib/api';
import { ApiError } from '@/lib/api-client';
import { titleCase } from '@/lib/format';

const TREND_METRICS = [
  { key: 'overall', label: 'Overall' },
  { key: 'workLifeBalance', label: 'Work-life balance' },
  { key: 'growthOpportunity', label: 'Growth' },
  { key: 'managerEffectiveness', label: 'Manager' },
  { key: 'workloadBalance', label: 'Workload' },
] as const;

export function AnalyticsPage() {
  const { can } = useAuth();
  const canSeeDepartments = can('analytics:read-all');

  const overviewQuery = useQuery({
    queryKey: ['analytics', 'overview'],
    queryFn: () => analyticsApi.overview(),
  });

  const trendsQuery = useQuery({
    queryKey: ['engagement', 'trends'],
    queryFn: () => engagementApi.trends({ months: 12 }),
  });

  const distributionQuery = useQuery({
    queryKey: ['engagement', 'distribution'],
    queryFn: engagementApi.distribution,
  });

  const departmentsQuery = useQuery({
    queryKey: ['analytics', 'by-department'],
    queryFn: analyticsApi.byDepartment,
    enabled: canSeeDepartments,
  });

  const headcountQuery = useQuery({
    queryKey: ['analytics', 'headcount'],
    queryFn: analyticsApi.headcount,
    enabled: can('analytics:read-headcount'),
  });

  const surveyResultsQuery = useQuery({
    queryKey: ['surveys', 'results', 'first-open'],
    queryFn: async () => {
      const surveys = await surveysApi.list({ pageSize: 20 });
      const withResponses = surveys.data.find((survey) => (survey._count?.responses ?? 0) > 0);
      if (!withResponses) return null;
      return { survey: withResponses, results: await surveysApi.results(withResponses.id) };
    },
    enabled: canSeeDepartments,
  });

  const series = trendsQuery.data?.series ?? [];

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Engagement trends, distribution and - where your role permits - department comparisons."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Employees" value={overviewQuery.data?.employees ?? null} loading={overviewQuery.isLoading} />
        <StatCard
          label="Open alerts"
          value={overviewQuery.data?.openAlerts ?? null}
          loading={overviewQuery.isLoading}
        />
        <StatCard
          label="Open action items"
          value={overviewQuery.data?.openActionItems ?? null}
          loading={overviewQuery.isLoading}
        />
        <StatCard
          label="Survey responses"
          value={overviewQuery.data?.submittedResponses ?? null}
          loading={overviewQuery.isLoading}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Engagement over time" description="Twelve-month series for your scope." />
          {trendsQuery.isLoading ? (
            <LoadingState label="Loading trends" />
          ) : trendsQuery.isError ? (
            <ErrorState
              message={trendsQuery.error instanceof ApiError ? trendsQuery.error.message : undefined}
              onRetry={() => void trendsQuery.refetch()}
            />
          ) : (
            <BarChart
              data={series.map((point) => ({ label: point.period, value: point.overall }))}
              valueLabel="overall engagement"
              emptyMessage="No engagement scores have been calculated yet."
            />
          )}
        </Card>

        <Card>
          <CardHeader title="Score distribution" description="How scores are spread across your scope." />
          {distributionQuery.isLoading ? (
            <LoadingState label="Loading distribution" />
          ) : distributionQuery.isError ? (
            <ErrorState
              message={distributionQuery.error instanceof ApiError ? distributionQuery.error.message : undefined}
              onRetry={() => void distributionQuery.refetch()}
            />
          ) : (
            <BarChart
              data={(distributionQuery.data ?? []).map((row) => ({ label: row.label, value: row.count }))}
              valueLabel="employees"
              emptyMessage="No distribution data yet."
            />
          )}
        </Card>

        {TREND_METRICS.slice(1).map((metric) => (
          <Card key={metric.key}>
            <CardHeader title={metric.label} description="Monthly trend." />
            <BarChart
              data={series.map((point) => ({ label: point.period, value: point[metric.key] }))}
              valueLabel={metric.label.toLowerCase()}
              emptyMessage="Not enough data yet."
            />
          </Card>
        ))}
      </div>

      {canSeeDepartments ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader
              title="By department"
              description="Averages are suppressed for groups below the configured minimum."
            />
            {departmentsQuery.isLoading ? (
              <LoadingState label="Loading departments" />
            ) : departmentsQuery.isError ? (
              <ErrorState
                message={departmentsQuery.error instanceof ApiError ? departmentsQuery.error.message : undefined}
                onRetry={() => void departmentsQuery.refetch()}
              />
            ) : !departmentsQuery.data?.available ? (
              <EmptyState
                title="Department analytics unavailable"
                description="No department data exists yet, or your role cannot see it."
              />
            ) : departmentsQuery.data.departments.length === 0 ? (
              <EmptyState title="No departments" description="Create a department to see comparisons." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-5 py-2 font-medium">Department</th>
                      <th className="px-3 py-2 text-right font-medium">Headcount</th>
                      <th className="px-3 py-2 text-right font-medium">Engagement</th>
                      <th className="px-5 py-2 text-right font-medium">eNPS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {departmentsQuery.data.departments.map((department) => (
                      <tr key={department.departmentId}>
                        <td className="px-5 py-2.5 font-medium text-slate-800">
                          {department.name}
                          <span className="ml-1.5 text-xs text-slate-400">{department.code}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                          {department.headcount}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                          {department.averageEngagement?.toFixed(1) ?? '—'}
                        </td>
                        <td className="px-5 py-2.5 text-right tabular-nums text-slate-600">
                          {department.eNps ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {headcountQuery.data ? (
            <Card>
              <CardHeader title="Headcount" description="Employment mix and tenure." />
              <BarChart
                data={headcountQuery.data.tenureDistribution.map((row) => ({
                  label: row.label,
                  value: row.count,
                }))}
                valueLabel="employees"
                emptyMessage="No headcount data yet."
              />
              <div className="grid grid-cols-3 divide-x divide-slate-100 border-t border-slate-100 px-2 py-3 text-center">
                <div>
                  <p className="text-lg font-semibold tabular-nums text-slate-900">
                    {headcountQuery.data.total}
                  </p>
                  <p className="text-xs text-slate-500">Total</p>
                </div>
                <div>
                  <p className="text-lg font-semibold tabular-nums text-emerald-600">
                    {headcountQuery.data.active}
                  </p>
                  <p className="text-xs text-slate-500">Active</p>
                </div>
                <div>
                  <p className="text-lg font-semibold tabular-nums text-slate-500">
                    {headcountQuery.data.terminated}
                  </p>
                  <p className="text-xs text-slate-500">Terminated</p>
                </div>
              </div>
            </Card>
          ) : null}

          <Card className="lg:col-span-2">
            <CardHeader
              title="Latest survey results"
              description="Aggregate answers from the most recent survey with responses."
            />
            {surveyResultsQuery.isLoading ? (
              <LoadingState label="Loading results" />
            ) : !surveyResultsQuery.data ? (
              <EmptyState
                title="No survey results yet"
                description="Results appear once a survey has collected responses."
              />
            ) : (
              <div className="space-y-4 px-5 pb-5">
                <p className="text-sm text-slate-600">
                  <span className="font-medium text-slate-900">
                    {surveyResultsQuery.data.survey.title}
                  </span>{' '}
                  · {surveyResultsQuery.data.results.responseCount} responses
                </p>
                {surveyResultsQuery.data.results.questions
                  .filter((question) => question.average !== null || question.distribution)
                  .map((question) => (
                    <div key={question.questionId}>
                      <p className="mb-1.5 text-sm font-medium text-slate-800">{question.prompt}</p>
                      {question.distribution ? (
                        <BarChart
                          data={Object.entries(question.distribution).map(([label, value]) => ({
                            label: titleCase(label),
                            value,
                          }))}
                          valueLabel="responses"
                        />
                      ) : (
                        <p className="text-sm text-slate-600">
                          Average {question.average?.toFixed(2)} across {question.answerCount} answers
                        </p>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </Card>
        </div>
      ) : (
        <Card className="mt-4">
          <EmptyState
            title="Organisation-wide analytics are restricted"
            description="Your role can see individual and aggregate engagement, but not department or headcount breakdowns."
          />
        </Card>
      )}
    </>
  );
}
