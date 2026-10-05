import { Outlet, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { ChatPage } from '@/pages/ChatPage';
import { CheckInPage } from '@/pages/CheckInPage';
import { SurveysPage } from '@/pages/SurveysPage';
import { FeedbackPage } from '@/pages/FeedbackPage';
import { AnalyticsPage } from '@/pages/AnalyticsPage';
import { IntelligencePage } from '@/pages/IntelligencePage';
import { RiskPage } from '@/pages/RiskPage';
import { ReportsPage } from '@/pages/ReportsPage';
import { EmployeesPage } from '@/pages/EmployeesPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { DailyFeedbackPage } from '@/pages/DailyFeedbackPage';
import { DashboardsPage } from '@/pages/DashboardsPage';
import { PulseAdminPage } from '@/pages/PulseAdminPage';
import { PulseFeedbackPage } from '@/pages/PulseFeedbackPage';

/**
 * The application shell.
 *
 * The app opens straight on the Dashboard: there is no auth guard and no
 * redirect to a sign-in screen, so the first paint is the product rather than a
 * credential form.
 *
 * `/login` is still routed, and is reachable at any time, because it is the
 * account switcher rather than a gate. The API resolves every request against a
 * session, so it supplies the identity, role permissions and row-level scoping
 * that the rest of the app reads - deleting it would strip those guarantees
 * rather than simplify them.
 *
 * No route is permission-wrapped. Access is decided by the server, which returns
 * 403 for anything the caller may not see, and each page renders that as an
 * error state. Filtering routes client-side as well would only hide pages while
 * leaving the API exactly as strict.
 */
function AppShell() {
  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
}

function NotFound() {
  return (
    <div className="card mx-auto max-w-lg px-6 py-12 text-center">
      <p className="text-sm font-medium text-brand-600">404</p>
      <h2 className="mt-1 text-lg font-semibold text-slate-900">Page not found</h2>
      <p className="mt-2 text-sm text-slate-600">
        The page you are looking for does not exist or has moved.
      </p>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      {/* Account switching. Never navigated to automatically. */}
      <Route path="/login" element={<LoginPage />} />

      <Route element={<AppShell />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/employees" element={<EmployeesPage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/surveys" element={<SurveysPage />} />
        <Route path="/feedback" element={<FeedbackPage />} />
        <Route path="/check-ins" element={<CheckInPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/intelligence" element={<IntelligencePage />} />
        <Route path="/risk" element={<RiskPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        {/* Daily feedback module. The server decides the scope for each of
            these, so a manager viewing /dashboards sees only their team. */}
        <Route path="/daily-feedback" element={<DailyFeedbackPage />} />
        <Route path="/dashboards" element={<DashboardsPage />} />
        <Route path="/pulse/feedback" element={<PulseFeedbackPage />} />
        <Route path="/pulse/settings" element={<PulseAdminPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
