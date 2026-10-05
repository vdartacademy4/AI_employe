import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { titleCase } from '@/lib/format';

// ---------------------------------------------------------------------------
// Layout primitives
// ---------------------------------------------------------------------------

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-slate-600">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`card ${className ?? ''}`} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="card-header">
      <div>
        <h2 className="card-title">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-slate-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Feedback states
// ---------------------------------------------------------------------------

export function Badge({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <span className={`badge ${className ?? 'bg-slate-100 text-slate-700 ring-slate-200'}`}>{children}</span>;
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      {icon ? <div className="text-slate-300">{icon}</div> : null}
      <div>
        <p className="text-sm font-medium text-slate-900">{title}</p>
        {description ? <p className="mt-1 max-w-md text-sm text-slate-500">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

/**
 * Distinguishes "no data yet" from "failed to load": a silent empty list would
 * hide a broken integration, which is the opposite of what an empty database
 * should look like.
 */
export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 px-6 py-12 text-sm text-slate-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
      {label}…
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div className="rounded-full bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700">Failed to load</div>
      <p className="text-sm font-medium text-slate-900">{title}</p>
      {message ? <p className="max-w-md text-sm text-slate-500">{message}</p> : null}
      {onRetry ? (
        <button type="button" className="btn-secondary" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function Callout({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'warning' | 'danger' | 'success';
  title?: string;
  children: ReactNode;
}) {
  const tones = {
    info: 'bg-sky-50 text-sky-900 ring-sky-200',
    warning: 'bg-amber-50 text-amber-900 ring-amber-200',
    danger: 'bg-rose-50 text-rose-900 ring-rose-200',
    success: 'bg-emerald-50 text-emerald-900 ring-emerald-200',
  } as const;

  return (
    <div className={`rounded-lg px-4 py-3 text-sm ring-1 ring-inset ${tones[tone]}`}>
      {title ? <p className="font-medium">{title}</p> : null}
      <div className={title ? 'mt-1' : ''}>{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form controls
// ---------------------------------------------------------------------------

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
};

export function Button({ variant = 'primary', className, type = 'button', ...rest }: ButtonProps) {
  const classes = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    ghost: 'btn-ghost',
    danger: 'btn-danger',
  } as const;

  return <button type={type} className={`${classes[variant]} ${className ?? ''}`} {...rest} />;
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`input ${className ?? ''}`} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`input ${className ?? ''}`} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`input ${className ?? ''}`} {...rest}>
      {children}
    </select>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-xs text-rose-600">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Data display
// ---------------------------------------------------------------------------

export function StatCard({
  label,
  value,
  hint,
  loading,
}: {
  label: string;
  value: number | string | null;
  hint?: string;
  loading?: boolean;
}) {
  return (
    <div className="card px-5 py-4">
      <p className="text-sm font-medium text-slate-600">{label}</p>
      {loading ? (
        <div className="mt-2 h-7 w-16 animate-pulse rounded bg-slate-200" />
      ) : (
        <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
          {value === null ? '—' : value}
        </p>
      )}
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge className={statusClassFor(status)}>{titleCase(status)}</Badge>;
}

function statusClassFor(status: string): string {
  const map: Record<string, string> = {
    OPEN: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    CLOSED: 'bg-slate-100 text-slate-600 ring-slate-200',
    DRAFT: 'bg-slate-100 text-slate-700 ring-slate-200',
    SUBMITTED: 'bg-sky-50 text-sky-700 ring-sky-200',
    ACKNOWLEDGED: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
    IN_REVIEW: 'bg-amber-50 text-amber-700 ring-amber-200',
    ACTIONED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    DONE: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    IN_PROGRESS: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
    RESOLVED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    FAILED: 'bg-rose-50 text-rose-700 ring-rose-200',
    COMPLETED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    RUNNING: 'bg-sky-50 text-sky-700 ring-sky-200',
  };
  return map[status] ?? 'bg-slate-100 text-slate-700 ring-slate-200';
}

export function BarChart({
  data,
  valueLabel = 'value',
  emptyMessage = 'No data recorded yet.',
}: {
  data: { label: string; value: number | null }[];
  valueLabel?: string;
  emptyMessage?: string;
}) {
  const hasData = data.some((entry) => (entry.value ?? 0) > 0);
  if (!hasData) {
    return <p className="px-5 py-8 text-center text-sm text-slate-500">{emptyMessage}</p>;
  }

  const max = Math.max(...data.map((entry) => entry.value ?? 0), 1);

  return (
    <div className="space-y-3 px-5 py-4">
      {data.map((entry) => (
        <div key={entry.label} className="grid grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-3">
          <span className="truncate text-sm text-slate-600" title={entry.label}>
            {entry.label}
          </span>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-brand-500 transition-[width]"
              style={{ width: `${((entry.value ?? 0) / max) * 100}%` }}
            />
          </div>
          <span className="w-12 text-right text-sm font-medium tabular-nums text-slate-700">
            {entry.value ?? 0}
          </span>
        </div>
      ))}
      <p className="pt-1 text-xs text-slate-400">{titleCase(valueLabel)}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Time-series charts
//
// Hand-rolled SVG rather than a charting dependency: the shapes needed here are
// a line and a 100% stacked bar, and both have to encode three distinct states
// per point - a real value, "no data", and "suppressed" - which a generic chart
// library would flatten into a single number.
// ---------------------------------------------------------------------------

export const SENTIMENT_SERIES_COLOURS = {
  positive: 'bg-emerald-500',
  neutral: 'bg-slate-300',
  negative: 'bg-rose-500',
} as const;

export const SENTIMENT_HEX = {
  POSITIVE: '#10b981',
  NEUTRAL: '#cbd5e1',
  NEGATIVE: '#f43f5e',
} as const;

/**
 * Renders a 100% stacked sentiment bar per period.
 *
 * Shares are only drawn when the period is neither empty nor suppressed; a
 * hatched placeholder marks a suppressed period so a reader can tell "nobody
 * spoke" apart from "too few people to report".
 */
export function StackedShareChart({
  data,
  emptyMessage = 'No analysed text in this period range.',
}: {
  data: {
    period: string;
    suppressed: boolean;
    sampleSize: number;
    positive: number | null;
    neutral: number | null;
    negative: number | null;
  }[];
  emptyMessage?: string;
}) {
  if (data.length === 0 || data.every((point) => point.sampleSize === 0)) {
    return <p className="px-5 py-8 text-center text-sm text-slate-500">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-3 px-5 py-4">
      {data.map((point) => {
        const showShares = !point.suppressed && point.sampleSize > 0;
        const parts = showShares
          ? [
              { key: 'positive', value: point.positive ?? 0, className: SENTIMENT_SERIES_COLOURS.positive },
              { key: 'neutral', value: point.neutral ?? 0, className: SENTIMENT_SERIES_COLOURS.neutral },
              { key: 'negative', value: point.negative ?? 0, className: SENTIMENT_SERIES_COLOURS.negative },
            ]
          : [];

        return (
          <div key={point.period} className="grid grid-cols-[4.5rem_1fr_3.5rem] items-center gap-3">
            <span className="text-sm tabular-nums text-slate-600">{point.period}</span>

            {showShares ? (
              <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
                {parts
                  .filter((part) => part.value > 0)
                  .map((part) => (
                    <div
                      key={part.key}
                      className={part.className}
                      style={{ width: `${part.value * 100}%` }}
                      title={`${part.key} ${Math.round(part.value * 100)}%`}
                    />
                  ))}
              </div>
            ) : (
              <SuppressedBar reason={point.sampleSize === 0 ? 'no data' : 'below threshold'} />
            )}

            <span className="text-right text-xs tabular-nums text-slate-500">n={point.sampleSize}</span>
          </div>
        );
      })}

      <div className="flex flex-wrap items-center gap-4 pt-1">
        <LegendKey className={SENTIMENT_SERIES_COLOURS.positive} label="Positive" />
        <LegendKey className={SENTIMENT_SERIES_COLOURS.neutral} label="Neutral" />
        <LegendKey className={SENTIMENT_SERIES_COLOURS.negative} label="Negative" />
      </div>
    </div>
  );
}

function SuppressedBar({ reason }: { reason: string }) {
  return (
    <div
      className="h-3 rounded-full border border-dashed border-slate-300 bg-slate-50"
      title={reason === 'no data' ? 'No analysed text in this period' : 'Hidden: group below the reporting threshold'}
    />
  );
}

function LegendKey({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-slate-500">
      <span className={`h-2 w-2 rounded-full ${className}`} />
      {label}
    </span>
  );
}

/**
 * A line chart for a 0-100 engagement trend.
 *
 * Points that are null are not interpolated across: the polyline breaks at each
 * gap, because joining the dots would draw a trend through a period that has no
 * score at all.
 */
export function TrendLineChart({
  data,
  height = 180,
  emptyMessage = 'No engagement score has been calculated yet.',
  suffix = '',
}: {
  data: { period: string; value: number | null; suppressed?: boolean; sampleSize: number }[];
  height?: number;
  emptyMessage?: string;
  suffix?: string;
}) {
  if (data.length === 0 || data.every((point) => point.value === null)) {
    return <p className="px-5 py-8 text-center text-sm text-slate-500">{emptyMessage}</p>;
  }

  const width = 720;
  const padding = { top: 12, right: 12, bottom: 26, left: 32 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const x = (index: number) =>
    padding.left + (data.length === 1 ? plotWidth / 2 : (index / (data.length - 1)) * plotWidth);
  const y = (value: number) => padding.top + plotHeight - (value / 100) * plotHeight;

  // Split into runs of consecutive plotted points so gaps stay gaps.
  const runs: { index: number; value: number }[][] = [];
  let run: { index: number; value: number }[] = [];
  data.forEach((point, index) => {
    if (point.value === null) {
      if (run.length > 0) runs.push(run);
      run = [];
      return;
    }
    run.push({ index, value: point.value });
  });
  if (run.length > 0) runs.push(run);

  return (
    <div className="px-5 py-4">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Engagement trend">
        {[0, 25, 50, 75, 100].map((tick) => (
          <g key={tick}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={y(tick)}
              y2={y(tick)}
              className="stroke-slate-100"
              strokeWidth={1}
            />
            <text x={padding.left - 8} y={y(tick) + 4} textAnchor="end" className="fill-slate-400 text-[10px]">
              {tick}
            </text>
          </g>
        ))}

        {runs.map((points, runIndex) =>
          points.length > 1 ? (
            <polyline
              key={`run-${runIndex}`}
              fill="none"
              className="stroke-brand-500"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              points={points.map((point) => `${x(point.index)},${y(point.value)}`).join(' ')}
            />
          ) : null,
        )}

        {runs.flat().map((point) => {
          const source = data[point.index];
          if (!source) return null;
          return (
            <circle key={`dot-${point.index}`} cx={x(point.index)} cy={y(point.value)} r={3.5} className="fill-brand-600">
              <title>
                {source.period}: {Math.round(point.value)}
                {suffix}
              </title>
            </circle>
          );
        })}

        {data.map((point, index) =>
          index % Math.ceil(data.length / 8) === 0 || index === data.length - 1 ? (
            <text
              key={`label-${point.period}`}
              x={x(index)}
              y={height - 8}
              textAnchor="middle"
              className="fill-slate-400 text-[10px]"
            >
              {point.period}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}

/**
 * A plain "not shown" panel. Used instead of a chart when every point in a
 * series is suppressed, so the page never implies a trend that was withheld.
 */
export function SuppressedPanel({
  message = 'Figures are hidden because this group is smaller than the reporting threshold.',
  hint,
}: {
  message?: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
      <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
        Suppressed
      </div>
      <p className="max-w-sm text-sm text-slate-600">{message}</p>
      {hint ? <p className="max-w-sm text-xs text-slate-400">{hint}</p> : null}
    </div>
  );
}
