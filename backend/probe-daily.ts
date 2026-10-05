import { PrismaClient } from '@prisma/client';
import { dailyQuestionGenerator } from './src/modules/daily-pulse/daily-question.generator';
import { dailyPulseService } from './src/modules/daily-pulse/daily-pulse.service';
import { analysisPipeline } from './src/modules/intelligence/analysis.pipeline';
import { AuthenticatedUser } from './src/modules/auth/auth.types';

const prisma = new PrismaClient();

import { permissionsForRole } from './src/modules/auth/permissions';

const hrUser: AuthenticatedUser = {
  id: 'probe-user',
  role: 'HR',
  email: 'probe@example.invalid',
  permissions: permissionsForRole('HR_ADMIN'),
};

async function main() {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  console.log('--- provider configured? ---');
  const { getAiProvider } = await import('./src/modules/ai/providers/provider.factory');
  const provider = getAiProvider();
  console.log('id=', provider.id, 'isConfigured=', provider.isConfigured());

  console.log('\n--- set for today ---');
  const set = await dailyQuestionGenerator.setForDate(today);
  console.log('source=', set.source, 'model=', set.model, 'note=', set.note);
  console.log('questions=', set.questions.length);
  const byType: Record<string, number> = {};
  for (const q of set.questions) byType[q.answerType] = (byType[q.answerType] ?? 0) + 1;
  console.log('byType=', byType);
  console.log('topics=', set.questions.map((q) => q.topic));
  for (const q of set.questions) console.log(`  ${q.position}. [${q.answerType}] ${q.prompt}`);

  console.log('\n--- idempotent second call ---');
  const again = await dailyQuestionGenerator.setForDate(today);
  console.log('sameId=', again.id === set.id, 'sameQuestions=', JSON.stringify(again.questions.map(q=>q.id)) === JSON.stringify(set.questions.map(q=>q.id)));

  console.log('\n--- yesterday (new day) ---');
  const yesterday = new Date(today.getTime() - 86400000);
  const prev = await dailyQuestionGenerator.setForDate(yesterday);
  console.log('yesterday source=', prev.source, 'count=', prev.questions.length);
  console.log('overlap with today=', prev.questions.filter(p => set.questions.some(t => t.prompt === p.prompt)).length);
  for (const q of prev.questions) console.log(`  ${q.position}. [${q.answerType}] ${q.prompt}`);

  console.log('\n--- regeneration refused once answered ---');
  await prisma.employee.deleteMany({ where: { email: 'probe-emp@example.invalid' } });
  await prisma.user.deleteMany({ where: { email: 'probe-emp@example.invalid' } });
  await prisma.employee.create({
    data: {
      id: 'probe-emp',
      employeeNumber: 'PROBE-1',
      firstName: 'Probe',
      lastName: 'Employee',
      email: 'probe-emp@example.invalid',
    },
  });
  await prisma.user.create({
    data: {
      id: 'probe-emp-user',
      email: 'probe-emp@example.invalid',
      passwordHash: 'x',
      firstName: 'Probe',
      lastName: 'Employee',
      role: 'EMPLOYEE',
    },
  });
  await prisma.employee.update({ where: { id: 'probe-emp' }, data: { userId: 'probe-emp-user' } });

  const empUser: AuthenticatedUser = {
    id: 'probe-emp-user',
    role: 'EMPLOYEE',
    email: 'probe-emp@example.invalid',
    permissions: permissionsForRole('EMPLOYEE'),
  };

  const answers = set.questions.map((q) => {
    if (q.answerType === 'RATING') return { questionId: q.id, numericValue: 4 };
    if (q.answerType === 'YES_NO') return { questionId: q.id, numericValue: 1 };
    return { questionId: q.id, textValue: 'Sentiment probe: things are going reasonably well, thanks.' };
  });

  const submitted = await dailyPulseService.submit(empUser, {
    responseDate: today,
    answers,
    writtenFeedback: { category: 'GENERAL', content: 'Probe written feedback, nothing to report.' },
  } as never);
  console.log('submitted answerCount=', submitted.answerCount);

  try {
    await dailyQuestionGenerator.regenerateSet(today);
    console.log('BUG: regeneration was allowed after answers existed');
  } catch (error) {
    console.log('regeneration refused as expected:', (error as Error).message);
  }

  console.log('\n--- duplicate submission refused ---');
  try {
    await dailyPulseService.submit(empUser, {
      responseDate: today,
      answers,
      writtenFeedback: { category: 'GENERAL', content: 'Second attempt.' },
    } as never);
    console.log('BUG: duplicate submission was accepted');
  } catch (error) {
    console.log('duplicate refused as expected:', (error as Error).message);
  }

  console.log('\n--- HR response view ---');
  const viewed = await dailyPulseService.responses(hrUser, today);
  console.log('responses=', viewed.responses.length);
  console.log('employee=', viewed.responses[0]?.employee.name, 'answers=', viewed.responses[0]?.answers.length);
  console.log('text answer=', viewed.responses[0]?.answers.find((a) => a.textValue)?.textValue);

  console.log('\n--- editing a frozen question refused ---');
  try {
    await dailyPulseService.updateQuestion(hrUser, set.questions[0]!.id, { prompt: 'tampered' });
    console.log('BUG: a frozen question was editable');
  } catch (error) {
    console.log('edit refused as expected:', (error as Error).message);
  }

  console.log('\n--- recent sets ---');
  const recent = await dailyQuestionGenerator.recentSets(7);
  for (const s of recent) console.log(`  ${s.responseDate} ${s.source} ${s.model ?? ''}`);

  console.log('\n--- cleanup ---');
  await prisma.employee.deleteMany({ where: { id: 'probe-emp' } });
  await prisma.user.deleteMany({ where: { id: 'probe-emp-user' } });
  await prisma.dailyQuestionSet.deleteMany({ where: { responseDate: { in: [today, yesterday] } } });
  await prisma.dailyQuestion.deleteMany({ where: { prompt: { startsWith: '' }, questionSetId: null } });
  console.log('done');
}

main()
  .catch((error) => {
    console.error('PROBE FAILED:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());