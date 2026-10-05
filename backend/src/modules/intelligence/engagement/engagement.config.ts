import {
  ACTIVITY_SIGNAL_KEYS,
  ENGAGEMENT_FACTOR_KEYS,
  type ActivitySignalKey,
  type EngagementFactorKey,
} from '../../../core/enums';

/**
 * The published definition of every engagement factor.
 *
 * The factor *set* is fixed so a score is always explainable as the same three
 * components, but the *weights* are per-installation and stored in
 * `EngagementFactorConfig`. Missing rows fall back to the values here, so a
 * fresh install scores correctly with no seeded data.
 *
 * Each factor declares how its raw measurement is normalised onto 0-100, which
 * is written out rather than buried in the calculator so the scoring rule is
 * reviewable by someone who is not a developer.
 */
export interface FactorDefinition {
  key: EngagementFactorKey;
  label: string;
  description: string;
  defaultWeight: number;
  /**
   * Contribution weight. Values are relative: the calculator renormalises over
   * whichever factors actually had data, so these do not have to sum to 1.
   */
  explain: string;
}

export const FACTOR_DEFINITIONS: Record<EngagementFactorKey, FactorDefinition> = {
  SURVEY_RESPONSES: {
    key: 'SURVEY_RESPONSES',
    label: 'Survey responses',
    description:
      'Weighted average of the employee\'s numeric survey answers in the period, mapped onto 0-100 by each question type. Written questions are excluded because they are scored by the feedback factor instead.',
    defaultWeight: 0.5,
    explain: 'Higher rating answers produce a higher score.',
  },
  FEEDBACK_SENTIMENT: {
    key: 'FEEDBACK_SENTIMENT',
    label: 'Feedback sentiment',
    description:
      'Mean polarity of the employee\'s analysed feedback in the period, mapped from [-1, 1] onto [0, 100]. Anonymous submissions are included in organisation aggregates but never attributed to a person.',
    defaultWeight: 0.3,
    explain: 'More positive analysed feedback produces a higher score.',
  },
  ACTIVITY_DATA: {
    key: 'ACTIVITY_DATA',
    label: 'Approved activity',
    description:
      'Average of approved, opt-in activity signals: learning hours, recognition received, feedback given and goals completed lift the score; absence days lower it. Pending or rejected signals are ignored.',
    defaultWeight: 0.2,
    explain: 'Only signals an administrator has explicitly approved are used.',
  },
};

export interface ResolvedFactorConfig {
  key: EngagementFactorKey;
  label: string;
  description: string;
  explain: string;
  weight: number;
  enabled: boolean;
  /** True when the weight came from a stored override rather than the default. */
  overridden: boolean;
}

export function defaultFactorConfigs(): ResolvedFactorConfig[] {
  return ENGAGEMENT_FACTOR_KEYS.map((key) => {
    const definition = FACTOR_DEFINITIONS[key];
    // The maps above are keyed by the same union, so this cannot be reached
    // with a missing definition; the guard keeps that a compile-time fact
    // rather than a runtime crash if a key is ever added to one map only.
    if (!definition) {
      throw new Error(`Missing engagement factor definition for ${key}`);
    }
    return {
      key,
      label: definition.label,
      description: definition.description,
      explain: definition.explain,
      weight: definition.defaultWeight,
      enabled: true,
      overridden: false,
    };
  });
}

/**
 * How one approved activity signal becomes a 0-100 sub-score.
 *
 * `direction` matters: more learning hours is good, more absence days is bad.
 * Writing it per signal keeps that judgement visible and reviewable rather than
 * buried in arithmetic.
 */
export interface ActivitySignalRule {
  key: ActivitySignalKey;
  label: string;
  unit: string;
  direction: 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER';
  description: string;
  /** Value at which the sub-score reaches 0 or 100, per direction. */
  lowAnchor: number;
  highAnchor: number;
}

