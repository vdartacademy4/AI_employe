/**
 * Runtime configuration with code-defined defaults.
 *
 * The platform ships with no seeded rows: these defaults are the effective
 * configuration until an administrator saves an override, so a fresh install
 * is immediately usable and still has zero placeholder data in the database.
 *
 * Defaults are deliberately conservative on privacy - anonymity is off and
 * reporting thresholds are non-zero - because those are the settings an
 * organisation must opt *into*, not out of.
 */
export interface PrivacySettings {
  /** Whether employees may submit feedback anonymously at all. */
  feedbackAllowAnonymous: boolean;
  /** Whether a submitter may still see their own anonymous item. */
  feedbackAnonymousSelfVisible: boolean;
  /** Whether managers may read feedback raised about their reports. */
  feedbackManagerVisible: boolean;
  /**
   * Smallest number of responses before aggregate figures may be shown.
   * Below this, APIs return a suppressed flag instead of a number, so an
   * individual cannot be reverse-identified from a small group.
   */
  reportingMinimumGroupSize: number;
  /** Whether check-ins are open right now. */
  checkInsEnabled: boolean;
  /** Minimum check-ins in a period before aggregate mood may be shown. */
  checkInMinimumGroupSize: number;
  /** Whether employees may submit feedback at all. */
  feedbackEnabled: boolean;
}

export const DEFAULT_PRIVACY_SETTINGS: PrivacySettings = {
  feedbackAllowAnonymous: true,
  feedbackAnonymousSelfVisible: false,
  feedbackManagerVisible: false,
  reportingMinimumGroupSize: 5,
  checkInsEnabled: true,
  checkInMinimumGroupSize: 5,
  feedbackEnabled: true,
};

export const SETTINGS_KEYS = {
  PRIVACY: 'privacy',
} as const;

export type SettingsKey = (typeof SETTINGS_KEYS)[keyof typeof SETTINGS_KEYS];
