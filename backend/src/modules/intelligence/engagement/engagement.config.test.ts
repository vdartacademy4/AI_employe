import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_SIGNAL_RULES,
  FACTOR_DEFINITIONS,
  defaultFactorConfigs,
  scaleMaximumForQuestion,
  scoreActivitySignal,
} from './engagement.config';

describe('factor definitions', () => {
  it('defines all three published factors with positive default weights', () => {
    const configs = defaultFactorConfigs();
    expect(configs.map((config) => config.key)).toEqual([
      'SURVEY_RESPONSES',
      'FEEDBACK_SENTIMENT',
      'ACTIVITY_DATA',
    ]);
    for (const config of configs) {
      expect(config.weight).toBeGreaterThan(0);
      expect(config.description.length).toBeGreaterThan(20);
    }
  });

  it('defaults to enabled and unoverridden', () => {
    // A fresh install must score correctly with no seeded configuration rows.
    for (const config of defaultFactorConfigs()) {
      expect(config.enabled).toBe(true);
      expect(config.overridden).toBe(false);
    }
  });

  it('publishes a definition for every factor key', () => {
    for (const config of defaultFactorConfigs()) {
      expect(FACTOR_DEFINITIONS[config.key]).toBeDefined();
    }
  });
});

describe('scaleMaximumForQuestion', () => {
  it('knows the maximum for each scale question type', () => {
    expect(scaleMaximumForQuestion('LIKERT_5')).toBe(5);
    expect(scaleMaximumForQuestion('SCALE_1_5')).toBe(5);
    expect(scaleMaximumForQuestion('LIKERT_10')).toBe(10);
    expect(scaleMaximumForQuestion('YES_NO')).toBe(1);
  });

  it('uses the option count for single choice questions', () => {
    expect(scaleMaximumForQuestion('SINGLE_CHOICE', ['Low', 'Medium', 'High'])).toBe(3);
  });

  it('refuses to place unbounded questions on a scale', () => {
    // Guessing a maximum here would invent a number for every free-form or
    // open numeric answer, so these return null and the answer is skipped.
    expect(scaleMaximumForQuestion('NUMERIC')).toBeNull();
    expect(scaleMaximumForQuestion('FREE_TEXT')).toBeNull();
    expect(scaleMaximumForQuestion('SINGLE_CHOICE', [])).toBeNull();
  });
});

describe('scoreActivitySignal', () => {
  it('treats more learning hours as better', () => {
    expect(scoreActivitySignal('LEARNING_HOURS', 0)).toBe(0);
    expect(scoreActivitySignal('LEARNING_HOURS', 8)).toBe(50);
    expect(scoreActivitySignal('LEARNING_HOURS', 16)).toBe(100);
    expect(scoreActivitySignal('LEARNING_HOURS', 40)).toBe(100);
  });

  it('inverts absence days so that more absence scores lower', () => {
    expect(scoreActivitySignal('ABSENCE_DAYS', 0)).toBe(100);
    expect(scoreActivitySignal('ABSENCE_DAYS', 5)).toBe(50);
    expect(scoreActivitySignal('ABSENCE_DAYS', 10)).toBe(0);
  });

  it('starts baselined counts at a neutral 50 rather than punishing zero', () => {
    // "No recognition this month" is neutral, not the worst possible score.
    expect(scoreActivitySignal('RECOGNITION_RECEIVED', 0)).toBe(50);
    expect(scoreActivitySignal('FEEDBACK_GIVEN', 0)).toBe(50);
    expect(scoreActivitySignal('GOALS_COMPLETED', 0)).toBe(50);
  });

  it('rewards high baselined counts and clamps beyond the anchor', () => {
    expect(scoreActivitySignal('RECOGNITION_RECEIVED', 4)).toBe(100);
    expect(scoreActivitySignal('RECOGNITION_RECEIVED', 2)).toBe(75);
    expect(scoreActivitySignal('RECOGNITION_RECEIVED', 99)).toBe(100);
  });

  it('always returns a value inside 0-100', () => {
    const extremes = [-1000, -1, 0, 1, 1000];
    for (const key of Object.keys(ACTIVITY_SIGNAL_RULES) as (keyof typeof ACTIVITY_SIGNAL_RULES)[]) {
      for (const value of extremes) {
        const score = scoreActivitySignal(key, value);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      }
    }
  });

  it('falls back to neutral for a non-numeric value', () => {
    expect(scoreActivitySignal('LEARNING_HOURS', Number.NaN)).toBe(50);
  });
});
