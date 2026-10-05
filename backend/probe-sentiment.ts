import { PrismaClient } from '@prisma/client';
import { dailyQuestionGenerator } from './src/modules/daily-pulse/daily-question.generator';
import { dailyPulseService } from './src/modules/daily-pulse/daily-pulse.service';
import { permissionsForRole } from './src/modules/auth/permissions';
import type { AuthenticatedUser } from './src/modules/auth/auth.types';

const prisma = new PrismaClient();

async function main() {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  await prisma.employee.deleteMany({ where: { email: 'sent@example.invalid' } });
  await prisma.user.deleteMany({ where: { email: 'sent@example.invalid' } });

  await prisma.user.create({
    data: {
      id: 'sent-user',
      email: 'sent@example.invalid',
      passwordHash: 'x',
      firstName: 'Sentiment',
      lastName: 'Probe',
      role: 'EMPLOYEE',
    },
  });
  await prisma.employee.create({
    data: {
      id: 'sent-emp',
      employeeNumber: 'SENT-1',
      firstName: 'Sentiment',
      lastName: 'Probe',
      email: 'sent@example.invalid',
      userId: 'sent-user',
    },
  });

  const user: AuthenticatedUser = {
    id: 'sent-user',
    role: 'EMPLOYEE',
    email: 'sent@example.invalid',
    permissions: permissionsForRole('EMPLOYEE'),
  };

  const set = await dailyQuestionGenerator.setForDate(today);
  console.log('set source:', set.source);

  const answers = set.questions.map((q) => {
    if (q.answerType === 'RATING') return { questionId: q.id, numericValue: 2 };
    if (q.answerType === 'YES_NO') return { questionId: q.id, numericValue: 0 };
    return {
      questionId: q.id,
      textValue: 'I feel completely overwhelmed and unsupported by my manager.',
    };
  });

  await dailyPulseService.submit(user, {
    responseDate: today,
    answers,
    writtenFeedback: { category: 'CONCERN', content: 'Sentiment probe written feedback.' },
  } as never);

  console.log('submitted; waiting for the async pipeline…');
  await new Promise((resolve) => setTimeout(resolve, 9000));

  const daily = await prisma.sentimentAnalysis.findMany({
    where: { sourceType: 'DAILY_ANSWER' },
  });
  console.log('DAILY_ANSWER rows:', daily.length);
  for (const row of daily) {
    console.log(`  label=${row.label} score=${row.score} method=${row.method} provider=${row.provider}`);
    console.log(`  sourceId=${row.sourceId}`);
  }

  const text = await prisma.dailyQuestionAnswer.findFirst({
    where: { textValue: { not: null } },
    include: { question: true },
  });
  console.log('text question theme:', text?.question.theme, 'text:', text?.textValue);
  console.log('matched?', daily.some((d) => d.sourceId === text?.id));

  await prisma.employee.deleteMany({ where: { email: 'sent@example.invalid' } });
  await prisma.user.deleteMany({ where: { email: 'sent@example.invalid' } });
  await prisma.dailyQuestionSet.deleteMany({ where: { responseDate: today } });
  console.log('done');
}

main()
  .catch((error) => {
    console.error('FAILED:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());