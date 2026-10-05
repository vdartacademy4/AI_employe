import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icons } from '@/components/icons';
import {
  Badge,
  Button,
  Callout,
  Card,
  CardHeader,
  ErrorState,
  Field,
  Input,
  LoadingState,
  PageHeader,
} from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { adminApi, authApi, settingsApi } from '@/lib/api';
import { ApiError } from '@/lib/api-client';
import { ROLE_BADGE_CLASSES, ROLE_DESCRIPTIONS, ROLE_LABELS, titleCase } from '@/lib/format';
import type { PrivacySettings, UserRole } from '@/types';

const PRIVACY_FIELDS = [
  {
    key: 'feedbackEnabled' as const,
    label: 'Enable feedback',
    description: 'When off, the whole feedback module is read-only for everyone.',
  },
  {
    key: 'feedbackAllowAnonymous' as const,
    label: 'Allow anonymous feedback',
    description: 'Submitters can choose to hide their identity from HR and management.',
  },
  {
    key: 'feedbackAnonymousSelfVisible' as const,
    label: 'Show anonymous items to their author',
    description:
      'Off is the safe default: without it, anonymous items cannot be matched back to a submitter. If you turn this on, the server must be able to correlate submissions, which weakens the guarantee.',
  },
  {
    key: 'feedbackManagerVisible' as const,
    label: 'Managers can see employee feedback',
    description: 'Managers only ever see feedback from employees in their own team.',
  },
  {
    key: 'checkInsEnabled' as const,
    label: 'Enable check-ins',
    description: 'When off, employees cannot submit monthly check-ins.',
  },
];

const NUMBER_FIELDS = [
  {
    key: 'reportingMinimumGroupSize' as const,
    label: 'Minimum group size for reports',
    description: 'Aggregates below this many people are withheld to prevent identification.',
  },
  {
    key: 'checkInMinimumGroupSize' as const,
    label: 'Minimum group size for check-in summaries',
    description: 'Team check-in averages are withheld below this threshold.',
  },
];

export function SettingsPage() {
  const { user, can, canAny } = useAuth();
  const [tab, setTab] = useState<'privacy' | 'profile' | 'system'>(
    can('settings:manage') ? 'privacy' : 'profile',
  );

  const tabs = [
    { value: 'profile' as const, label: 'Profile' },
    ...(can('settings:manage') ? [{ value: 'privacy' as const, label: 'Privacy' }] : []),
    ...(can('system:read') ? [{ value: 'system' as const, label: 'System' }] : []),
  ];

  return (
    <>
      <PageHeader title="Settings" description="Your account, and the controls that govern this workspace." />

      <div className="mb-5 flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
        {tabs.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setTab(item.value)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === item.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'profile' ? <ProfilePanel /> : null}
      {tab === 'privacy' && can('settings:manage') ? <PrivacyPanel /> : null}
      {tab === 'system' && canAny('system:read') ? <SystemPanel role={user?.role ?? 'EMPLOYEE'} /> : null}
    </>
  );
}

