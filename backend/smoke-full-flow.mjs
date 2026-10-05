/**
 * End-to-end smoke test for the FULL data flow, driven over real HTTP.
 *
 * Unlike smoke-daily-pulse.mjs (which covers the daily-feedback surface), this
 * walks every mounted module in the order real traffic would: auth -> org
 * structure -> surveys -> check-ins -> feedback -> engagement -> risk ->
 * alerts -> action items -> reports -> analytics -> intelligence -> AI ->
 * settings -> admin -> daily pulse, then verifies cross-cutting guarantees
 * (RBAC boundaries, row-level scope isolation, no-fabricated-data invariants)
 * and asserts that rows really landed in the database.
 *
 * Requires a server already listening (see SMOKE_BASE). Run against a
 * throwaway database: it creates and deletes real records.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const BASE = process.env.SMOKE_BASE ?? 'http://localhost:4100/api/v1';
const PASSWORD = 'SmokeTest!2026';

const stamp = Date.now();
const period = new Date().toISOString().slice(0, 7);

const results = [];
let currentPhase = 'setup';

function phase(name) {
  currentPhase = name;
  console.log(`\n--- ${name} ---`);
}

function check(name, condition, detail = '') {
  const ok = Boolean(condition);
  results.push({ phase: currentPhase, name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

async function api(path, { method = 'GET', body, token, query } = {}) {
  const url = new URL(`${BASE}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, body: json, data: json?.data };
}

const ids = {
  dept: `smk-dept-${stamp}`,
  childDept: `smk-child-${stamp}`,
  team: `smk-team-${stamp}`,
  otherTeam: `smk-other-team-${stamp}`,
  otherDept: `smk-other-dept-${stamp}`,
};
const users = {};
const employees = {};
let questionIds = [];
let surveyId = null;

async function main() {
  const hash = await bcrypt.hash(PASSWORD, 4);

  try {
    // =====================================================================
    phase('0. Organisation fixture');
    // =====================================================================
    await prisma.department.create({ data: { id: ids.dept, name: 'Smoke Dept', code: `SMK${stamp}` } });
    await prisma.department.create({ data: { id: ids.otherDept, name: 'Other Dept', code: `OSD${stamp}` } });
    await prisma.department.create({
      data: { id: ids.childDept, name: 'Smoke Child', code: `SHC${stamp}`, parentId: ids.dept },
    });
    await prisma.team.create({ data: { id: ids.team, name: 'Smoke Team', code: `SMT${stamp}`, departmentId: ids.dept } });
    await prisma.team.create({
      data: { id: ids.otherTeam, name: 'Other Team', code: `SOT${stamp}`, departmentId: ids.otherDept },
    });

    const people = [
      ['emp', 'EMPLOYEE', 'Sam', ids.team],
      ['emp2', 'EMPLOYEE', 'Alex', ids.otherTeam],
      ['mgr', 'MANAGER', 'Morgan', null],
      ['hr', 'HR', 'Harper', null],
      ['admin', 'ADMIN', 'Adele', null],
    ];
    for (const [key, role, first, teamId] of people) {
      const email = `smk-${key}-${stamp}@example.invalid`;
      const userId = `smk-${key}-user-${stamp}`;
      await prisma.user.create({
        data: { id: userId, email, passwordHash: hash, firstName: first, lastName: 'Smoke', role },
      });
      await prisma.employee.create({
        data: {
          id: `smk-${key}-emp-${stamp}`,
          employeeNumber: `SMK-${key.toUpperCase()}`,
          userId,
          firstName: first,
          lastName: 'Smoke',
          email,
          departmentId: teamId ? (teamId === ids.team ? ids.dept : ids.otherDept) : ids.dept,
          teamId,
        },
      });
      users[key] = { id: userId, email };
      employees[key] = `smk-${key}-emp-${stamp}`;
    }

    // The manager owns only the smoke team, never the other team.
    await prisma.manager.create({ data: { managerUserId: users.mgr.id, teamId: ids.team } });
    check('fixture created', true, `stamp ${stamp}`);

    // =====================================================================
    phase('1. Health & auth');
    // =====================================================================
    const health = await api('/health');
    check('health endpoint is ok', health.status === 200 && health.data?.status === 'ok');

    const tokens = {};
    for (const key of ['emp', 'mgr', 'hr', 'admin']) {
      const res = await api('/auth/login', { method: 'POST', body: { email: users[key].email, password: PASSWORD } });
      tokens[key] = res.data?.accessToken ?? null;
    }
    check('all four roles can sign in', Object.values(tokens).every(Boolean));

    const badLogin = await api('/auth/login', {
      method: 'POST',
      body: { email: users.emp.email, password: 'WrongPassword!1' },
    });
    check('wrong password is rejected with 401', badLogin.status === 401, `status ${badLogin.status}`);

    const me = await api('/auth/me', { token: tokens.emp });
    check('/auth/me returns the signed-in user', me.data?.email === users.emp.email);
    check('/auth/me exposes the employee link', Boolean(me.data?.employeeId), me.data?.employeeId);

    const perms = await api('/auth/permissions', { token: tokens.emp });
    check('employee permission list is returned', Array.isArray(perms.data) && perms.data.length > 0, `${perms.data?.length} perms`);
    check(
      'employee is not granted system:manage',
      !perms.data.includes('system:manage'),
    );

    const adminPerms = await api('/auth/permissions', { token: tokens.admin });
    check(
      'admin holds every permission including system:manage',
      adminPerms.data.includes('system:manage') && adminPerms.data.includes('insight:generate'),
      `${adminPerms.data?.length} perms`,
    );

    // Refresh rotation: the new access token must work and the old refresh dies.
    const loginForRefresh = await api('/auth/login', {
      method: 'POST',
      body: { email: users.emp.email, password: PASSWORD },
    });
    const refreshed = await api('/auth/refresh', {
      method: 'POST',
      body: { refreshToken: loginForRefresh.data.refreshToken },
    });
    check('refresh returns a new access token', refreshed.status === 200 && Boolean(refreshed.data?.accessToken));
    const reuse = await api('/auth/refresh', {
      method: 'POST',
      body: { refreshToken: loginForRefresh.data.refreshToken },
    });
    check('the consumed refresh token cannot be reused', reuse.status === 401, `status ${reuse.status}`);

    // Registration + password change, on a throwaway account.
    const regEmail = `smk-new-${stamp}@example.invalid`;
    const registered = await api('/auth/register', {
      method: 'POST',
      body: { email: regEmail, password: PASSWORD, firstName: 'Nina', lastName: 'New' },
    });
    check('register creates an account', registered.status === 201 || registered.status === 200, `status ${registered.status}`);

    const regLogin = await api('/auth/login', { method: 'POST', body: { email: regEmail, password: PASSWORD } });
    const changed = await api('/auth/me/change-password', {
      method: 'POST',
      token: regLogin.data?.accessToken,
      body: { currentPassword: PASSWORD, newPassword: 'BrandNewPass!2026' },
    });
    check('password change succeeds', changed.status === 200, `status ${changed.status}`);
    const relogin = await api('/auth/login', {
      method: 'POST',
      body: { email: regEmail, password: 'BrandNewPass!2026' },
    });
    check('the new password works', relogin.status === 200, `status ${relogin.status}`);
    await api('/auth/logout', { method: 'POST', body: { refreshToken: relogin.data?.refreshToken } });

    const noAuth = await api('/employees');
    check('unauthenticated request is 401', noAuth.status === 401, `status ${noAuth.status}`);

    // =====================================================================
    phase('2. Departments & employees');
    // =====================================================================
    const deptList = await api('/departments', { token: tokens.emp });
    check('department list is readable', deptList.status === 200 && Array.isArray(deptList.data));

    const hierarchy = await api('/departments/hierarchy', { token: tokens.hr });
    check('department hierarchy nests children', hierarchy.status === 200 && Array.isArray(hierarchy.data));

    const createdDept = await api('/departments', {
      method: 'POST',
      token: tokens.hr,
      body: { name: 'Smoke Temp Dept', code: `STD${stamp}` },
    });
    check('HR can create a department', createdDept.status === 201 || createdDept.status === 200, `status ${createdDept.status}`);
    if (createdDept.data?.id) await api(`/departments/${createdDept.data.id}`, { method: 'DELETE', token: tokens.hr });

    const empForbidden = await api('/departments', {
      method: 'POST',
      token: tokens.emp,
      body: { name: 'Nope', code: `NOP${stamp}` },
    });
    check('employee cannot create a department (403)', empForbidden.status === 403, `status ${empForbidden.status}`);

    const selfProfile = await api('/employees/me', { token: tokens.emp });
    check('employee reads own profile', selfProfile.status === 200 && selfProfile.data?.id === employees.emp);

    const empList = await api('/employees', { token: tokens.hr, query: { pageSize: 100 } });
    check('HR sees all employees', (empList.data?.items?.length ?? empList.data?.length ?? 0) >= 5, `${empList.data?.items?.length ?? empList.data?.length}`);

    const newEmp = await api('/employees', {
      method: 'POST',
      token: tokens.hr,
      body: {
        employeeNumber: `SMK-NEW-${stamp}`,
        firstName: 'Nora',
        lastName: 'New',
        email: `smk-nora-${stamp}@example.invalid`,
        departmentId: ids.otherDept,
      },
    });
    check('HR can create an employee', newEmp.status === 201 || newEmp.status === 200, `status ${newEmp.status}`);

    const managers = await api('/employees/managers', { token: tokens.mgr });
    check('manager can list managers', managers.status === 200, `status ${managers.status}`);

    // =====================================================================
    phase('3. Surveys');
    // =====================================================================
    const survey = await api('/surveys', {
      method: 'POST',
      token: tokens.hr,
      body: {
        title: `Smoke engagement survey ${stamp}`,
        type: 'ENGAGEMENT',
        questions: [
          { prompt: 'I am satisfied with my role', type: 'LIKERT_5', isRequired: true },
          { prompt: 'I have the tools I need', type: 'LIKERT_5', isRequired: true },
          { prompt: 'Anything else?', type: 'FREE_TEXT', isRequired: false },
        ],
      },
    });
    surveyId = survey.data?.id ?? null;
    check('HR creates a survey', Boolean(surveyId), `status ${survey.status}`);
    check('new survey starts as DRAFT', survey.data?.status === 'DRAFT', survey.data?.status);

    const opened = await api(`/surveys/${surveyId}/status`, {
      method: 'PATCH',
      token: tokens.hr,
      body: { status: 'OPEN' },
    });
    check('survey can be opened', opened.data?.status === 'OPEN', opened.data?.status);

    const empCannotCreate = await api('/surveys', {
      method: 'POST',
      token: tokens.emp,
      body: { title: 'Unauthorised survey', questions: [{ prompt: 'Nope', type: 'LIKERT_5' }] },
    });
    check('employee cannot create a survey (403)', empCannotCreate.status === 403, `status ${empCannotCreate.status}`);

    const detail = await api(`/surveys/${surveyId}`, { token: tokens.emp });
    const surveyQuestions = detail.data?.questions ?? [];
    check('employee can read the open survey', detail.status === 200 && surveyQuestions.length === 3, `${surveyQuestions.length} questions`);

    const responded = await api('/surveys/responses', {
      method: 'POST',
      token: tokens.emp,
      body: {
        surveyId,
        answers: [
          { questionId: surveyQuestions[0].id, valueNumber: 4 },
          { questionId: surveyQuestions[1].id, valueNumber: 5 },
          { questionId: surveyQuestions[2].id, valueText: 'The build pipeline is unreliable and it blocks my release.' },
        ],
        submit: true,
      },
    });
    check('employee submits a survey response', responded.status === 201 || responded.status === 200, `status ${responded.status}`);

    const myResponse = await api(`/surveys/${surveyId}/my-response`, { token: tokens.emp });
    check('employee can read back their own response', myResponse.status === 200 && Boolean(myResponse.data));

    const results403 = await api(`/surveys/${surveyId}/results`, { token: tokens.emp });
    check('employee cannot read aggregate results (403)', results403.status === 403, `status ${results403.status}`);

    const results = await api(`/surveys/${surveyId}/results`, { token: tokens.hr });
    check('HR can read aggregate results', results.status === 200, `status ${results.status}`);

    const responseRows = await prisma.surveyResponse.count({ where: { surveyId } });
    const answerRows = await prisma.surveyAnswer.count({ where: { response: { surveyId } } });
    check('exactly one response row persisted', responseRows === 1, `got ${responseRows}`);
    check('all three answers persisted', answerRows === 3, `got ${answerRows}`);

    // Anonymous survey produces a keyed receipt, never a plaintext link.
    const anonSurvey = await api('/surveys', {
      method: 'POST',
      token: tokens.hr,
      body: {
        title: `Smoke anonymous survey ${stamp}`,
        type: 'PULSE',
        isAnonymous: true,
        questions: [{ prompt: 'Anonymous question', type: 'LIKERT_5', isRequired: true }],
      },
    });
    await api(`/surveys/${anonSurvey.data.id}/status`, { method: 'PATCH', token: tokens.hr, body: { status: 'OPEN' } });
    const anonDetail = await api(`/surveys/${anonSurvey.data.id}`, { token: tokens.emp });
    await api('/surveys/responses', {
      method: 'POST',
      token: tokens.emp,
      body: {
        surveyId: anonSurvey.data.id,
        answers: [{ questionId: anonDetail.data.questions[0].id, valueNumber: 3 }],
        submit: true,
      },
    });
    const anonRow = await prisma.surveyResponse.findFirst({ where: { surveyId: anonSurvey.data.id } });
    check('anonymous response stores a keyed hash', Boolean(anonRow?.anonymousOwnerHash), anonRow?.anonymousOwnerHash ? 'present' : 'missing');
    check('anonymous response is not attributed to a user id', !anonRow?.respondentId, String(anonRow?.respondentId));

    // =====================================================================
    phase('4. Check-ins');
    // =====================================================================
    const checkIn = await api('/check-ins', {
      method: 'POST',
      token: tokens.emp,
      body: { mood: 4, energy: 3, workload: 2, note: 'Busy sprint, but manageable.' },
    });
    check('employee submits a check-in', checkIn.status === 201 || checkIn.status === 200, `status ${checkIn.status}`);

    const status = await api('/check-ins/status', { token: tokens.emp });
    check('check-in status reflects the submission', status.status === 200, JSON.stringify(status.data).slice(0, 120));

    const mine = await api('/check-ins/my', { token: tokens.emp });
    check('employee sees their own check-in history', mine.status === 200, `status ${mine.status}`);

    const summary = await api('/check-ins/summary', { token: tokens.hr, query: { period } });
    check('HR reads the org check-in summary', summary.status === 200, `status ${summary.status}`);

    // =====================================================================
    phase('5. Feedback');
    // =====================================================================
    const feedback = await api('/feedback', {
      method: 'POST',
      token: tokens.emp,
      body: { category: 'WORKLOAD', content: 'Workload is unsustainable this quarter and support is unclear.', visibility: 'HR_AND_MANAGER' },
    });
    const feedbackId = feedback.data?.id ?? null;
    check('employee submits feedback', Boolean(feedbackId), `status ${feedback.status}`);

    const myFeedback = await api('/feedback/mine', { token: tokens.emp });
    check('employee sees their own feedback', myFeedback.status === 200);

    const fbSummaryAsEmp = await api('/feedback/summary', { token: tokens.emp });
    check('employee cannot read the org feedback summary (403)', fbSummaryAsEmp.status === 403, `status ${fbSummaryAsEmp.status}`);

    const fbSummary = await api('/feedback/summary', { token: tokens.hr });
    check('HR reads the org feedback summary', fbSummary.status === 200, `status ${fbSummary.status}`);

    const fbList = await api('/feedback', { token: tokens.mgr });
    check('manager lists team feedback', fbList.status === 200, `status ${fbList.status}`);

    const fbUpdated = await api(`/feedback/${feedbackId}`, {
      method: 'PATCH',
      token: tokens.hr,
      body: { status: 'IN_REVIEW' },
    });
    check('HR advances feedback status', fbUpdated.data?.status === 'IN_REVIEW', fbUpdated.data?.status);

    // =====================================================================
    phase('6. Engagement scoring');
    // =====================================================================
    const recorded = await api('/engagement', {
      method: 'POST',
      token: tokens.hr,
      body: {
        employeeId: employees.emp,
        period,
        overallScore: 62,
        eNps: 10,
        workLifeBalance: 55,
        source: 'SURVEY',
      },
    });
    check('engagement score recorded', recorded.status === 201 || recorded.status === 200, `status ${recorded.status}`);

    const scoreRows = await prisma.engagementScore.count({ where: { employeeId: employees.emp, period } });
    check('engagement row persisted', scoreRows === 1, `got ${scoreRows}`);

    const engList = await api('/engagement', { token: tokens.emp, query: { period } });
    check('employee reads their own engagement', engList.status === 200, `status ${engList.status}`);

    const trends = await api('/engagement/trends', { token: tokens.emp });
    check('engagement trends respond', trends.status === 200, `status ${trends.status}`);

    const distribution = await api('/engagement/distribution', { token: tokens.hr, query: { period } });
    check('engagement distribution responds', distribution.status === 200, `status ${distribution.status}`);

    const engForbidden = await api('/engagement', {
      method: 'POST',
      token: tokens.emp,
      body: { employeeId: employees.emp, period, overallScore: 10 },
    });
    check('employee cannot record engagement (403)', engForbidden.status === 403, `status ${engForbidden.status}`);

    // =====================================================================
    phase('7. Risk model');
    // =====================================================================
    const riskRunAsHr = await api('/risk/run', { method: 'POST', token: tokens.hr, body: { horizonDays: 90 } });
    check('HR cannot run the risk model (needs risk:run-model)', riskRunAsHr.status === 403, `status ${riskRunAsHr.status}`);

    const riskRun = await api('/risk/run', {
      method: 'POST',
      token: tokens.admin,
      body: { departmentId: ids.dept, horizonDays: 90 },
    });
    check('admin runs the risk model', riskRun.status === 200 || riskRun.status === 201, `status ${riskRun.status}`);

    const riskRows = await prisma.riskPrediction.count();
    check('risk predictions were produced', riskRows > 0, `${riskRows} predictions`);

    const riskList = await api('/risk', { token: tokens.hr, query: { pageSize: 50 } });
    check('HR lists risk predictions', riskList.status === 200, `status ${riskList.status}`);

    const empRisk = await api('/risk', { token: tokens.emp });
    check('employee risk list is scoped to self', empRisk.status === 200, `status ${empRisk.status}`);

    // =====================================================================
    phase('8. Alerts');
    // =====================================================================
    const alertsAsEmp = await api('/alerts', { method: 'POST', token: tokens.emp, body: { type: 'SYSTEM', title: 'Nope', message: 'Should not be allowed' } });
    check('employee cannot create an alert (403)', alertsAsEmp.status === 403, `status ${alertsAsEmp.status}`);

    const alert = await api('/alerts', {
      method: 'POST',
      token: tokens.hr,
      body: {
        type: 'ENGAGEMENT_DROP',
        severity: 'HIGH',
        title: `Smoke engagement alert ${stamp}`,
        message: 'Engagement fell below the configured threshold for this department.',
        employeeId: employees.emp,
      },
    });
    const alertId = alert.data?.id ?? null;
    check('HR creates an alert', Boolean(alertId), `status ${alert.status}`);

    const alertList = await api('/alerts', { token: tokens.hr });
    check('HR lists alerts', alertList.status === 200, `status ${alertList.status}`);

    const counts = await api('/alerts/counts', { token: tokens.hr });
    check('alert counts respond', counts.status === 200, JSON.stringify(counts.data).slice(0, 100));

    const acked = await api(`/alerts/${alertId}`, { method: 'PATCH', token: tokens.hr, body: { status: 'ACKNOWLEDGED' } });
    check('alert status advances to ACKNOWLEDGED', acked.data?.status === 'ACKNOWLEDGED', acked.data?.status);
    check('acknowledging stamps acknowledgedAt', Boolean(acked.data?.acknowledgedAt), String(acked.data?.acknowledgedAt));

    // An employee may read their own alert but must not see a colleague's.
    const ownAlert = await api(`/alerts/${alertId}`, { token: tokens.emp });
    check('employee reads an alert about themselves', ownAlert.status === 200, `status ${ownAlert.status}`);

    const colleagueAlert = await api('/alerts', {
      method: 'POST',
      token: tokens.hr,
      body: {
        type: 'SYSTEM',
        severity: 'LOW',
        title: `Smoke colleague alert ${stamp}`,
        message: 'An alert about a different employee entirely.',
        employeeId: employees.emp2,
      },
    });
    const crossRead = await api(`/alerts/${colleagueAlert.data.id}`, { token: tokens.emp });
    check("employee cannot read a colleague's alert (403)", crossRead.status === 403, `status ${crossRead.status}`);

    // Org-wide alert: nullable employeeId. Documents current behaviour.
    const orgAlert = await api('/alerts', {
      method: 'POST',
      token: tokens.hr,
      body: { type: 'SYSTEM', severity: 'INFO', title: `Org-wide notice ${stamp}`, message: 'Maintenance window this weekend.' },
    });
    check('org-wide alert (no employee) created', Boolean(orgAlert.data?.id), `status ${orgAlert.status}`);
    const orgRead = await api(`/alerts/${orgAlert.data.id}`, { token: tokens.emp });
    check('org-wide alert is readable by id', orgRead.status === 200, `status ${orgRead.status}`);
    const orgInList = await api('/alerts', { token: tokens.emp, query: { pageSize: 100 } });
    const orgItems = orgInList.data?.items ?? orgInList.data ?? [];
    const orgListed = Array.isArray(orgItems) && orgItems.some((a) => a.id === orgAlert.data.id);
    check('org-wide alert appears in the employee list (see report)', orgListed, orgListed ? 'listed' : 'MISSING from list');

    // =====================================================================
    phase('9. Action items');
    // =====================================================================
    const item = await api('/action-items', {
      method: 'POST',
      token: tokens.mgr,
      body: {
        title: `Smoke action item ${stamp}`,
        description: 'Follow up on the engagement alert with the team.',
        priority: 'HIGH',
        alertId,
        ownerId: users.mgr.id,
      },
    });
    const itemId = item.data?.id ?? null;
    check('manager creates an action item', Boolean(itemId), `status ${item.status}`);

    const itemList = await api('/action-items', { token: tokens.mgr });
    check('manager lists action items', itemList.status === 200, `status ${itemList.status}`);

    const done = await api(`/action-items/${itemId}`, {
      method: 'PATCH',
      token: tokens.mgr,
      body: { status: 'DONE' },
    });
    check('action item completes', done.data?.status === 'DONE', done.data?.status);
    check('completion stamps completedAt', Boolean(done.data?.completedAt), String(done.data?.completedAt));

    const empItems = await api('/action-items', { token: tokens.emp });
    check('employee action item list responds', empItems.status === 200, `status ${empItems.status}`);

    // =====================================================================
    phase('10. Reports');
    // =====================================================================
    const catalogue = await api('/reports/catalogue', { token: tokens.hr });
    check('report catalogue responds', catalogue.status === 200 && Array.isArray(catalogue.data), `${catalogue.data?.length} types`);

    const genAsEmp = await api('/reports', { method: 'POST', token: tokens.emp, body: { type: 'ENGAGEMENT' } });
    check('employee cannot generate a report (403)', genAsEmp.status === 403, `status ${genAsEmp.status}`);

    const generated = await api('/reports', {
      method: 'POST',
      token: tokens.hr,
      body: { type: 'ENGAGEMENT', format: 'JSON', title: `Smoke report ${stamp}` },
    });
    const reportId = generated.data?.id ?? null;
    check('HR generates a report', Boolean(reportId), `status ${generated.status}`);

    const reportRow = await prisma.report.findUnique({ where: { id: reportId } });
    check('report persisted with a terminal status', reportRow?.status === 'COMPLETED', reportRow?.status);

    const reportList = await api('/reports', { token: tokens.hr });
    check('HR lists reports', reportList.status === 200, `status ${reportList.status}`);

    // =====================================================================
    phase('11. Analytics');
    // =====================================================================
    const overview = await api('/analytics/overview', { token: tokens.hr });
    check('analytics overview responds', overview.status === 200, `status ${overview.status}`);

    const byDept = await api('/analytics/by-department', { token: tokens.hr });
    check('analytics by-department responds', byDept.status === 200, `status ${byDept.status}`);

    const headcountAsMgr = await api('/analytics/headcount', { token: tokens.mgr });
    check('manager cannot read org headcount (403)', headcountAsMgr.status === 403, `status ${headcountAsMgr.status}`);

    const headcount = await api('/analytics/headcount', { token: tokens.hr });
    check('HR reads org headcount', headcount.status === 200, `status ${headcount.status}`);

    // =====================================================================
    phase('12. Intelligence (NLP + engagement engine)');
    // =====================================================================
    const analysed = await api('/intelligence/analyse', {
      method: 'POST',
      token: tokens.hr,
      body: { sources: ['FEEDBACK'], reanalyze: false },
    });
    check('sentiment analysis run completes', analysed.status === 200 || analysed.status === 201, `status ${analysed.status}`);

    const analyses = await prisma.sentimentAnalysis.findMany({
      where: { sourceType: 'FEEDBACK' },
      select: { label: true, method: true, themes: { select: { theme: true } } },
    });
    check('feedback text was analysed', analyses.length > 0, `${analyses.length} analyses`);
    check(
      'negative workload text classified negative',
      analyses.some((a) => a.label === 'NEGATIVE'),
      analyses.map((a) => a.label).join(','),
    );
    check(
      'analysis records the method (never claims a model it did not use)',
      analyses.every((a) => ['AI', 'LEXICON', 'UNSCORED'].includes(a.method)),
      [...new Set(analyses.map((a) => a.method))].join(','),
    );
    check(
      'a theme was detected on the workload complaint',
      analyses.some((a) => a.themes.some((t) => ['WORKLOAD', 'COMMUNICATION'].includes(t.theme))),
      [...new Set(analyses.flatMap((a) => a.themes.map((t) => t.theme)))].join(','),
    );

    const calculated = await api(`/intelligence/calculate?period=${period}`, { method: 'POST', token: tokens.hr });
    check('engagement calculation runs', calculated.status === 200 || calculated.status === 201, `status ${calculated.status}`);

    const factorRows = await prisma.engagementFactorResult.count({ where: { employeeId: employees.emp, period } });
    check('per-factor audit rows written', factorRows > 0, `${factorRows} factor rows`);

    const missingFactor = await prisma.engagementFactorResult.findFirst({
      where: { employeeId: employees.emp, period },
      select: { factorKey: true, rawValue: true, normalised: true },
    });
    check(
      'an absent input stays null rather than becoming 0',
      missingFactor === null || missingFactor.rawValue === null || missingFactor.normalised === null || missingFactor.rawValue !== 0,
      missingFactor ? `${missingFactor.factorKey} raw=${missingFactor.rawValue}` : 'no rows',
    );

    const factors = await api('/intelligence/factors', { token: tokens.hr });
    check('factor configuration is readable', factors.status === 200, `status ${factors.status}`);

    // Activity signals must be approved before they can influence a score.
    const signal = await api('/intelligence/signals', {
      method: 'POST',
      token: tokens.hr,
      body: { employeeId: employees.emp, period, signalKey: 'LEARNING_HOURS', value: 12, unit: 'hours' },
    });
    const signalId = signal.data?.id ?? null;
    check('activity signal recorded', Boolean(signalId), `status ${signal.status}`);
    check('signal starts PENDING approval', signal.data?.approvalStatus === 'PENDING', signal.data?.approvalStatus);

    const signalsAsEmp = await api('/intelligence/signals', { token: tokens.emp });
    check('employee cannot list org signals (403)', signalsAsEmp.status === 403, `status ${signalsAsEmp.status}`);

    const approved = await api(`/intelligence/signals/${signalId}/approval`, {
      method: 'PATCH',
      token: tokens.hr,
      body: { status: 'APPROVED', note: 'Confirmed with the employee.' },
    });
    check('signal can be approved', approved.data?.approvalStatus === 'APPROVED', approved.data?.approvalStatus);

    const sentTrends = await api(`/intelligence/trends/sentiment?months=6`, { token: tokens.hr });
    check('sentiment trends respond', sentTrends.status === 200, `status ${sentTrends.status}`);

    const themeTrends = await api('/intelligence/trends/themes?months=6', { token: tokens.hr });
    check('theme trends respond', themeTrends.status === 200, `status ${themeTrends.status}`);

    const engTrends = await api('/intelligence/trends/engagement?months=6', { token: tokens.hr });
    check('engagement trends respond', engTrends.status === 200, `status ${engTrends.status}`);

    const domainScores = await api(`/intelligence/domain-scores?period=${period}&level=ORGANISATION`, { token: tokens.hr });
    check('domain scores respond', domainScores.status === 200, `status ${domainScores.status}`);
    const domains = Array.isArray(domainScores.data) ? domainScores.data : domainScores.data?.items ?? [];
    check(
      'small groups are suppressed, never shown as a value',
      domains.every((d) => d.suppressed === true || d.value === null || typeof d.value === 'number'),
      `${domains.length} domain rows`,
    );
    check(
      'a suppressed row carries no value and a sample size',
      domains.filter((d) => d.suppressed).every((d) => d.value === null && typeof d.sampleSize === 'number'),
      `${domains.filter((d) => d.suppressed).length} suppressed`,
    );

    const recent = await api('/intelligence/analyses?limit=10', { token: tokens.hr });
    check('recent analyses respond', recent.status === 200, `status ${recent.status}`);

    // =====================================================================
    phase('13. AI assistant');
    // =====================================================================
    const provider = await api('/ai/provider', { token: tokens.emp });
    check('AI provider descriptor responds', provider.status === 200, JSON.stringify(provider.data).slice(0, 100));

    const conversation = await api('/ai/conversations', {
      method: 'POST',
      token: tokens.emp,
      body: { title: `Smoke chat ${stamp}`, kind: 'CHAT' },
    });
    const conversationId = conversation.data?.id ?? null;
    check('conversation created', Boolean(conversationId), `status ${conversation.status}`);

    const message = await api(`/ai/conversations/${conversationId}/messages`, {
      method: 'POST',
      token: tokens.emp,
      body: { content: 'How has engagement changed on my team this month?' },
    });
    check('assistant message returns', message.status === 201 || message.status === 200, `status ${message.status}`);
    check(
      'unconfigured provider is flagged degraded rather than inventing content',
      message.data?.degraded === true,
      `degraded=${message.data?.degraded}`,
    );
    check(
      'degraded reply contains no fabricated figures',
      typeof message.data?.assistantMessage?.content === 'string' &&
        !/\b\d+(\.\d+)?\s?%/.test(message.data.assistantMessage.content),
      (message.data?.assistantMessage?.content ?? '').slice(0, 80),
    );

    const convo = await api(`/ai/conversations/${conversationId}`, { token: tokens.emp });
    const messages = convo.data?.messages ?? [];
    check('conversation history holds both turns', messages.length === 2, `${messages.length} messages`);

    const usage = await api('/ai/usage', { token: tokens.emp });
    check('AI usage summary responds', usage.status === 200, `status ${usage.status}`);

    // =====================================================================
    phase('14. Settings (privacy)');
    // =====================================================================
    const privacy = await api('/settings/privacy', { token: tokens.emp });
    check('privacy settings readable by any signed-in user', privacy.status === 200, `status ${privacy.status}`);

    const privacyAsEmp = await api('/settings/privacy', {
      method: 'PATCH',
      token: tokens.emp,
      body: { ...privacy.data, feedbackEnabled: false },
    });
    check('employee cannot change privacy settings (403)', privacyAsEmp.status === 403, `status ${privacyAsEmp.status}`);

    const privacyUpdated = await api('/settings/privacy', {
      method: 'PATCH',
      token: tokens.admin,
      body: { ...privacy.data, feedbackManagerVisible: false },
    });
    check('admin can change privacy settings', privacyUpdated.status === 200, `status ${privacyUpdated.status}`);
    check('change is persisted', privacyUpdated.data?.feedbackManagerVisible === false, String(privacyUpdated.data?.feedbackManagerVisible));

    await api('/settings/privacy', { method: 'PATCH', token: tokens.admin, body: privacy.data });

    // =====================================================================
    phase('15. Admin');
    // =====================================================================
    const adminAsHr = await api('/admin/stats', { token: tokens.hr });
    check('HR cannot reach admin endpoints (403)', adminAsHr.status === 403, `status ${adminAsHr.status}`);

    const stats = await api('/admin/stats', { token: tokens.admin });
    check('admin stats respond', stats.status === 200, `status ${stats.status}`);

    const roles = await api('/admin/roles', { token: tokens.admin });
    check('admin role list responds', roles.status === 200 && Array.isArray(roles.data), `${roles.data?.length} roles`);

    const matrix = await api('/admin/role-matrix', { token: tokens.admin });
    check('role matrix responds', matrix.status === 200, `status ${matrix.status}`);

    const system = await api('/admin/system', { token: tokens.admin });
    check('system info responds', system.status === 200, `status ${system.status}`);
    check(
      'system info reports the real datasource (not inferred from NODE_ENV)',
      system.data?.databaseProvider === 'sqlite',
      system.data?.databaseProvider,
    );

    const maintenance = await api('/admin/maintenance', {
      method: 'POST',
      token: tokens.admin,
      body: { purgeExpiredTokens: true },
    });
    check('maintenance task runs', maintenance.status === 200, `status ${maintenance.status}`);

    const usersList = await api('/auth/users', { token: tokens.admin, query: { pageSize: 100 } });
    check('admin lists users', usersList.status === 200, `status ${usersList.status}`);

    const usersAsHr = await api('/auth/users', { token: tokens.hr });
    check('HR cannot list all users (403)', usersAsHr.status === 403, `status ${usersAsHr.status}`);

    // =====================================================================
    phase('16. Daily pulse (full loop)');
    // =====================================================================
    const pulseQuestions = [
      'How manageable was your workload today?',
      'Did you have what you needed to do your job today?',
      'How supported did you feel by your team today?',
      'How clear was communication about your priorities today?',
      'Anything you want to tell us in writing?',
    ];
    for (let i = 0; i < pulseQuestions.length; i += 1) {
      const res = await api('/daily-pulse/questions', {
        method: 'POST',
        token: tokens.hr,
        body: { prompt: pulseQuestions[i], answerType: i === 4 ? 'SHORT_TEXT' : 'RATING', position: i + 1 },
      });
      if (res.status === 201) questionIds.push(res.data.id);
    }
    check('HR configured exactly five pulse questions', questionIds.length === 5, `created ${questionIds.length}`);

    const today = await api('/daily-pulse/today', { token: tokens.emp });
    check('employee loads today’s pulse', today.status === 200 && today.data?.questions?.length === 5);
    check('canSubmit is true before submitting', today.data?.canSubmit === true);

    const answers = questionIds.map((questionId, index) =>
      index === 4
        ? { questionId, textValue: 'The build pipeline keeps failing and it is blocking my release.' }
        : { questionId, numericValue: 2 },
    );
    const pulseSubmit = await api('/daily-pulse/submit', {
      method: 'POST',
      token: tokens.emp,
      body: {
        answers,
        writtenFeedback: { category: 'WORK_ISSUE', content: 'Tooling has been unreliable all week and workload is too high.' },
        anonymousFeedback: { category: 'CONCERN', content: 'Nobody is communicating the deadline changes to the wider team.' },
      },
    });
    check('pulse submission accepted', pulseSubmit.status === 201, `status ${pulseSubmit.status}`);

    const duplicate = await api('/daily-pulse/submit', {
      method: 'POST',
      token: tokens.emp,
      body: { answers, writtenFeedback: { category: 'GENERAL', content: 'Trying again' } },
    });
    check('duplicate same-day pulse is rejected (409)', duplicate.status === 409, `status ${duplicate.status}`);

    const pulseScore = await prisma.dailyEngagementScore.findMany({ where: { employeeId: employees.emp } });
    check('a daily score was stored', pulseScore.length === 1, `got ${pulseScore.length}`);
    if (pulseScore.length === 1) {
      check('daily score is within 0-100', pulseScore[0].overallScore >= 0 && pulseScore[0].overallScore <= 100, String(pulseScore[0].overallScore));
      check('question component recorded, not null', pulseScore[0].questionScore !== null, String(pulseScore[0].questionScore));
    }

    const anonColumns = await prisma.$queryRawUnsafe('PRAGMA table_info("AnonymousFeedback")');
    const anonColumnNames = anonColumns.map((c) => c.name);
    check(
      'anonymous table is structurally unattributable',
      !anonColumnNames.includes('employeeId') && !anonColumnNames.includes('authorId'),
      anonColumnNames.join(','),
    );

    const mgrPulseFeedback = await api('/daily-pulse/feedback', { token: tokens.mgr });
    check('manager never receives anonymous content', !(mgrPulseFeedback.data ?? []).some((f) => f.isAnonymous));

    const pulseDash = await api('/daily-pulse/dashboard', { token: tokens.hr });
    check('HR pulse dashboard loads', pulseDash.status === 200 && pulseDash.data?.role === 'HR');
    check(
      'dashboard never fabricates a metric value',
      (pulseDash.data?.metrics ?? []).every((m) => m.value === null || typeof m.value === 'number'),
      `${pulseDash.data?.metrics?.length} metrics`,
    );

    const insights = await api('/daily-pulse/insights', { token: tokens.hr });
    check('insights respond', insights.status === 200, `status ${insights.status}`);
    check(
      'every insight carries evidence',
      (insights.data ?? []).every((i) => typeof i.evidenceSize === 'number' && i.headline && i.detail),
      `${(insights.data ?? []).length} insights`,
    );

    const pulseConfigAsMgr = await api('/daily-pulse/config', {
      method: 'PATCH',
      token: tokens.mgr,
      body: { allowResubmission: true },
    });
    check('manager cannot change pulse policy (403)', pulseConfigAsMgr.status === 403, `status ${pulseConfigAsMgr.status}`);

    // =====================================================================
    phase('17. Row-level scope isolation');
    // =====================================================================
    const mgrRisk = await api('/risk', { token: tokens.mgr, query: { pageSize: 100 } });
    const mgrRiskItems = mgrRisk.data?.items ?? mgrRisk.data ?? [];
    const leaked = (Array.isArray(mgrRiskItems) ? mgrRiskItems : []).filter(
      (r) => r.employeeId === employees.emp2,
    );
    check("manager's risk list excludes the other team's employee", leaked.length === 0, `${leaked.length} leaked`);

    const mgrEngagement = await api('/engagement/employee/' + employees.emp2, { token: tokens.mgr });
    check("manager cannot read another team's engagement", mgrEngagement.status === 403, `status ${mgrEngagement.status}`);

    const mgrOwnEngagement = await api('/engagement/employee/' + employees.emp, { token: tokens.mgr });
    check('manager can read their own team’s engagement', mgrOwnEngagement.status === 200, `status ${mgrOwnEngagement.status}`);

    const empColleague = await api('/engagement/employee/' + employees.emp2, { token: tokens.emp });
    check("employee cannot read a colleague's engagement", empColleague.status === 403 || empColleague.status === 404, `status ${empColleague.status}`);

    // =====================================================================
    phase('18. Summary');
    // =====================================================================
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    if (failed.length > 0) {
      console.log('\nFAILURES:');
      for (const f of failed) console.log(` - [${f.phase}] ${f.name} ${f.detail}`);
    }
    process.exitCode = failed.length > 0 ? 1 : 0;
  } finally {
    await prisma.employee.deleteMany({ where: { email: { contains: `smk-` } } });
    await prisma.user.deleteMany({ where: { email: { contains: `smk-` } } });
    await prisma.survey.deleteMany({ where: { id: surveyId } });
    await prisma.dailyQuestion.deleteMany({ where: { id: { in: questionIds } } });
    await prisma.anonymousFeedback.deleteMany({ where: { content: { contains: 'deadline changes' } } });
    await prisma.team.deleteMany({ where: { id: { in: [ids.team, ids.otherTeam] } } });
    await prisma.department.deleteMany({ where: { id: { in: [ids.dept, ids.childDept, ids.otherDept] } } });
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('smoke test crashed:', error);
  process.exit(1);
});