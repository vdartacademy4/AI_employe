/**
 * Display labels for engagement themes.
 *
 * Mirrors `THEME_LABELS` in the backend's `core/enums.ts`, which is the
 * authoritative list. The keys are the stored values, so a theme detected by
 * the NLP pipeline always has a label here.
 */
export const THEME_LABELS: Record<string, string> = {
  WORKLOAD: 'Workload',
  MANAGEMENT: 'Management',
  TEAM: 'Team',
  LEARNING: 'Learning',
  CAREER_GROWTH: 'Career Growth',
  WORK_ENVIRONMENT: 'Work Environment',
  COMMUNICATION: 'Communication',
  COMPENSATION: 'Compensation',
  WORK_LIFE_BALANCE: 'Work-Life Balance',
  TECHNICAL_ISSUES: 'Technical Issues',
};
