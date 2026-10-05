import type { UserRole } from '@/types';

export const ROLE_LABELS: Record<UserRole, string> = {
  EMPLOYEE: 'Employee',
  MANAGER: 'Manager',
  HR: 'HR',
  ADMIN: 'Admin',
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  EMPLOYEE: 'Own profile, surveys, check-ins, feedback and AI chat',
  MANAGER: 'Everything an employee can do, plus their team view',
  HR: 'Organisation-wide analytics, feedback inbox and reports',
  ADMIN: 'Full access including user and privacy administration',
};

/** Tailwind classes per role, used for the role badge in the sidebar and header. */
export const ROLE_BADGE_CLASSES: Record<UserRole, string> = {
  EMPLOYEE: 'bg-slate-100 text-slate-700 ring-slate-200',
  MANAGER: 'bg-brand-50 text-brand-700 ring-brand-200',
  HR: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  ADMIN: 'bg-violet-50 text-violet-700 ring-violet-200',
};

export const RISK_LEVEL_CLASSES: Record<string, string> = {
  LOW: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  MODERATE: 'bg-amber-50 text-amber-700 ring-amber-200',
  HIGH: 'bg-orange-50 text-orange-700 ring-orange-200',
  CRITICAL: 'bg-rose-50 text-rose-700 ring-rose-200',
};

export const SEVERITY_CLASSES: Record<string, string> = {
  INFO: 'bg-slate-100 text-slate-700 ring-slate-200',
  LOW: 'bg-sky-50 text-sky-700 ring-sky-200',
  MEDIUM: 'bg-amber-50 text-amber-700 ring-amber-200',
  HIGH: 'bg-orange-50 text-orange-700 ring-orange-200',
  CRITICAL: 'bg-rose-50 text-rose-700 ring-rose-200',
};

export const STATUS_CLASSES: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-700 ring-slate-200',
  SCHEDULED: 'bg-sky-50 text-sky-700 ring-sky-200',
  OPEN: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  CLOSED: 'bg-slate-100 text-slate-600 ring-slate-200',
  ARCHIVED: 'bg-slate-100 text-slate-500 ring-slate-200',
  SUBMITTED: 'bg-sky-50 text-sky-700 ring-sky-200',
  IN_REVIEW: 'bg-amber-50 text-amber-700 ring-amber-200',
  ACKNOWLEDGED: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  ACTIONED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  REJECTED: 'bg-rose-50 text-rose-700 ring-rose-200',
  DONE: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  IN_PROGRESS: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  BLOCKED: 'bg-rose-50 text-rose-700 ring-rose-200',
  CANCELLED: 'bg-slate-100 text-slate-500 ring-slate-200',
  RESOLVED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  DISMISSED: 'bg-slate-100 text-slate-500 ring-slate-200',
  PENDING: 'bg-slate-100 text-slate-700 ring-slate-200',
  RUNNING: 'bg-sky-50 text-sky-700 ring-sky-200',
  COMPLETED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  FAILED: 'bg-rose-50 text-rose-700 ring-rose-200',
};

export function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/[\s_]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatRelative(value: string | null | undefined): string {
  if (!value) return '—';
  const diffMs = Date.now() - new Date(value).getTime();
  const diffMinutes = Math.round(diffMs / 60_000);

  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;

  return formatDate(value);
}