function ProfilePanel() {
  const { user, refreshProfile } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const change = useMutation({
    mutationFn: () => authApi.changePassword(current, next),
    onSuccess: async () => {
      setError(null);
      setDone(true);
      setCurrent('');
      setNext('');
      setConfirm('');
      await refreshProfile();
    },
    onError: (caught) =>
      setError(caught instanceof ApiError ? caught.message : 'Unable to change your password'),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="Your account" />
        <dl className="space-y-3 px-5 pb-5 text-sm">
          {[
            ['Name', `${user?.firstName} ${user?.lastName}`],
            ['Email', user?.email],
            ['Role', ROLE_LABELS[user?.role ?? 'EMPLOYEE']],
            ['Employee record', user?.employeeId ? 'Linked' : 'Not linked'],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4">
              <dt className="text-slate-500">{label}</dt>
              <dd className="text-right font-medium text-slate-900">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="border-t border-slate-100 px-5 py-4">
          <p className="text-sm text-slate-600">
            Your role is{' '}
            <Badge className={ROLE_BADGE_CLASSES[user?.role ?? 'EMPLOYEE']}>
              {titleCase(user?.role ?? 'EMPLOYEE')}
            </Badge>{' '}
            — {ROLE_DESCRIPTIONS[user?.role ?? 'EMPLOYEE']}
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader title="Change password" description="You will stay signed in on this device." />
        <form
          className="space-y-4 px-5 pb-5"
          onSubmit={(event) => {
            event.preventDefault();
            setDone(false);
            change.mutate();
          }}
        >
          <Field label="Current password" htmlFor="current-password">
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
              required
            />
          </Field>
          <Field
            label="New password"
            htmlFor="new-password"
            hint="At least 12 characters, including upper case, lower case and a number."
          >
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(event) => setNext(event.target.value)}
              required
            />
          </Field>
          <Field
            label="Confirm new password"
            htmlFor="confirm-password"
            error={confirm && confirm !== next ? 'Passwords do not match' : undefined}
          >
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              required
            />
          </Field>

          {error ? <Callout tone="danger">{error}</Callout> : null}
          {done ? <Callout tone="success">Password updated.</Callout> : null}

          <Button type="submit" disabled={change.isPending || !current || !next || confirm !== next}>
            {change.isPending ? 'Updating…' : 'Update password'}
          </Button>
        </form>
      </Card>
    </div>
  );
}

function PrivacyPanel() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<PrivacySettings | null>(null);
  const [saved, setSaved] = useState(false);

  const privacyQuery = useQuery({
    queryKey: ['settings', 'privacy'],
    queryFn: settingsApi.privacy,
  });

  const save = useMutation({
    mutationFn: (settings: PrivacySettings) => settingsApi.updatePrivacy(settings),
    onSuccess: (result) => {
      setSaved(true);
      setDraft(result.settings);
      void queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  // Only start editing once, from the server's effective values.
  useEffect(() => {
    if (privacyQuery.data && !draft) setDraft(privacyQuery.data.settings);
  }, [privacyQuery.data, draft]);

  if (privacyQuery.isLoading) {
    return (
      <Card>
        <LoadingState label="Loading privacy settings" />
      </Card>
    );
  }

  if (privacyQuery.isError || !draft) {
    return (
      <Card>
        <ErrorState
          message={privacyQuery.error instanceof ApiError ? privacyQuery.error.message : undefined}
          onRetry={() => void privacyQuery.refetch()}
        />
      </Card>
    );
  }

  const overridden = privacyQuery.data?.overridden ?? [];

  function update<K extends keyof PrivacySettings>(key: K, value: PrivacySettings[K]) {
    setSaved(false);
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  return (
    <div className="space-y-4">
      <Callout tone="info" title="How enforcement works">
        These settings are read on the server for every request. Hiding a control in the interface
        does not grant access, and turning a control off does not by itself revoke access that the
        server still grants.
      </Callout>

      <Card>
        <CardHeader title="Privacy controls" description="Applies immediately to all users." />
        <div className="divide-y divide-slate-100">
          {PRIVACY_FIELDS.map((field) => (
            <label
              key={field.key}
              className="flex cursor-pointer items-start justify-between gap-6 px-5 py-4"
            >
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-sm font-medium text-slate-900">
                  {field.label}
                  {overridden.includes(field.key) ? (
                    <Badge className="bg-violet-50 text-violet-700 ring-violet-200">Overridden</Badge>
                  ) : null}
                </span>
                <span className="mt-0.5 block text-sm text-slate-500">{field.description}</span>
              </span>
              <span className="relative mt-0.5 inline-flex shrink-0 cursor-pointer items-center">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={draft[field.key]}
                  onChange={(event) => update(field.key, event.target.checked)}
                />
                <span className="h-6 w-11 rounded-full bg-slate-200 transition-colors peer-checked:bg-brand-600 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500 peer-focus-visible:ring-offset-2" />
                <span className="absolute left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
              </span>
            </label>
          ))}
        </div>

        <div className="grid gap-4 border-t border-slate-100 px-5 py-4 sm:grid-cols-2">
          {NUMBER_FIELDS.map((field) => (
            <Field key={field.key} label={field.label} htmlFor={field.key} hint={field.description}>
              <Input
                id={field.key}
                type="number"
                min={1}
                max={100}
                className="w-32"
                value={draft[field.key]}
                onChange={(event) => update(field.key, Number(event.target.value))}
              />
            </Field>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-5 py-4">
          <Button onClick={() => save.mutate(draft)} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save settings'}
          </Button>
          {saved ? <span className="text-sm text-emerald-600">Saved.</span> : null}
          {save.isError ? (
            <span className="text-sm text-rose-600">
              {save.error instanceof ApiError ? save.error.message : 'Save failed'}
            </span>
          ) : null}
        </div>
      </Card>
    </div>
  );
}

function SystemPanel({ role }: { role: UserRole }) {
  const systemQuery = useQuery({
    queryKey: ['admin', 'system'],
    queryFn: adminApi.system,
  });

  const matrixQuery = useQuery({
    queryKey: ['admin', 'role-matrix'],
    queryFn: adminApi.roleMatrix,
  });

  if (systemQuery.isLoading) {
    return (
      <Card>
        <LoadingState label="Loading system information" />
      </Card>
    );
  }

  if (systemQuery.isError || !systemQuery.data) {
    return (
      <Card>
        <ErrorState
          message={systemQuery.error instanceof ApiError ? systemQuery.error.message : undefined}
          onRetry={() => void systemQuery.refetch()}
        />
      </Card>
    );
  }

  const system = systemQuery.data;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="System" description="Runtime configuration. Secrets are never shown here." />
        <dl className="grid gap-x-8 gap-y-3 px-5 pb-5 text-sm sm:grid-cols-2">
          {[
            ['Environment', system.environment],
            ['API prefix', system.apiPrefix],
            ['Database', system.databaseProvider],
            ['AI provider', `${system.ai.id} (${system.ai.configured ? 'configured' : 'not configured'})`],
            ['AI model', system.ai.model],
            ['Permissions defined', String(system.totalPermissions)],
            ['Node', system.nodeVersion],
            ['Uptime', `${Math.floor(system.uptimeSeconds / 60)} min`],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 border-b border-slate-100 py-1.5">
              <dt className="text-slate-500">{label}</dt>
              <dd className="text-right font-medium text-slate-900">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card>
        <CardHeader
          title="Role permissions"
          description={`You are ${ROLE_LABELS[role]}. Each role is a fixed set of server-enforced permissions.`}
        />
        {matrixQuery.isLoading ? (
          <LoadingState label="Loading role matrix" />
        ) : matrixQuery.isError ? (
          <ErrorState
            message={matrixQuery.error instanceof ApiError ? matrixQuery.error.message : undefined}
            onRetry={() => void matrixQuery.refetch()}
          />
        ) : (
          <div className="space-y-4 px-5 pb-5">
            {matrixQuery.data?.map((row) => (
              <details key={row.role} open={row.role === role}>
                <summary className="flex cursor-pointer items-center gap-2 py-2 text-sm font-medium text-slate-900">
                  <Badge className={ROLE_BADGE_CLASSES[row.role as UserRole] ?? ''}>
                    {ROLE_LABELS[row.role as UserRole] ?? row.role}
                  </Badge>
                  <span className="text-xs text-slate-500">{row.total} permissions</span>
                </summary>
                <ul className="mt-2 grid gap-x-4 gap-y-1 text-xs text-slate-600 sm:grid-cols-2">
                  {row.permissions.map((permission) => (
                    <li key={permission} className="flex items-center gap-1.5">
                      <Icons.close className="h-3 w-3 rotate-45 text-emerald-500" />
                      {permission}
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
