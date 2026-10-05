/**
 * Bootstrap seed.
 *
 * Creates exactly one account - the initial administrator - from environment
 * variables, and nothing else. No demo departments, employees, surveys or
 * analytics are inserted: the platform starts empty by design, and every figure
 * in the UI reflects real recorded data.
 *
 * Required:  ADMIN_EMAIL, ADMIN_PASSWORD
 * Optional:  ADMIN_NAME
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return { firstName: 'Admin', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0]!, lastName: '-' };
  return { firstName: parts[0]!, lastName: parts.slice(1).join(' ') };
}

async function main(): Promise<void> {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const fullName = process.env.ADMIN_NAME?.trim() || 'Platform Administrator';

  const missing = [
    !email && 'ADMIN_EMAIL',
    !password && 'ADMIN_PASSWORD',
  ].filter(Boolean) as string[];

  if (missing.length > 0) {
    throw new Error(
      `Cannot seed: ${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} not set in backend/.env`,
    );
  }

  if (password!.length < 12) {
    throw new Error('Cannot seed: ADMIN_PASSWORD must be at least 12 characters');
  }

  const existing = await prisma.user.findUnique({ where: { email: email! } });
  if (existing) {
    console.log(`Admin account already exists (${email}). Nothing to do.`);
    return;
  }

  const { firstName, lastName } = splitName(fullName);
  const rounds = Number(process.env.BCRYPT_ROUNDS ?? 12);

  await prisma.user.create({
    data: {
      email: email!,
      passwordHash: await bcrypt.hash(password!, rounds),
      firstName,
      lastName,
      role: 'ADMIN',
      status: 'ACTIVE',
      isActive: true,
    },
  });

  console.log(`Created admin account: ${email}`);
  console.log('No business data was seeded. Sign in and create departments and employees as needed.');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
