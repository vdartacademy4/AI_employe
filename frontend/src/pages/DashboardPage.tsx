import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Icons } from '@/components/icons';
import {
  BarChart,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatCard,
  StatusBadge,
} from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { actionItemsApi, alertsApi, analyticsApi, checkInsApi, dailyPulseApi, engagementApi, feedbackApi, surveysApi } from '@/lib/api';
import { ApiError } from '@/lib/api-client';
import { SEVERITY_CLASSES, formatRelative, titleCase } from '@/lib/format';

export function DashboardPage() {
  const { user, can, canAny } = useAuth();

  const overviewQuery = useQuery({
    queryKey: ['analytics', 'overview'],
    queryFn: () => analyticsApi.overview(),
    enabled: can('analytics:read-self'),
  });

  const trendsQuery = useQuery({
    queryKey: ['engagement', 'trends'],
    queryFn: () => engagementApi.trends({ months: 6 }),
    enabled: can('analytics:read-self'),
  });

  const surveysQuery = useQuery({
    queryKey: ['surveys', 'open'],
    queryFn: () => surveysApi.list({ status: 'OPEN', pageSize: 20 }),
  });

  const checkInQuery = useQuery({
    queryKey: ['check-ins', 'status'],
    queryFn: checkInsApi.status,
  });

  const myItemsQuery = useQuery({
    queryKey: ['action-items', 'mine'],
    queryFn: () => actionItemsApi.list({ assignedToMe: true, pageSize: 10 }),
    enabled: can('action-item:read-own'),
  });

  const alertsQuery = useQuery({
    queryKey: ['alerts', 'list'],
    queryFn: () => alertsApi.list({ status: 'OPEN', pageSize: 5 }),
    enabled: can('alert:read-all'),
  });

  const feedbackSummaryQuery = useQuery({
    queryKey: ['feedback', 'summary'],
    queryFn: feedbackApi.summary,
    enabled: can('feedback:read-all'),
  });

  // The daily pulse is the platform's primary surface, so the opening screen
  // states plainly whether it is done. `canSubmit` comes from the server, which
  // is also where the duplicate rule lives.
  const pulseTodayQuery = useQuery({
    queryKey: ['pulse', 'today'],
    queryFn: () => dailyPulseApi.today(),
    enabled: Boolean(user),
  });

  const openSurveys = surveysQuery.data?.data ?? [];
  const myItems = myItemsQuery.data?.data ?? [];
  const alerts = alertsQuery.data?.data ?? [];
  const feedbackCount =
    feedbackSummaryQuery.data?.byStatus.reduce((total, row) => total + row.count, 0) ?? null;

  return (
    <>
      <PageHeader
        title={user ? `Hello, ${user.firstName}` : 'Dashboard'}
        description="Everything you need for your own experience, plus anything waiting on you."
        actions={
          canAny('report:generate', 'report:read-all') ? (
            <Link to="/reports">
              <Button variant="secondary">
                <Icons.report className="h-4 w-4" />
                Reports
              </Button>
            </Link>
          ) : undefined
        }
      />

      {/*
        * The app is not gated, so on a cold start there is no session yet. Say
        * so once, up front, rather than letting every panel below show an
        * unexplained error.
        */}
      {!user ? (
        <Card className="mb-6 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-900">No account selected</p>
              <p className="mt-0.5 text-sm text-slate-600">
                Choose an account to load your dashboard. The API scopes every figure to the signed-in
                account, so the panels stay empty until then.
              </p>
            </div>
            <Link to="/login">
              <Button>Choose account</Button>
            </Link>
          </div>
        </Card>
      ) : null}

      {pulseTodayQuery.data && !pulseTodayQuery.data.alreadySubmitted ? (
        <Card className="mb-6 border-brand-200 bg-brand-50/40">
          <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-brand-100 p-2 text-brand-700">
                <Icons.feedback className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900">
                  Today&rsquo;s {pulseTodayQuery.data.questionCount} questions are waiting
                </p>
                <p className="mt-0.5 text-sm text-slate-600">
                  Answer them plus a short written comment. It takes about a minute.
                </p>
              </div>
            </div>
            <Link to="/daily-feedback">
              <Button>Start today&rsquo;s feedback</Button>
            </Link>
          </div>
        </Card>
      ) : null}

      {pulseTodayQuery.data?.alreadySubmitted ? (
        <Card className="mb-6 border-emerald-200 bg-emerald-50/40">
          <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-emerald-100 p-2 text-emerald-700">
                <Icons.checkin className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900">Today&rsquo;s feedback is submitted</p>
                <p className="mt-0.5 text-sm text-slate-600">
                  {pulseTodayQuery.data.allowResubmission
                    ? 'Resubmission is open, so you can replace your answers until the day ends.'
                    : 'Thanks — your score and history update on your dashboard.'}
                </p>
              </div>
            </div>
            <Link to="/dashboards">
              <Button variant="secondary">View my dashboard</Button>
            </Link>
          </div>
        </Card>
      ) : null}

      {checkInQuery.data?.enabled && !checkInQuery.data.alreadySubmitted ? (
        <Card className="mb-6 border-brand-200 bg-brand-50/40">
          <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-brand-100 p-2 text-brand-700">
                <Icons.checkin className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900">Your {checkInQuery.data.period} check-in is open</p>
                <p className="mt-0.5 text-sm text-slate-600">
                  It takes under a minute and only you can see the individual answer.
                </p>
              </div>
            </div>
            <Link to="/check-ins">
              <Button>Take check-in</Button>
            </Link>
          </div>
        </Card>
      ) : null}

      {can('analytics:read-self') ? (
        <section className="mb-6">
          <div className="mb-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Employees in scope"
              value={overviewQuery.data?.employees ?? null}
              loading={overviewQuery.isLoading}
            />
            <StatCard
              label="Open alerts"
              value={overviewQuery.data?.openAlerts ?? null}
              loading={overviewQuery.isLoading}
            />
            <StatCard
              label="Open surveys"
              value={overviewQuery.data?.openSurveys ?? null}
              loading={overviewQuery.isLoading}
            />
            <StatCard
              label="Survey responses"
              value={overviewQuery.data?.submittedResponses ?? null}
              hint={can('feedback:read-all') && feedbackCount !== null ? `${feedbackCount} feedback items` : undefined}
              loading={overviewQuery.isLoading}
            />
          </div>

          {overviewQuery.isError ? (
            <Card>
              <ErrorState
                message={overviewQuery.error instanceof ApiError ? overviewQuery.error.message : undefined}
                onRetry={() => void overviewQuery.refetch()}
              />
            </Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader
                  title="Engagement trend"
                  description="Your scores over the last six months."
                  actions={
                    <Link to="/analytics" className="text-xs font-medium text-brand-600 hover:text-brand-700">
                      View analytics
                    </Link>
                  }
                />
                {trendsQuery.isLoading ? (
                  <LoadingState label="Loading trend" />
                ) : trendsQuery.isError ? (
                  <ErrorState
                    message={trendsQuery.error instanceof ApiError ? trendsQuery.error.message : undefined}
                    onRetry={() => void trendsQuery.refetch()}
                  />
                ) : (
                  <BarChart
                    data={(trendsQuery.data?.series ?? []).map((point) => ({
                      label: point.period,
                      value: point.overall,
                    }))}
                    valueLabel="overall engagement"
                    emptyMessage="No engagement scores recorded yet. They appear once surveys and check-ins are analysed."
                  />
                )}
              </Card>

              {can('alert:read-all') ? (
                <Card>
                  <CardHeader title="Open alerts" description="Items needing attention in your scope." />
                  {alertsQuery.isLoading ? (
                    <LoadingState label="Loading alerts" />
                  ) : alerts.length === 0 ? (
                    <p className="px-5 py-8 text-center text-sm text-slate-500">
                      Nothing needs attention right now.
                    </p>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {alerts.map((alert) => (
                        <li key={alert.id} className="flex items-start gap-3 px-5 py-3">
                          <span
                            className={`badge mt-0.5 ${SEVERITY_CLASSES[alert.severity] ?? ''}`}
                          >
                            {titleCase(alert.severity)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-slate-900">{alert.title}</p>
                            <p className="line-clamp-1 text-xs text-slate-500">{alert.message}</p>
                          </div>
                          <span className="shrink-0 text-xs text-slate-400">
                            {formatRelative(alert.triggeredAt)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              ) : null}
            </div>
          )}
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Open surveys" description="Available to you right now." />
          {surveysQuery.isLoading ? (
            <LoadingState label="Loading surveys" />
          ) : openSurveys.length === 0 ? (
            <EmptyState
              icon={<Icons.survey className="h-9 w-9" />}
              title="No open surveys"
              description="You are up to date. New pulse surveys will show up here."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {openSurveys.slice(0, 5).map((survey) => (
                <li key={survey.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{survey.title}</p>
                    <p className="truncate text-xs text-slate-500">
                      {survey._count?.questions ?? 0} questions
                      {survey.isAnonymous ? ' · anonymous' : ''}
                    </p>
                  </div>
                  <Link to="/surveys">
                    <Button variant="ghost">Open</Button>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Assigned to you" description="Action items from alerts you own." />
          {myItemsQuery.isLoading ? (
            <LoadingState label="Loading action items" />
          ) : myItems.length === 0 ? (
            <EmptyState
              icon={<Icons.checkin className="h-9 w-9" />}
              title="Nothing assigned"
              description="Action items you are responsible for will appear here."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {myItems.map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{item.title}</p>
                    <p className="text-xs text-slate-500">
                      {titleCase(item.priority)} priority
                      {item.dueDate ? ` · due ${item.dueDate}` : ''}
                    </p>
                  </div>
                  <StatusBadge status={item.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
