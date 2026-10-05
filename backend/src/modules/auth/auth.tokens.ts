import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import { config } from '../../config/env';
import { UnauthorizedError } from '../../core/errors';
import type { AuthenticatedUser } from '../../types/express';

export interface AccessTokenPayload extends JwtPayload {
  sub: string;
  email: string;
  role: string;
  type: 'access';
}

export function signAccessToken(user: AuthenticatedUser): string {
  const options: SignOptions = {
    // `expiresIn` is typed as a template literal union by jsonwebtoken; the
    // configured value is validated as `^\d+[smhd]$` at startup.
    expiresIn: config.jwt.accessTtl as SignOptions['expiresIn'],
    issuer: 'aiep',
    audience: 'aiep-api',
  };
  return jwt.sign({ email: user.email, role: user.role, type: 'access' }, config.jwt.accessSecret, {
    ...options,
    subject: user.id,
  });
}

export function signRefreshToken(user: Pick<AuthenticatedUser, 'id'>): string {
  const options: SignOptions = {
    expiresIn: config.jwt.refreshTtl as SignOptions['expiresIn'],
    issuer: 'aiep',
    audience: 'aiep-refresh',
  };
  return jwt.sign({ type: 'refresh' }, config.jwt.refreshSecret, {
    ...options,
    subject: user.id,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, config.jwt.accessSecret, {
      issuer: 'aiep',
      audience: 'aiep-api',
    }) as AccessTokenPayload;

    if (decoded.type !== 'access' || !decoded.sub) {
      throw new UnauthorizedError('Invalid access token');
    }
    return decoded;
  } catch (error) {
    if (error instanceof UnauthorizedError) throw error;
    throw new UnauthorizedError('Access token is invalid or has expired');
  }
}

export function verifyRefreshToken(token: string): { userId: string } {
  try {
    const decoded = jwt.verify(token, config.jwt.refreshSecret, {
      issuer: 'aiep',
      audience: 'aiep-refresh',
    }) as JwtPayload;

    if (decoded.type !== 'refresh' || !decoded.sub) {
      throw new UnauthorizedError('Invalid refresh token');
    }
    return { userId: decoded.sub };
  } catch (error) {
    if (error instanceof UnauthorizedError) throw error;
    throw new UnauthorizedError('Refresh token is invalid or has expired');
  }
}

/** Converts a configured duration string ("15m", "7d") into milliseconds. */
export function durationToMs(duration: string): number {
  const match = /^(\d+)([smhd])$/.exec(duration.trim());
  if (!match) return 0;
  const value = Number(match[1]);
  const unit = match[2] as 's' | 'm' | 'h' | 'd';
  const multipliers = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return value * multipliers[unit];
}
