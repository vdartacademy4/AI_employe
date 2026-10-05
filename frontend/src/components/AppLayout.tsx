import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { Icons } from '@/components/icons';
import { Badge } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { ROLE_BADGE_CLASSES, ROLE_LABELS } from '@/lib/format';

interface NavItem {
  to: string;
  label: string;
  icon: (props: { className?: string }) => JSX.Element;
}

/**
 * The product's navigation, in the order it is meant to be read.
 *
 * Items are listed unconditionally. Permissions still decide what each endpoint
 * returns, and a page the caller may not read renders its 403 as an error state
 * - hiding the link too would only make the platform harder to navigate while
 * making it no safer.
 */
const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: Icons.dashboard },
  { to: '/daily-feedback', label: 'Daily Feedback', icon: Icons.feedback },
  { to: '/intelligence', label: 'AI Intelligence', icon: Icons.analytics },
  { to: '/analytics', label: 'Analytics', icon: Icons.analytics },
  { to: '/risk', label: 'Risk Prediction', icon: Icons.risk },
  { to: '/employees', label: 'Employees', icon: Icons.users },
  { to: '/chat', label: 'AI Chat', icon: Icons.chat },
  { to: '/surveys', label: 'Surveys', icon: Icons.survey },
  { to: '/feedback', label: 'Feedback', icon: Icons.feedback },
  { to: '/pulse/feedback', label: 'Pulse Feedback', icon: Icons.feedback },
  { to: '/pulse/settings', label: 'Pulse Settings', icon: Icons.settings },
  { to: '/reports', label: 'Reports', icon: Icons.report },
  { to: '/settings', label: 'Settings', icon: Icons.settings },
];

function NavSection({
  title,
  items,
  onNavigate,
}: {
  title: string;
  items: NavItem[];
  onNavigate: () => void;
}) {
  const visible = items;
  if (visible.length === 0) return null;

  return (
    <div className="px-3 py-2">
      <p className="px-3 pb-2 text-[0.6875rem] font-semibold uppercase tracking-wider text-slate-400">
        {title}
      </p>
      <ul className="space-y-0.5">
        {visible.map((item) => {
          const IconComponent = item.icon;
          return (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === '/'}
                onClick={onNavigate}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`
                }
              >
                <IconComponent className="h-[1.125rem] w-[1.125rem] shrink-0" />
                {item.label}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  // Navigating on a phone should dismiss the drawer.
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-slate-200 px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
          AI
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">Employee Intelligence</p>
          <p className="truncate text-xs text-slate-500">Workforce analytics</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto scrollbar-slim py-3">
        <NavSection title="Workspace" items={NAV_ITEMS} onNavigate={() => setMobileOpen(false)} />
      </nav>

      <div className="shrink-0 border-t border-slate-200 p-3">
        {user ? (
          <div className="flex items-center gap-3 rounded-lg px-3 py-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-600">
              {user.firstName?.[0]?.toUpperCase() ?? ''}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900">
                {user.firstName} {user.lastName}
              </p>
              <Badge className={`mt-0.5 ${ROLE_BADGE_CLASSES[user.role]}`}>{ROLE_LABELS[user.role]}</Badge>
            </div>
            <button
              type="button"
              onClick={() => void logout()}
              className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              aria-label="Sign out"
              title="Sign out"
            >
              <Icons.logout className="h-4 w-4" />
            </button>
          </div>
        ) : (
          /*
           * No session yet. The app is not gated, so this is a quiet status line
           * rather than a blocking screen, and it says plainly why the data
           * panels are empty instead of leaving them unexplained.
           */
          <div className="px-3 py-2">
            <p className="text-sm font-medium text-slate-700">Not signed in</p>
            <p className="mt-0.5 text-xs text-slate-500">
              Pages load once an account is selected.
            </p>
            <Link
              to="/login"
              onClick={() => setMobileOpen(false)}
              className="btn-secondary mt-2 w-full"
            >
              Choose account
            </Link>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-full">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white lg:block">{sidebar}</aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85%] bg-white shadow-xl">
            {sidebar}
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 lg:hidden">
          <button
            type="button"
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Icons.menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-xs font-bold text-white">
              AI
            </div>
            <span className="text-sm font-semibold text-slate-900">Employee Intelligence</span>
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-y-auto scrollbar-slim">
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
