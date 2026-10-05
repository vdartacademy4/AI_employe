/**
 * End-to-end smoke test for the daily feedback flow, driven over real HTTP.
 *
 * Creates a temporary organisation (employee, manager, HR), configures the five
 * questions, and exercises the actual endpoints in the order an employee would
 * use them. Everything it creates is removed at the end.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const BASE = 'http://localhost:4000/api/v1';
const PASSWORD = 'SmokeTest!2026';

const stamp = Date.now();
const deptCode = `SMK${stamp}`;
const results = [];

function check(name, condition, detail = '') {
  results.push({ name, ok: Boolean(condition), detail });
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${BASE}${path}`, {
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
  return { status: res.status, body: json };
}

async function main() {
  const ids = {
    dept: `smoke-dept-${stamp}`,
    team: `smoke-team-${stamp}`,
    empUser: `smoke-emp-user-${stamp}`,
    emp: `smoke-emp-${stamp}`,
    hrUser: `smoke-hr-user-${stamp}`,
    hrEmp: `smoke-hr-emp-${stamp}`,
    mgrUser: `smoke-mgr-user-${stamp}`,
    mgrEmp: `smoke-mgr-emp-${stamp}`,
  };
  const questionIds = [];

  const hash = await bcrypt.hash(PASSWORD, 4);

  try {
    // --- Set up a small organisation ------------------------------------
    await prisma.department.create({
      data: { id: ids.dept, name: 'Smoke Department', code: deptCode },
    });
    await prisma.team.create({
      data: { id: ids.team, name: 'Smoke Team', code: `SMKT${stamp}`, departmentId: ids.dept },
    });

    for (const [suffix, role, first] of [
      ['emp', 'EMPLOYEE', 'Sam'],
      ['hr', 'HR', 'Harper'],
      ['mgr', 'MANAGER', 'Morgan'],
    ]) {
      const email = `smoke-${suffix}-${stamp}@example.invalid`;
      await prisma.user.create({
        data: {
          id: ids[`${suffix}User`],
          email,
          passwordHash: hash,
          firstName: first,
          lastName: 'Smoke',
          role,
        },
      });
      await prisma.employee.create({
        data: {
          id: ids[`${suffix}Emp`],
          employeeNumber: `${deptCode}-${suffix}`,
          userId: ids[`${suffix}User`],
          firstName: first,
          lastName: 'Smoke',
          email,
          departmentId: ids.dept,
          teamId: suffix === 'mgr' ? null : ids.team,
        },
      });
    }

    // The manager is scoped to the employee's team only.
    await prisma.manager.create({ data: { managerUserId: ids.mgrUser, teamId: ids.team } });

    // --- Sign in as each role -------------------------------------------
    const login = async (email) => {
      const res = await api('/auth/login', { method: 'POST', body: { email, password: PASSWORD } });
      return res.body?.data?.accessToken ?? null;
    };

    const empToken = await login(`smoke-emp-${stamp}@example.invalid`);
    const hrToken = await login(`smoke-hr-${stamp}@example.invalid`);
    const mgrToken = await login(`smoke-mgr-${stamp}@example.invalid`);
    check('all three roles can sign in', Boolean(empToken && hrToken && mgrToken));

    // --- HR configures the five questions -------------------------------
    const questions = [
      'How manageable was your workload today?',
      'Did you have what you needed to do your job today?',
      'How supported did you feel by your team today?',
      'How clear was communication about your priorities today?',
      'Anything you want to tell us in writing?',
    ];
    for (let i = 0; i < questions.length; i += 1) {
      const res = await api('/daily-pulse/questions', {
        method: 'POST',
        token: hrToken,
        body: {
          prompt: questions[i],
          answerType: i === 4 ? 'SHORT_TEXT' : 'RATING',
          position: i + 1,
        },
      });
      if (res.status === 201) questionIds.push(res.body.data.id);
      else console.log('   create question failed:', JSON.stringify(res.body));
    }
    check('HR created exactly five questions', questionIds.length === 5, `created ${questionIds.length}`);

    const list = await api('/daily-pulse/questions', { token: hrToken });
    check('question list returns 5', list.body?.data?.length === 5, `got ${list.body?.data?.length}`);

    // --- Employee sees today's questions --------------------------------
    const today = await api('/daily-pulse/today', { token: empToken });
    check('employee can load today’s questions', today.status === 200 && today.body?.data?.questions?.length === 5);
    check('canSubmit is true before submitting', today.body?.data?.canSubmit === true);
    check('alreadySubmitted is false initially', today.body?.data?.alreadySubmitted === false);

    // --- Employee submits ----------------------------------------------
    const answers = questionIds.map((questionId, index) =>
      index === 4
        ? { questionId, textValue: 'The build pipeline keeps failing and it is blocking my release.' }
        : { questionId, numericValue: 2 },
    );

    const submit = await api('/daily-pulse/submit', {
      method: 'POST',
      token: empToken,
      body: {
        answers,
        writtenFeedback: {
          category: 'WORK_ISSUE',
          content: 'Tooling has been unreliable all week and workload is too high.',
        },
        anonymousFeedback: {
          category: 'CONCERN',
          content: 'Nobody is communicating the deadline changes to the wider team.',
        },
      },
    });
    check('submission accepted', submit.status === 201, `status ${submit.status}`);

    // --- Duplicate prevention -------------------------------------------
    const duplicate = await api('/daily-pulse/submit', {
      method: 'POST',
      token: empToken,
      body: { answers, writtenFeedback: { category: 'GENERAL', content: 'Trying again' } },
    });
    check(
      'duplicate same-day submission is rejected',
      duplicate.status === 409,
      `status ${duplicate.status}`,
    );

    // --- Storage verification ------------------------------------------
    const storedResponses = await prisma.dailyQuestionResponse.count({ where: { employeeId: ids.emp } });
    const storedAnswers = await prisma.dailyQuestionAnswer.count({ where: { employeeId: ids.emp } });
    const storedWritten = await prisma.employeeFeedback.count({ where: { employeeId: ids.emp } });
    const storedAnon = await prisma.anonymousFeedback.count({ where: { content: { contains: 'deadline changes' } } });
    const storedHistory = await prisma.feedbackHistory.count({ where: { employeeId: ids.emp } });

    check('exactly one daily response row', storedResponses === 1, `got ${storedResponses}`);
    check('exactly five stored answers', storedAnswers === 5, `got ${storedAnswers}`);
    check('written feedback stored', storedWritten === 1, `got ${storedWritten}`);
    check('anonymous feedback stored', storedAnon === 1, `got ${storedAnon}`);
    check('feedback history row written', storedHistory === 1, `got ${storedHistory}`);

    // --- Anonymity is structural ----------------------------------------
    const anonColumns = await prisma.$queryRawUnsafe('PRAGMA table_info("AnonymousFeedback")');
    const columnNames = anonColumns.map((c) => c.name);
    check(
      'anonymous table has no author column',
      !columnNames.includes('employeeId') && !columnNames.includes('authorId'),
      columnNames.join(','),
    );

    const analysis = await prisma.sentimentAnalysis.findMany({
      where: { sourceType: { in: ['DAILY_FEEDBACK', 'ANONYMOUS_FEEDBACK'] } },
      select: { sourceType: true, label: true, employeeId: true, themes: { select: { theme: true } } },
    });
    const dailyAnalysis = analysis.find((row) => row.sourceType === 'DAILY_FEEDBACK');
    const anonAnalysis = analysis.find((row) => row.sourceType === 'ANONYMOUS_FEEDBACK');
    check('written feedback was analysed', Boolean(dailyAnalysis), dailyAnalysis ? `label ${dailyAnalysis.label}` : 'none');
    check('anonymous feedback was analysed', Boolean(anonAnalysis));
    check('anonymous analysis has no employee id', anonAnalysis ? anonAnalysis.employeeId === null : false);
    check(
      'technical issue theme detected',
      (dailyAnalysis?.themes ?? []).some((t) => t.theme === 'TECHNICAL_ISSUES'),
      (dailyAnalysis?.themes ?? []).map((t) => t.theme).join(',') || 'none',
    );
    check(
      'communication theme detected on anonymous text',
      (anonAnalysis?.themes ?? []).some((t) => t.theme === 'COMMUNICATION'),
      (anonAnalysis?.themes ?? []).map((t) => t.theme).join(',') || 'none',
    );

    // --- Daily score ----------------------------------------------------
    const score = await prisma.dailyEngagementScore.findMany({ where: { employeeId: ids.emp } });
    check('a daily score was stored', score.length === 1, `got ${score.length}`);
    if (score.length === 1) {
      check('score is in range 0-100', score[0].overallScore >= 0 && score[0].overallScore <= 100, String(score[0].overallScore));
      check('question component is recorded', score[0].questionScore !== null, String(score[0].questionScore));
    }

    // --- Privacy: manager vs HR on anonymous feedback --------------------
    const mgrFeedback = await api('/daily-pulse/feedback', { token: mgrToken });
    const hrFeedback = await api('/daily-pulse/feedback', { token: hrToken });
    const mgrHasAnon = (mgrFeedback.body?.data ?? []).some((f) => f.isAnonymous);
    const mgrHasOwnTeam = (mgrFeedback.body?.data ?? []).some((f) => f.author?.name?.includes('Sam'));
    check('manager sees team attributed feedback', mgrHasOwnTeam);
    check('manager does NOT see anonymous content', !mgrHasAnon, `items ${mgrFeedback.body?.data?.length}`);
    // HR also withholds it here because the pool (1) is below the minimum.
    const hrHasAnon = (hrFeedback.body?.data ?? []).some((f) => f.isAnonymous);
    check('small anonymous pool is withheld from HR too', !hrHasAnon, `pool of 1`);

    // --- Dashboards per role --------------------------------------------
    const empDash = await api('/daily-pulse/dashboard', { token: empToken });
    const mgrDash = await api('/daily-pulse/dashboard', { token: mgrToken });
    const hrDash = await api('/daily-pulse/dashboard', { token: hrToken });
    check('employee dashboard loads', empDash.status === 200 && empDash.body?.data?.role === 'EMPLOYEE');
    check('manager dashboard loads', mgrDash.status === 200 && mgrDash.body?.data?.role === 'MANAGER');
    check('HR dashboard loads', hrDash.status === 200 && hrDash.body?.data?.role === 'HR');
    check(
      'employee dashboard is scoped to themselves',
      empDash.body?.data?.scopeLabel === 'Your responses',
      empDash.body?.data?.scopeLabel,
    );
    check(
      'manager dashboard is scoped to the team',
      String(mgrDash.body?.data?.scopeLabel).startsWith('Your team'),
      mgrDash.body?.data?.scopeLabel,
    );
    check('HR dashboard scope is organisation', hrDash.body?.data?.scopeLabel === 'Organisation');
    check(
      'no fake metrics: values are null or measured',
      empDash.body?.data?.metrics?.every((m) => m.value === null || typeof m.value === 'number'),
    );

    // --- Permission boundaries -------------------------------------------
    const empConfig = await api('/daily-pulse/questions', { token: empToken });
    check('employee cannot configure questions', empConfig.status === 403, `status ${empConfig.status}`);

    const mgrConfig = await api('/daily-pulse/config', { method: 'PATCH', token: mgrToken, body: { allowResubmission: true } });
    check('manager cannot change the resubmission policy', mgrConfig.status === 403, `status ${mgrConfig.status}`);

    const mgrDashScope = await api('/daily-pulse/dashboard', { token: mgrToken });
    const mgrSeesOthers = (mgrDashScope.body?.data?.scopeLabel ?? '').includes('Organisation');
    check('manager cannot get organisation scope', !mgrSeesOthers);

    // --- Resubmission policy --------------------------------------------
    const enable = await api('/daily-pulse/config', {
      method: 'PATCH',
      token: hrToken,
      body: { allowResubmission: true },
    });
    check('HR can enable resubmission', enable.status === 200);

    const retry = await api('/daily-pulse/submit', {
      method: 'POST',
      token: empToken,
      body: {
        answers: questionIds.map((questionId, index) =>
          index === 4 ? { questionId, textValue: 'Better today, pipeline is stable now.' } : { questionId, numericValue: 5 },
        ),
        writtenFeedback: { category: 'GENERAL', content: 'Resubmitting with a better day.' },
      },
    });
    check('resubmission accepted once enabled', retry.status === 201, `status ${retry.status}`);

    const answersAfter = await prisma.dailyQuestionAnswer.count({ where: { employeeId: ids.emp } });
    check('resubmission replaced rather than duplicated answers', answersAfter === 5, `got ${answersAfter}`);

    const myFeedback = await api('/daily-pulse/feedback/mine', { token: empToken });
    const anonEntries = myFeedback.body?.data?.anonymous ?? [];
    check('employee sees anonymous submission date only', anonEntries.length >= 1 && !('content' in (anonEntries[0] ?? {})));

    // --- No fabricated insights ------------------------------------------
    const insights = await api('/daily-pulse/insights', { token: hrToken });
    check('insights endpoint responds', insights.status === 200);
    check(
      'every insight carries evidence',
      (insights.body?.data ?? []).every((i) => typeof i.evidenceSize === 'number' && i.headline && i.detail),
      `${(insights.body?.data ?? []).length} insights`,
    );

    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    if (failed.length > 0) {
      console.log('FAILURES:');
      for (const f of failed) console.log(` - ${f.name} ${f.detail}`);
    }
    process.exitCode = failed.length > 0 ? 1 : 0;
  } finally {
    await prisma.employee.deleteMany({
      where: { id: { in: [ids.emp, ids.hrEmp, ids.mgrEmp] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [ids.empUser, ids.hrUser, ids.mgrUser] } },
    });
    await prisma.team.deleteMany({ where: { id: ids.team } });
    await prisma.department.deleteMany({ where: { id: ids.dept } });
    await prisma.dailyQuestion.deleteMany({ where: { id: { in: questionIds } } });
    await prisma.anonymousFeedback.deleteMany({ where: { content: { contains: 'deadline changes' } } });
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('smoke test crashed:', error);
  process.exit(1);
});
