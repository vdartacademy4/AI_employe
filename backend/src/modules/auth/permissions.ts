/**
 * The role -> capability matrix.
 *
 * `Permission` values are fine-grained capabilities rather than raw roles, so
 * new roles can be introduced without touching route definitions, and the
 * frontend can ask the API what a principal may do
 * (`GET /auth/permissions`) instead of duplicating this matrix in TypeScript.
 *
 * The HTTP guards that enforce it (`requireAuth`, `requirePermission`) live in
 * `src/middleware/auth.middleware.ts`; this module stays free of Express types.
 */
export const PERMISSIONS = {
  // Surveys
  SURVEY_READ: 'survey:read',
  SURVEY_CREATE: 'survey:create',
  SURVEY_UPDATE: 'survey:update',
  SURVEY_DELETE: 'survey:delete',
  SURVEY_RESPOND: 'survey:respond',
  SURVEY_READ_ALL_RESPONSES: 'survey:read-all-responses',
  SURVEY_READ_ORG_ANALYTICS: 'survey:read-org-analytics',

  // Feedback
  FEEDBACK_CREATE: 'feedback:create',
  FEEDBACK_READ_OWN: 'feedback:read-own',
  FEEDBACK_READ_ALL: 'feedback:read-all',
  FEEDBACK_UPDATE: 'feedback:update',
  FEEDBACK_DELETE: 'feedback:delete',

  // Employees & organisation
  EMPLOYEE_READ_SELF: 'employee:read-self',
  EMPLOYEE_READ_TEAM: 'employee:read-team',
  EMPLOYEE_READ_ALL: 'employee:read-all',
  EMPLOYEE_WRITE: 'employee:write',
  DEPARTMENT_READ: 'department:read',
  DEPARTMENT_WRITE: 'department:write',

  // Engagement
  ENGAGEMENT_READ_SELF: 'engagement:read-self',
  ENGAGEMENT_READ_TEAM: 'engagement:read-team',
  ENGAGEMENT_READ_ALL: 'engagement:read-all',
  ENGAGEMENT_WRITE: 'engagement:write',

  // Daily pulse
  PULSE_RESPOND: 'pulse:respond',
  PULSE_READ_SELF: 'pulse:read-self',
  PULSE_READ_TEAM: 'pulse:read-team',
  PULSE_READ_ALL: 'pulse:read-all',
  /** Configure the five questions and the resubmission policy. */
  PULSE_MANAGE: 'pulse:manage',

  // Anonymous feedback
  /** Read anonymous feedback content. Not granted to managers. */
  FEEDBACK_READ_ANONYMOUS: 'feedback:read-anonymous',
  /** Read insights generated for teams/departments/organisation. */
  INSIGHT_READ_TEAM: 'insight:read-team',
  INSIGHT_READ_ALL: 'insight:read-all',
  /** Trigger insight generation. */
  INSIGHT_GENERATE: 'insight:generate',

  // Risk
  RISK_READ_SELF: 'risk:read-self',
  RISK_READ_TEAM: 'risk:read-team',
  RISK_READ_ALL: 'risk:read-all',
  RISK_WRITE: 'risk:write',
  RISK_MODEL_RUN: 'risk:run-model',

  // Alerts & action items
  ALERT_READ_OWN: 'alert:read-own',
  ALERT_READ_TEAM: 'alert:read-team',
  ALERT_READ_ALL: 'alert:read-all',
  ALERT_WRITE: 'alert:write',
  ACTION_ITEM_READ_OWN: 'action-item:read-own',
  ACTION_ITEM_READ_TEAM: 'action-item:read-team',
  ACTION_ITEM_READ_ALL: 'action-item:read-all',
  ACTION_ITEM_WRITE: 'action-item:write',

  // Reports
  REPORT_READ_OWN: 'report:read-own',
  REPORT_READ_ALL: 'report:read-all',
  REPORT_GENERATE: 'report:generate',

  // Analytics
  ANALYTICS_READ_SELF: 'analytics:read-self',
  ANALYTICS_READ_TEAM: 'analytics:read-team',
  ANALYTICS_READ_ORG: 'analytics:read-org',

  // AI
  AI_CHAT: 'ai:chat',

  // Administration
  USER_READ: 'user:read',
  USER_WRITE: 'user:write',
  USER_CHANGE_ROLE: 'user:change-role',
  SYSTEM_MANAGE: 'system:manage',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** Role -> capability mapping. Roles themselves are defined in `core/enums`. */
const ROLE_PERMISSIONS: Record<string, readonly Permission[]> = {
  EMPLOYEE: [
    PERMISSIONS.SURVEY_READ,
    PERMISSIONS.SURVEY_RESPOND,
    PERMISSIONS.FEEDBACK_CREATE,
    PERMISSIONS.FEEDBACK_READ_OWN,
    PERMISSIONS.EMPLOYEE_READ_SELF,
    PERMISSIONS.DEPARTMENT_READ,
    PERMISSIONS.ENGAGEMENT_READ_SELF,
    PERMISSIONS.RISK_READ_SELF,
    PERMISSIONS.ALERT_READ_OWN,
    PERMISSIONS.ACTION_ITEM_READ_OWN,
    PERMISSIONS.REPORT_READ_OWN,
    PERMISSIONS.ANALYTICS_READ_SELF,
    PERMISSIONS.AI_CHAT,
    PERMISSIONS.PULSE_RESPOND,
    PERMISSIONS.PULSE_READ_SELF,
  ],
  MANAGER: [
    PERMISSIONS.SURVEY_READ,
    PERMISSIONS.SURVEY_CREATE,
    PERMISSIONS.SURVEY_UPDATE,
    PERMISSIONS.SURVEY_RESPOND,
    PERMISSIONS.SURVEY_READ_ALL_RESPONSES,
    PERMISSIONS.SURVEY_READ_ORG_ANALYTICS,
    PERMISSIONS.FEEDBACK_CREATE,
    PERMISSIONS.FEEDBACK_READ_OWN,
    PERMISSIONS.EMPLOYEE_READ_SELF,
    PERMISSIONS.EMPLOYEE_READ_TEAM,
    PERMISSIONS.DEPARTMENT_READ,
    PERMISSIONS.ENGAGEMENT_READ_SELF,
    PERMISSIONS.ENGAGEMENT_READ_TEAM,
    PERMISSIONS.ENGAGEMENT_WRITE,
    PERMISSIONS.RISK_READ_SELF,
    PERMISSIONS.RISK_READ_TEAM,
    PERMISSIONS.ALERT_READ_OWN,
    PERMISSIONS.ALERT_READ_TEAM,
    PERMISSIONS.ACTION_ITEM_READ_OWN,
    PERMISSIONS.ACTION_ITEM_READ_TEAM,
    PERMISSIONS.ACTION_ITEM_WRITE,
    PERMISSIONS.REPORT_READ_OWN,
    PERMISSIONS.ANALYTICS_READ_SELF,
    PERMISSIONS.ANALYTICS_READ_TEAM,
    PERMISSIONS.AI_CHAT,
    // Managers respond to their own pulse and see team aggregates, but are
    // deliberately not granted FEEDBACK_READ_ANONYMOUS.
    PERMISSIONS.PULSE_RESPOND,
    PERMISSIONS.PULSE_READ_SELF,
    PERMISSIONS.PULSE_READ_TEAM,
    PERMISSIONS.INSIGHT_READ_TEAM,
  ],
  HR: [
    PERMISSIONS.SURVEY_READ,
    PERMISSIONS.SURVEY_CREATE,
    PERMISSIONS.SURVEY_UPDATE,
    PERMISSIONS.SURVEY_DELETE,
    PERMISSIONS.SURVEY_RESPOND,
    PERMISSIONS.SURVEY_READ_ALL_RESPONSES,
    PERMISSIONS.SURVEY_READ_ORG_ANALYTICS,
    PERMISSIONS.FEEDBACK_CREATE,
    PERMISSIONS.FEEDBACK_READ_OWN,
    PERMISSIONS.FEEDBACK_READ_ALL,
    PERMISSIONS.FEEDBACK_UPDATE,
    PERMISSIONS.FEEDBACK_DELETE,
    PERMISSIONS.EMPLOYEE_READ_SELF,
    PERMISSIONS.EMPLOYEE_READ_ALL,
    PERMISSIONS.EMPLOYEE_WRITE,
    PERMISSIONS.DEPARTMENT_READ,
    PERMISSIONS.DEPARTMENT_WRITE,
    PERMISSIONS.ENGAGEMENT_READ_SELF,
    PERMISSIONS.ENGAGEMENT_READ_ALL,
    PERMISSIONS.ENGAGEMENT_WRITE,
    PERMISSIONS.RISK_READ_SELF,
    PERMISSIONS.RISK_READ_ALL,
    PERMISSIONS.RISK_WRITE,
    PERMISSIONS.ALERT_READ_OWN,
    PERMISSIONS.ALERT_READ_ALL,
    PERMISSIONS.ALERT_WRITE,
    PERMISSIONS.ACTION_ITEM_READ_OWN,
    PERMISSIONS.ACTION_ITEM_READ_ALL,
    PERMISSIONS.ACTION_ITEM_WRITE,
    PERMISSIONS.REPORT_READ_OWN,
    PERMISSIONS.REPORT_READ_ALL,
    PERMISSIONS.REPORT_GENERATE,
    PERMISSIONS.ANALYTICS_READ_SELF,
    PERMISSIONS.ANALYTICS_READ_ORG,
    PERMISSIONS.AI_CHAT,
    // HR may read anonymous feedback content (it is aggregated, never
    // attributed) and administer the pulse.
    PERMISSIONS.FEEDBACK_READ_ANONYMOUS,
    PERMISSIONS.PULSE_RESPOND,
    PERMISSIONS.PULSE_READ_SELF,
    PERMISSIONS.PULSE_READ_ALL,
    PERMISSIONS.PULSE_MANAGE,
    PERMISSIONS.INSIGHT_READ_ALL,
    PERMISSIONS.INSIGHT_GENERATE,
  ],
  ADMIN: Object.values(PERMISSIONS),
};

export function permissionsForRole(role: string): Permission[] {
  return [...(ROLE_PERMISSIONS[role] ?? [])];
}

export function roleHasPermission(role: string, permission: Permission): boolean {
  return permissionsForRole(role).includes(permission);
}

export const ALL_PERMISSIONS = Object.values(PERMISSIONS);
