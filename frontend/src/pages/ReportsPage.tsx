import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icons } from '@/components/icons';
import {
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
import { reportsApi } from '@/lib/api';
import { ApiError } from '@/lib/api-client';
import { formatDateTime, titleCase } from '@/lib/format';
import type { Report } from '@/types';

export function ReportsPage() {
  const { can, canAny } = useAuth();
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof reportsApi.generate>> | null>(null);

  const catalogueQuery = useQuery({
    queryKey: ['reports', 'catalogue'],
    queryFn: reportsApi.catalogue,
    enabled: canAny('report:generate', 'report:read-all'),
  });

  const listQuery = useQuery({
    queryKey: ['reports', 'list'],
    queryFn: () => reportsApi.list({ pageSize: 50 }),
    enabled: canAny('report:read-own', 'report:read-all'),
  });

  return (
    <>
      <PageHeader
        title="Reports"
        description={
          canAny('report:generate', 'report:read-all')
            ? 'Generate workforce reports and review previously generated output.'
            : 'Reports you have been given access to.'
        }
      />

      {canAny('report:generate', 'report:read-all') ? (
        <Generator onGenerated={setPreview} catalogue={catalogueQuery.data ?? {}} />
      ) : null}

      {preview ? (
        <Card className="mb-4">
          <CardHeader
            title={`Preview: ${preview.report.title}`}
            description={`${preview.payload.rows.length} row(s) · generated ${formatDateTime(
              preview.report.createdAt,
            )}`}
            actions={
              <Button variant="ghost" onClick={() => setPreview(null)}>
                Close
              </Button>
            }
          />
          <div className="max-h-96 overflow-auto">
            {preview.payload.rows.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-500">
                This report produced no rows. There is no data in your scope yet.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    {Object.keys(preview.payload.rows[0] as Record<string, unknown>).map((key) => (
                      <th key={key} className="px-4 py-2 font-medium">
                        {titleCase(key)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.payload.rows.slice(0, 200).map((row, index) => (
                    <tr key={index}>
                      {Object.entries(row as Record<string, unknown>).map(([key, value]) => (
                        <td key={key} className="px-4 py-2 text-slate-700">
                          {value === null || value === undefined
                            ? '—'
                            : typeof value === 'object'
                              ? JSON.stringify(value)
                              : String(value)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Generated reports" description="Stored on the server and available to download." />
        {!canAny('report:read-own', 'report:read-all') ? (
          <EmptyState
            title="No report access"
            description="Your role does not include report permissions."
          />
        ) : listQuery.isLoading ? (
          <LoadingState label="Loading reports" />
        ) : listQuery.isError ? (
          <ErrorState
            message={listQuery.error instanceof ApiError ? listQuery.error.message : undefined}
            onRetry={() => void listQuery.refetch()}
          />
        ) : (listQuery.data?.data.length ?? 0) === 0 ? (
          <EmptyState
            icon={<Icons.report className="h-9 w-9" />}
            title="No reports yet"
            description="Generate one above to see it listed here."
          />
        ) : (
          <ReportTable reports={listQuery.data?.data ?? []} canDelete={can('report:delete-all')} />
        )}
      </Card>
    </>
  );
}

function ReportTable({ reports, canDelete }: { reports: Report[]; canDelete: boolean }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const remove = useMutation({
    mutationFn: (id: string) => reportsApi.remove(id),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['reports'] });
    },
    onError: (caught) => setError(caught instanceof ApiError ? caught.message : 'Unable to delete report'),
  });

  return (
    <>
      {error ? (
        <div className="px-5 pt-4">
          <Callout tone="danger">{error}</Callout>
        </div>
      ) : null}
      <ul className="divide-y divide-slate-100">
        {reports.map((report) => (
          <li key={report.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-medium text-slate-900">{report.title}</h3>
                <StatusBadge status={report.status} />
              </div>
              {report.description ? (
                <p className="mt-1 text-sm text-slate-600">{report.description}</p>
              ) : null}
              <p className="mt-1 text-xs text-slate-400">
                {titleCase(report.type)} · {titleCase(report.format)} ·{' '}
                {report.generatedBy
                  ? `by ${report.generatedBy.firstName} ${report.generatedBy.lastName}`
                  : 'system'}{' '}
                · {formatDateTime(report.createdAt)}
              </p>
              {report.errorMessage ? (
                <p className="mt-1 text-xs text-rose-600">{report.errorMessage}</p>
              ) : null}
            </div>
            {canDelete ? (
              <Button variant="ghost" onClick={() => remove.mutate(report.id)}>
                <Icons.trash className="h-4 w-4" />
                Delete
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  );
}

function Generator({
  onGenerated,
  catalogue,
}: {
  onGenerated: (result: Awaited<ReturnType<typeof reportsApi.generate>>) => void;
  catalogue: Record<string, string>;
}) {
  const [type, setType] = useState('');
  const [format, setFormat] = useState('JSON');
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  const generate = useMutation({
    mutationFn: () =>
      reportsApi.generate({
        type,
        format,
        ...(title.trim() ? { title: title.trim() } : {}),
      }),
    onSuccess: (result) => {
      setError(null);
      onGenerated(result);
    },
    onError: (caught) => setError(caught instanceof ApiError ? caught.message : 'Unable to generate report'),
  });

  const options = Object.entries(catalogue);

  return (
    <Card className="mb-4">
      <CardHeader title="Generate a report" description="Built from live data in your scope." />
      <form
        className="flex flex-wrap items-end gap-3 px-5 pb-5"
        onSubmit={(event) => {
          event.preventDefault();
          generate.mutate();
        }}
      >
        <div className="min-w-[14rem] flex-1">
          <Field label="Report type" htmlFor="report-type">
            <Select
              id="report-type"
              value={type}
              onChange={(event) => setType(event.target.value)}
              required
            >
              <option value="">Select a report…</option>
              {options.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="w-32">
          <Field label="Format" htmlFor="report-format">
            <Select
              id="report-format"
              value={format}
              onChange={(event) => setFormat(event.target.value)}
            >
              <option value="JSON">JSON</option>
              <option value="CSV">CSV</option>
            </Select>
          </Field>
        </div>

        <div className="min-w-[12rem] flex-1">
          <Field label="Title" htmlFor="report-title" hint="Optional">
            <Input
              id="report-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Quarterly review"
            />
          </Field>
        </div>

        <Button type="submit" disabled={generate.isPending || !type}>
          {generate.isPending ? 'Generating…' : 'Generate'}
        </Button>
      </form>

      {error ? (
        <div className="px-5 pb-5">
          <Callout tone="danger">{error}</Callout>
        </div>
      ) : null}
    </Card>
  );
}
