import { PrismaClient } from '@prisma/client';
import { dailyPulseService } from './src/modules/daily-pulse/daily-pulse.service';
import { permissionsForRole } from './src/modules/auth/permissions';
import type { AuthenticatedUser } from './src/modules/auth/auth.types';

const prisma = new PrismaClient();

const today = new Date();
today.setUTCHours(0, 0, 0, 0);

function as(role: string): AuthenticatedUser {
  return {
    id: 'probe-user',
    role,
    email: 'probe@example.invalid',
    permissions: permissionsForRole(role),
  };
}

async function attempt(label: string, user: AuthenticatedUser) {
  try {
    const result = await dailyPulseService.responses(user, today);
    console.log(`${label}: ALLOWED (${result.responses.length} responses)`);
  } catch (error) {
    console.log(`${label}: refused -> ${(error as Error).message}`);
  }
}

async function main() {
  console.log('--- /responses access by role ---');
  for (const role of ['EMPLOYEE', 'MANAGER', 'HR', 'ADMIN']) {
    await attempt(role, as(role));
  }

  console.log('\n--- /questions (pool) access by role ---');
  for (const role of ['EMPLOYEE', 'MANAGER', 'HR']) {
    try {
      const pool = await dailyPulseService.listQuestions(as(role));
      console.log(`${role}: ALLOWED (${pool.length} pool rows)`);
    } catch (error) {
      console.log(`${role}: refused -> ${(error as Error).message}`);
    }
  }
}

main()
  .catch((error) => {
    console.error('FAILED:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());