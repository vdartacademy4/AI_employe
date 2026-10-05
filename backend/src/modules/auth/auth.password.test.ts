import { describe, expect, it } from 'vitest';
import { assertPasswordStrength, PASSWORD_POLICY } from './auth.password';
import { durationToMs } from './auth.tokens';

describe('password policy', () => {
  it('accepts a password meeting every rule', () => {
    expect(assertPasswordStrength('Str0ngPassphrase')).toEqual([]);
  });

  it('rejects short passwords', () => {
    expect(assertPasswordStrength('Ab1')).toContain(
      `must be at least ${PASSWORD_POLICY.minLength} characters`,
    );
  });

  it('rejects passwords missing a required character class', () => {
    const problems = assertPasswordStrength('alllowercase12');
    expect(problems).toContain('must contain an uppercase letter');
  });

  it('collects every violation at once', () => {
    expect(assertPasswordStrength('short').length).toBeGreaterThan(1);
  });
});

describe('jwt duration parsing', () => {
  it('converts the supported units', () => {
    expect(durationToMs('30s')).toBe(30_000);
    expect(durationToMs('15m')).toBe(900_000);
    expect(durationToMs('2h')).toBe(7_200_000);
    expect(durationToMs('7d')).toBe(604_800_000);
  });

  it('returns zero for an unparsable value', () => {
    expect(durationToMs('15 minutes')).toBe(0);
  });
});
