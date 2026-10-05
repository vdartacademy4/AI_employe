import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  PageHeader,
  Select,
  StatCard,
} from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { departmentsApi, employeesApi } from '@/lib/api';
import { formatDate, titleCase } from '@/lib/format';

const STATUS_OPTIONS = ['ACTIVE', 'ON_LEAVE', 'ONBOARDING', 'TERMINATED'] as const;
const PAGE_SIZE = 25;

const STATUS_BADGES: Record<string, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  ON_LEAVE: 'bg-amber-50 text-amber-700 ring-amber-200',
  ONBOARDING: 'bg-sky-50 text-sky-700 ring-sky-200',
  TERMINATED: 'bg-slate-100 text-slate-500 ring-slate-200',
};

/**
 * Employee directory.
 *
 * Every row is a real `Employee` record: the list is empty until people are
 * added through the API or the admin console, and nothing here is filled in with
 * placeholder names. Department names are rendered from the stored relation, so
 * a row never shows a made-up team.
 */
export function EmployeesPage() {
  const { can } = useAuth();
  const canReadAll = can('analytics:read-all');

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [page, setPage] = useState(1);

  const listQuery = useQuery({
    queryKey: ['employees', 'list', { search, status, departmentId, page }],
    queryFn: () =>
      employeesApi.list({
        page,
        pageSize: PAGE_SIZE,
        ...(search ? { search } : {}),
        ...(status ? { status } : {}),
        ...(departmentId ? { departmentId } : {}),
      }),
  });

  const departmentsQuery = useQuery({
    queryKey: ['departments', 'list'],
    queryFn: departmentsApi.list,
  });

  const managersQuery = useQuery({
    queryKey: ['employees', 'managers'],
    queryFn: () => employeesApi.managers(),
    enabled: can('employee:read-team'),
  });

  const employees = listQuery.data?.data ?? [];
  const meta = listQuery.data?.meta;
  const total = meta?.total ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employees"
        description="The people directory, with the reporting lines recorded in the platform."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Employees in scope"
          value={listQuery.isLoading ? null : total}
          hint={canReadAll ? 'Whole organisation' : 'You and your team'}
          loading={listQuery.isLoading}
        />
        <StatCard
          label="Departments"
          value={departmentsQuery.isLoading ? null : (departmentsQuery.data?.length ?? null)}
          loading={departmentsQuery.isLoading}
        />
        <StatCard
          label="Reporting lines"
          value={managersQuery.isLoading ? null : (managersQuery.data?.length ?? null)}
          hint="Active manager assignments"
          loading={managersQuery.isLoading}
        />
        <StatCard
          label="Pages"
          value={meta ? meta.totalPages : null}
          hint={meta ? `Page ${meta.page} of ${meta.totalPages || 1}` : undefined}
          loading={listQuery.isLoading}
        />
      </div>

      <Card>
        <CardHeader title="Filters" description="Narrow the directory by status, department or name." />
        <div className="grid gap-4 px-5 py-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="emp-search">Search</label>
            <Input
              id="emp-search"
              placeholder="Name, email, number or job title"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </div>
          <div>
            <label className="label" htmlFor="emp-status">Status</label>
            <Select
              id="emp-status"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {titleCase(option)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="label" htmlFor="emp-department">Department</label>
            <Select
              id="emp-department"
              value={departmentId}
              onChange={(event) => {
                setDepartmentId(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All departments</option>
              {(departmentsQuery.data ?? []).map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Directory" description="People you are permitted to see." />
        {listQuery.isLoading ? (
          <LoadingState />
        ) : listQuery.isError ? (
          <ErrorState
            message={listQuery.error instanceof Error ? listQuery.error.message : undefined}
            onRetry={() => void listQuery.refetch()}
          />
        ) : employees.length === 0 ? (
          <EmptyState
            title={total === 0 ? 'No employees yet' : 'No matches'}
            description={
              total === 0
                ? 'The directory is empty. Employees appear here once they are added to the platform.'
                : 'No employee matches these filters. Try clearing the search or status.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead>
                <tr>
                  <th className="table-header">Employee</th>
                  <th className="table-header">Number</th>
                  <th className="table-header">Department</th>
                  <th className="table-header">Type</th>
                  <th className="table-header">Status</th>
                  <th className="table-header">Hired</th>
                  <th className="table-header">Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employees.map((employee) => (
                  <tr key={employee.id}>
                    <td className="table-cell">
                      <p className="font-medium text-slate-900">
                        {employee.firstName} {employee.lastName}
                      </p>
                      <p className="text-xs text-slate-500">{employee.email}</p>
                    </td>
                    <td className="table-cell tabular-nums text-slate-600">{employee.employeeNumber}</td>
                    <td className="table-cell text-slate-600">
                      {employee.department?.name ?? <span className="text-slate-400">Unassigned</span>}
                    </td>
                    <td className="table-cell text-slate-600">{titleCase(employee.employmentType)}</td>
                    <td className="table-cell">
                      <Badge className={STATUS_BADGES[employee.status] ?? 'bg-slate-100 text-slate-700 ring-slate-200'}>
                        {titleCase(employee.status)}
                      </Badge>
                    </td>
                    <td className="table-cell text-slate-600">
                      {employee.hireDate ? formatDate(employee.hireDate) : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="table-cell text-slate-600">
                      {employee.user ? (
                        <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
                          {titleCase(employee.user.role)}
                        </Badge>
                      ) : (
                        <span className="text-slate-400">No account</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {meta && meta.totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3">
            <p className="text-xs text-slate-500">
              Showing {(meta.page - 1) * meta.pageSize + 1}-{Math.min(meta.page * meta.pageSize, meta.total)} of {meta.total}
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={meta.page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                disabled={meta.page >= meta.totalPages}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      {managersQuery.data && managersQuery.data.length > 0 ? (
        <Card>
          <CardHeader title="Reporting lines" description="Active manager assignments recorded in the platform." />
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead>
                <tr>
                  <th className="table-header">Manager</th>
                  <th className="table-header">Scope</th>
                  <th className="table-header">Employee</th>
                  <th className="table-header">Department</th>
                  <th className="table-header">Since</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {managersQuery.data.map((assignment) => (
                  <tr key={assignment.id}>
                    <td className="table-cell text-slate-900">
                      {assignment.managerUser
                        ? `${assignment.managerUser.firstName} ${assignment.managerUser.lastName}`
                        : '—'}
                    </td>
                    <td className="table-cell text-slate-600">{titleCase(assignment.scope)}</td>
                    <td className="table-cell text-slate-600">
                      {assignment.employee
                        ? `${assignment.employee.firstName} ${assignment.employee.lastName}`
                        : 'Whole department'}
                    </td>
                    <td className="table-cell text-slate-600">{assignment.department?.name ?? '—'}</td>
                    <td className="table-cell text-slate-600">{formatDate(assignment.startedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
