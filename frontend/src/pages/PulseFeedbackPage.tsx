import { useQuery } from '@tanstack/react-query';
import { PageHeader, Card, CardHeader, EmptyState, LoadingState, ErrorState, Badge } from '@/components/ui';
import { dailyPulseApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

/**
 * Written feedback from the daily pulse.
 *
 * Anonymous entries are rendered without an author, and only appear at all for
 * roles the backend grants `feedback:read-anonymous`. A manager therefore sees
 * their team's attributed comments and nothing from the anonymous pool — the
 * distinction is enforced on the server, and this component simply reflects it.
 */
export function PulseFeedbackPage() {
  const { user } = useAuth();
  const feedback = useQuery({
    queryKey: ['pulse', 'feedback'],
    queryFn: () => dailyPulseApi.listFeedback({ pageSize: 50 }),
  });

  const isEmployee = user?.role === 'EMPLOYEE';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Written Feedback"
        description="Comments submitted with the daily pulse."
        actions={<Badge>{user?.role ?? ''}</Badge>}
      />

      <Card>
        <CardHeader
          title="Recent submissions"
          description="Anonymous comments are pooled and never attributed."
        />

        {feedback.isLoading ? (
          <LoadingState />
        ) : feedback.isError ? (
          <ErrorState title="Could not load feedback" onRetry={() => void feedback.refetch()} />
        ) : (feedback.data?.length ?? 0) === 0 ? (
          <EmptyState
            title="No written feedback yet"
            description={
              isEmployee
                ? 'Comments you write with your daily submission will appear here.'
                : 'Once employees write comments alongside their daily answers, they will appear here.'
            }
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {feedback.data!.map((item) => (
              <li key={item.id} className="py-4">
                <div className="flex flex-wrap items-center gap-2">
                  {item.isAnonymous ? (
                    <Badge className="bg-slate-800 text-white ring-slate-700">Anonymous</Badge>
                  ) : (
                    <span className="text-sm font-medium text-slate-900">
                      {item.author?.name ?? 'Unknown'}
                    </span>
                  )}
                  <Badge>{item.category.replace(/_/g, ' ').toLowerCase()}</Badge>
                  <span className="text-xs text-slate-400">
                    {new Date(item.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-700">{item.content}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {!isEmployee ? (
        <p className="text-xs text-slate-500">
          Anonymous content is only released once the anonymous pool is large enough to prevent
          identification by elimination. Departments and teams are not shown for anonymous entries
          because filtering them would require the attribution that deliberately does not exist.
        </p>
      ) : null}
    </div>
  );
}
