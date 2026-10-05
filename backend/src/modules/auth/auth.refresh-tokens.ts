import { createHash } from 'node:crypto';
import { config } from '../../config/env';
import { UnauthorizedError } from '../../core/errors';
import { prisma } from '../../core/prisma';
import type { AuthenticatedUser } from '../../types/express';
import { durationToMs, signRefreshToken, verifyRefreshToken } from './auth.tokens';

/** Refresh tokens are stored hashed: a database leak cannot be replayed. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface IssuedRefreshToken {
  token: string;
  expiresAt: Date;
}

export async function issueRefreshToken(
  userId: string,
  context?: { userAgent?: string; ipAddress?: string },
): Promise<IssuedRefreshToken> {
  const token = signRefreshToken({ id: userId });
  const ttlMs = durationToMs(config.jwt.refreshTtl) || 7 * 86_400_000;

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + ttlMs),
      userAgent: context?.userAgent ?? null,
      ipAddress: context?.ipAddress ?? null,
    },
  });

  return { token, expiresAt: new Date(Date.now() + ttlMs) };
}

/**
 * Validates a refresh token and rotates it. The presented token is revoked as
 * part of the exchange, so a stolen token is usable at most once and the
 * legitimate client's next refresh immediately invalidates it.
 */
export async function rotateRefreshToken(
  token: string,
  context?: { userAgent?: string; ipAddress?: string },
): Promise<{ userId: string; refreshToken: IssuedRefreshToken }> {
  const { userId } = verifyRefreshToken(token);
  const tokenHash = hashToken(token);

  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    // A valid signature with no matching live row means replay or a revoked
    // session: drop every session for that user to force a fresh login.
    if (stored?.revokedAt) {
      await prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    throw new UnauthorizedError('Refresh token is no longer valid');
  }

  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });

  return { userId, refreshToken: await issueRefreshToken(userId, context) };
}

export async function revokeRefreshToken(token: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllForUser(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function purgeExpiredTokens(): Promise<number> {
  const { count } = await prisma.refreshToken.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return count;
}

/** Principal shape stored in the access token. */
export function toAuthenticatedUser(user: {
  id: string;
  email: string;
  role: string;
}): AuthenticatedUser {
  return { id: user.id, email: user.email, role: user.role };
}