export const ACTIVITY_SIGNAL_RULES: Record<ActivitySignalKey, ActivitySignalRule> = {
  LEARNING_HOURS: {
    key: 'LEARNING_HOURS',
    label: 'Learning hours',
    unit: 'hours',
    direction: 'HIGHER_IS_BETTER',
    description: 'Approved formal learning time in the period. 16+ hours scores 100.',
    lowAnchor: 0,
    highAnchor: 16,
  },
  ABSENCE_DAYS: {
    key: 'ABSENCE_DAYS',
    label: 'Absence days',
    unit: 'days',
    direction: 'LOWER_IS_BETTER',
    description: 'Approved days absent in the period. 10+ days scores 0.',
    lowAnchor: 0,
    highAnchor: 10,
  },
  RECOGNITION_RECEIVED: {
    key: 'RECOGNITION_RECEIVED',
    label: 'Recognition received',
    unit: 'count',
    direction: 'HIGHER_IS_BETTER',
    description: 'Times recognised by others. Zero scores a neutral 50, 4+ scores 100.',
    // Baselined signals anchor at zero rather than at a negative value, so
    // "none recorded" lands on the neutral midpoint instead of scoring well.
    lowAnchor: 0,
    highAnchor: 4,
  },
  FEEDBACK_GIVEN: {
    key: 'FEEDBACK_GIVEN',
    label: 'Feedback given',
    unit: 'count',
    direction: 'HIGHER_IS_BETTER',
    description: 'Constructive feedback given to others. Zero scores 50, 3+ scores 100.',
    lowAnchor: 0,
    highAnchor: 3,
  },
  GOALS_COMPLETED: {
    key: 'GOALS_COMPLETED',
    label: 'Goals completed',
    unit: 'count',
    direction: 'HIGHER_IS_BETTER',
    description: 'Agreed goals completed. Zero scores 50, 3+ scores 100.',
    lowAnchor: 0,
    highAnchor: 3,
  },
};

/** Signals that start from a neutral baseline rather than from zero. */
const BASELINED_SIGNALS = new Set<ActivitySignalKey>([
  'RECOGNITION_RECEIVED',
  'FEEDBACK_GIVEN',
  'GOALS_COMPLETED',
]);

/**
 * Maps one activity signal onto 0-100.
 *
 * Baselined signals start at 50 so that "no recognition this month" is neutral
 * rather than punishing; the others start at 0.
 */
export function scoreActivitySignal(key: ActivitySignalKey, value: number): number {
  const rule = ACTIVITY_SIGNAL_RULES[key];
  if (!rule || !Number.isFinite(value)) return 50;

  const baselined = BASELINED_SIGNALS.has(key);
  const floorScore = baselined ? 50 : 0;
  const span = 100 - floorScore;

  if (rule.direction === 'HIGHER_IS_BETTER') {
    const progress = (value - rule.lowAnchor) / (rule.highAnchor - rule.lowAnchor);
    return clampToScore(floorScore + progress * span);
  }

  const progress = (value - rule.lowAnchor) / (rule.highAnchor - rule.lowAnchor);
  return clampToScore(floorScore + (1 - progress) * span);
}

function clampToScore(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.round(Math.min(Math.max(value, 0), 100) * 100) / 100;
}

/**
 * Highest numeric answer for a question type, used to normalise survey
 * responses. `null` means the answer cannot be placed on a 0-100 scale.
 */
export function scaleMaximumForQuestion(type: string, options?: string[]): number | null {
  switch (type) {
    case 'LIKERT_5':
    case 'SCALE_1_5':
      return 5;
    case 'LIKERT_10':
      return 10;
    case 'YES_NO':
      return 1;
    case 'SINGLE_CHOICE':
      return options && options.length > 1 ? options.length : null;
    default:
      // NUMERIC and FREE_TEXT have no natural maximum.
      return null;
  }
}

export const ALL_ACTIVITY_SIGNAL_KEYS = ACTIVITY_SIGNAL_KEYS;
