import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
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
} from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { actionItemsApi, riskApi } from '@/lib/api';
import { ApiError } from '@/lib/api-client';
import { RISK_LEVEL_CLASSES, formatDateTime, titleCase } from '@/lib/format';
import type { RiskPrediction } from '@/types';

const RISK_LEVELS = ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'];

function factorList(factors: string | null): string[] {
  if (!factors) return [];
  return factors
    .split(',')
    .map((factor) => factor.trim())
    .filter(Boolean);
}

function RiskTable({
  predictions,
  showEmployee,
}: {
  predictions: RiskPrediction[];
  showEmployee: boolean;
}) {
  if (predictions.length === 0) {
    return (
      <EmptyState
        title="No risk predictions"
        description="Predictions appear once the model has been run against engagement data."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
            {showEmployee ? <th className="px-5 py-2 font-medium">Employee</th> : null}
            <th className="px-3 py-2 font-medium">Risk</th>
            <th className="px-3 py-2 text-right font-medium">Score</th>
            <th className="px-3 py-2 font-medium">Contributing factors</th>
            <th className="px-5 py-2 text-right font-medium">Predicted</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {predictions.map((prediction) => (
            <tr key={prediction.id} className="align-top">
              {showEmployee ? (
                <td className="px-5 py-3">
                  <p className="font-medium text-slate-900">
                    {prediction.employee?.firstName ?? 'Unknown'} {prediction.employee?.lastName ?? ''}
                  </p>
                  <p className="text-xs text-slate-500">
                    {prediction.employee?.jobTitle ?? '—'}
                    {prediction.employee?.department ? ` · ${prediction.employee.department.name}` : ''}
                  </p>
                </td>
              ) : null}
              <td className="px-3 py-3">
                <Badge className={RISK_LEVEL_CLASSES[prediction.riskLevel] ?? ''}>
                  {titleCase(prediction.riskLevel)}
                </Badge>
              </td>
              <td className="px-3 py-3 text-right tabular-nums text-slate-700">
                {prediction.riskScore.toFixed(1)}
                {prediction.confidence !== null ? (
                  <span className="block text-xs text-slate-400">
                    {(prediction.confidence * 100).toFixed(0)}% conf.
                  </span>
                ) : null}
              </td>
              <td className="px-3 py-3 text-xs text-slate-600">
                {factorList(prediction.factors).length > 0 ? (
                  <ul className="space-y-0.5">
                    {factorList(prediction.factors).map((factor) => (
                      <li key={factor}>{titleCase(factor)}</li>
                    ))}
                  </ul>
                ) : (
                  '—'
                )}
                {prediction.explanation ? (
                  <p className="mt-1.5 max-w-sm text-slate-500">{prediction.explanation}</p>
                ) : null}
              </td>
              <td className="px-5 py-3 text-right text-xs text-slate-400">
                {formatDateTime(prediction.predictedAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RiskPage() {
  const queryClient = useQueryClient();
  const { employeeId, can } = useAuth();
  const [level, setLevel] = useState('');

  const canSeeOthers = can('risk:read-all');
  const canRun = can('risk:run');

  const orgQuery = useQuery({
    queryKey: ['risk', 'list', level],
    queryFn: () => riskApi.list({ ...(level ? { riskLevel: level } : {}), pageSize: 50 }),
    enabled: canSeeOthers,
  });

  const ownQuery = useQuery({
    queryKey: ['risk', 'own', employeeId],
    queryFn: () => riskApi.forEmployee(employeeId as string),
    enabled: !canSeeOthers && Boolean(employeeId),
  });

  const [actionTitle, setActionTitle] = useState('');
  const [actionPriority, setActionPriority] = useState('MEDIUM');

  const run = useMutation({
    mutationFn: () => riskApi.run(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['risk'] });
    },
  });

  const createAction = useMutation({
    mutationFn: () =>
      actionItemsApi.create({ title: actionTitle.trim(), priority: actionPriority }),
    onSuccess: () => {
      setActionTitle('');
      void queryClient.invalidateQueries({ queryKey: ['action-items'] });
    },
  });

  const myItemsQuery = useQuery({
    queryKey: ['action-items', 'mine'],
    queryFn: () => actionItemsApi.list({ assignedToMe: true, pageSize: 20 }),
    enabled: can('action-item:read-own'),
  });

  return (
    <>
      <PageHeader
        title="Attrition risk"
        description="Predictions are decision support, not a verdict. Treat them as prompts for a conversation."
        actions={
          canRun ? (
            <Button onClick={() => run.mutate()} disabled={run.isPending}>
              {run.isPending ? 'Running model…' : 'Run model'}
            </Button>
          ) : undefined
        }
      />

      {!canSeeOthers ? (
        <div className="mb-4">
          <Callout tone="info" title="Personal view only">
            You can see your own risk assessment. Organisation-wide predictions are limited to HR
            and administrators.
          </Callout>
        </div>
      ) : null}

      <Card className="mb-4">
        <CardHeader
          title={canSeeOthers ? 'Risk predictions' : 'Your risk assessment'}
          description={
            canSeeOthers
              ? 'Across the employees in your scope.'
              : 'Derived from your own engagement and check-in data.'
          }
          actions={
            canSeeOthers ? (
              <Select
                className="w-auto"
                value={level}
                onChange={(event) => setLevel(event.target.value)}
                aria-label="Filter by risk level"
              >
                <option value="">All levels</option>
                {RISK_LEVELS.map((option) => (
                  <option key={option} value={option}>
                    {titleCase(option)}
                  </option>
                ))}
              </Select>
            ) : undefined
          }
        />

        {canSeeOthers ? (
          orgQuery.isLoading ? (
            <LoadingState label="Loading predictions" />
          ) : orgQuery.isError ? (
            <ErrorState
              message={orgQuery.error instanceof ApiError ? orgQuery.error.message : undefined}
              onRetry={() => void orgQuery.refetch()}
            />
          ) : (
            <RiskTable predictions={orgQuery.data?.data ?? []} showEmployee />
          )
        ) : employeeId ? (
          ownQuery.isLoading ? (
            <LoadingState label="Loading your assessment" />
          ) : ownQuery.isError ? (
            <ErrorState
              message={ownQuery.error instanceof ApiError ? ownQuery.error.message : undefined}
              onRetry={() => void ownQuery.refetch()}
            />
          ) : (
            <RiskTable predictions={ownQuery.data ?? []} showEmployee={false} />
          )
        ) : (
          <EmptyState
            title="No employee record linked"
            description="Your account is not linked to an employee record, so there is nothing to assess yet."
          />
        )}
      </Card>

      {can('action-item:create') ? (
        <Card className="mb-4">
          <CardHeader title="Raise an action item" description="Record a follow-up action for a concern." />
          <form
            className="flex flex-wrap items-end gap-3 px-5 pb-5"
            onSubmit={(event) => {
              event.preventDefault();
              createAction.mutate();
            }}
          >
            <div className="min-w-[16rem] flex-1">
              <Field label="Action" htmlFor="action-title">
                <Input
                  id="action-title"
                  value={actionTitle}
                  onChange={(event) => setActionTitle(event.target.value)}
                  placeholder="Schedule a supportive one-to-one"
                  required
                />
              </Field>
            </div>
            <div className="w-40">
              <Field label="Priority" htmlFor="action-priority">
                <Select
                  id="action-priority"
                  value={actionPriority}
                  onChange={(event) => setActionPriority(event.target.value)}
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </Select>
              </Field>
            </div>
            <Button type="submit" disabled={createAction.isPending || !actionTitle.trim()}>
              Create
            </Button>
          </form>
        </Card>
      ) : null}

      {can('action-item:read-own') ? (
        <Card>
          <CardHeader title="Your action items" />
          {myItemsQuery.isLoading ? (
            <LoadingState label="Loading action items" />
          ) : (myItemsQuery.data?.data.length ?? 0) === 0 ? (
            <EmptyState title="No action items" description="Nothing is currently assigned to you." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {myItemsQuery.data?.data.map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">{item.title}</p>
                    {item.description ? (
                      <p className="mt-0.5 text-sm text-slate-600">{item.description}</p>
                    ) : null}
                    {item.dueDate ? (
                      <p className="mt-0.5 text-xs text-slate-500">Due {item.dueDate}</p>
                    ) : null}
                  </div>
                  <StatusBadge status={item.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}
    </>
  );
}
