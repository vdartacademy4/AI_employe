import bcrypt from 'bcryptjs';
import { config } from '../../config/env';

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, config.security.bcryptRounds);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Password policy. Applied at the service boundary so it holds for every
 * entry point (registration, admin reset, seed) rather than only the API route.
 */
export const PASSWORD_POLICY = {
  minLength: 12,
  maxLength: 128,
  requiresUppercase: true,
  requiresLowercase: true,
  requiresNumber: true,
} as const;

export function assertPasswordStrength(password: string): string[] {
  const problems: string[] = [];

  if (password.length < PASSWORD_POLICY.minLength) {
    problems.push(`must be at least ${PASSWORD_POLICY.minLength} characters`);
  }
  if (password.length > PASSWORD_POLICY.maxLength) {
    problems.push(`must be at most ${PASSWORD_POLICY.maxLength} characters`);
  }
  if (PASSWORD_POLICY.requiresUppercase && !/[A-Z]/.test(password)) {
    problems.push('must contain an uppercase letter');
  }
  if (PASSWORD_POLICY.requiresLowercase && !/[a-z]/.test(password)) {
    problems.push('must contain a lowercase letter');
  }
  if (PASSWORD_POLICY.requiresNumber && !/\d/.test(password)) {
    problems.push('must contain a number');
  }
  return problems;
}
