import { describe, expect, it } from 'vitest';
import { ALL_PERMISSIONS, PERMISSIONS, permissionsForRole, roleHasPermission } from './permissions';
import {
  ALERT_SEVERITIES,
  RISK_LEVELS,
  SURVEY_STATUSES,
  USER_ROLES,
} from '../../core/enums';

describe('role permission matrix', () => {
  it('grants ADMIN every permission', () => {
    expect(permissionsForRole('ADMIN').sort()).toEqual([...ALL_PERMISSIONS].sort());
  });

  it('returns an empty list for an unknown role rather than throwing', () => {
    expect(permissionsForRole('NOT_A_ROLE')).toEqual([]);
  });

  it('enforces least privilege for EMPLOYEE', () => {
    const employee = permissionsForRole('EMPLOYEE');

    expect(employee).toContain(PERMISSIONS.AI_CHAT);
    expect(employee).toContain(PERMISSIONS.SURVEY_RESPOND);
    expect(employee).not.toContain(PERMISSIONS.EMPLOYEE_READ_ALL);
    expect(employee).not.toContain(PERMISSIONS.USER_WRITE);
    expect(employee).not.toContain(PERMISSIONS.SYSTEM_MANAGE);
  });

  it('scopes MANAGER to their team but not the organisation', () => {
    const manager = permissionsForRole('MANAGER');

    expect(manager).toContain(PERMISSIONS.EMPLOYEE_READ_TEAM);
    expect(manager).toContain(PERMISSIONS.ENGAGEMENT_READ_TEAM);
    expect(manager).toContain(PERMISSIONS.RISK_READ_TEAM);
    expect(manager).not.toContain(PERMISSIONS.EMPLOYEE_READ_ALL);
    expect(manager).not.toContain(PERMISSIONS.ANALYTICS_READ_ORG);
    expect(manager).not.toContain(PERMISSIONS.USER_WRITE);
  });

  it('gives HR organisation-wide analytics without system administration', () => {
    const hr = permissionsForRole('HR');

    expect(hr).toContain(PERMISSIONS.EMPLOYEE_READ_ALL);
    expect(hr).toContain(PERMISSIONS.ANALYTICS_READ_ORG);
    expect(hr).toContain(PERMISSIONS.FEEDBACK_READ_ALL);
    expect(hr).not.toContain(PERMISSIONS.SYSTEM_MANAGE);
  });

  it('never lets a non-admin hold administration permissions', () => {
    for (const role of USER_ROLES) {
      if (role === 'ADMIN') continue;
      expect(roleHasPermission(role, PERMISSIONS.SYSTEM_MANAGE)).toBe(false);
      expect(roleHasPermission(role, PERMISSIONS.USER_CHANGE_ROLE)).toBe(false);
    }
  });
});

describe('risk level banding', () => {
  it('maps scores onto the canonical levels', async () => {
    const { riskLevelFor } = await import('../risk/risk.service');

    expect(riskLevelFor(0)).toBe('LOW');
    expect(riskLevelFor(34.9)).toBe('LOW');
    expect(riskLevelFor(35)).toBe('MODERATE');
    expect(riskLevelFor(55)).toBe('HIGH');
    expect(riskLevelFor(75)).toBe('CRITICAL');
    expect(riskLevelFor(100)).toBe('CRITICAL');

    // Every band must be one of the canonical levels the schema declares.
    for (const score of [0, 34, 35, 54, 55, 74, 75, 100]) {
      expect(RISK_LEVELS).toContain(riskLevelFor(score));
    }
  });
});

describe('enum definitions', () => {
  it('keeps severity ordering usable for sorting', () => {
    expect(ALERT_SEVERITIES.indexOf('CRITICAL')).toBeGreaterThan(ALERT_SEVERITIES.indexOf('INFO'));
  });

  it('exposes survey statuses used by the status transition table', () => {
    expect(SURVEY_STATUSES).toContain('DRAFT');
    expect(SURVEY_STATUSES).toContain('OPEN');
    expect(SURVEY_STATUSES).toContain('CLOSED');
  });
});
