import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config/env';

/**
 * Keyed hashes for values that must be *recognised* but never *recoverable*.
 *
 * Anonymous survey responses need both: a submitter must be able to find their
 * own row again to amend it, and HR must be able to prove a row belongs to a
 * given survey, but neither may be able to reverse the hash back into a user id
 * by querying the database. A keyed HMAC gives recognition without
 * recoverability, which an unsalted hash of a cuid would not.
 *
 * A fixed per-installation secret is required for the same reason: an attacker
 * with database read access could otherwise recompute hashes for guessed user
 * ids and match them against the anonymous rows.
 */
export function hmacFor(namespace: string, value: string): string {
  return createHmac('sha256', config.security.hmacSecret)
    .update(`${namespace}:${value}`)
    .digest('hex');
}

/** The value stored in `SurveyResponse.anonymousOwnerHash`. */
export function anonymousOwnerHash(userId: string): string {
  return hmacFor('survey-response-owner', userId);
}

/** Constant-time comparison, for comparing hashes. */
export function hmacMatches(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'hex');
  const bufferB = Buffer.from(b, 'hex');
  if (bufferA.length !== bufferB.length || bufferA.length === 0) return false;
  return timingSafeEqual(bufferA, bufferB);
}
