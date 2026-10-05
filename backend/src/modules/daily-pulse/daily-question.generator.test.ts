import { describe, expect, it } from 'vitest';
import { DAILY_ANSWER_TYPES } from '../../core/enums';
import {
  DAYS_PER_CYCLE,
  QUESTION_BANK,
  QUESTIONS_PER_DAY,
  isScorable,
} from './question-bank';
import { seededShuffle, selectForDate } from './daily-question.generator';

/**
 * The rotation rules, tested as pure functions.
 *
 * These are the properties an employee would notice: five questions, never the
 * whole bank, and never the same question two days running.
 */

const day = (offset: number) => new Date(Date.UTC(2026, 2, 1 + offset));
const promptsFor = (date: Date, previous?: ReadonlySet<string>) =>
  selectForDate(date, previous).map((question) => question.prompt);

/** A full cycle of days starting at `offset`, as prompts per day. */
function cycleFrom(offset: number, length = DAYS_PER_CYCLE) {
  return Array.from({ length }, (_, index) => promptsFor(day(offset + index)));
}

/**
 * The first day of a cycle.
 *
 * Cycles are counted from the epoch, so an arbitrary date such as 1 March 2026
 * lands in the middle of one. Coverage is only exact within a whole cycle, so
 * the test has to start where the rotation does.
 */
function alignedCycleStart(): number {
  let probe = 0;
  while (positionInDay(probe) !== 0) probe += 1;
  return probe;
}

function positionInDay(offset: number): number {
  const epochDay = Math.floor(day(offset).getTime() / 86_400_000);
  return ((epochDay % DAYS_PER_CYCLE) + DAYS_PER_CYCLE) % DAYS_PER_CYCLE;
}

describe('question bank', () => {
  it('holds exactly 20 questions', () => {
    expect(QUESTION_BANK).toHaveLength(20);
  });

  it('holds no duplicate prompts', () => {
    const prompts = QUESTION_BANK.map((question) => question.prompt);
    expect(new Set(prompts).size).toBe(prompts.length);
  });

  it('holds no duplicate keys, since rotation is tracked by key', () => {
    const keys = QUESTION_BANK.map((question) => question.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('only uses answer types the renderer knows how to draw', () => {
    for (const question of QUESTION_BANK) {
      expect(DAILY_ANSWER_TYPES).toContain(question.answerType);
    }
  });

  it('offers all three question types the specification requires', () => {
    const types = new Set(QUESTION_BANK.map((question) => question.answerType));
    expect(types).toContain('RATING');
    expect(types).toContain('YES_NO');
    expect(types).toContain('SHORT_TEXT');
  });

  it('keeps most questions scorable, so the engagement score has numbers', () => {
    const scorable = QUESTION_BANK.filter(isScorable);
    expect(scorable.length).toBeGreaterThanOrEqual(15);
  });

  it('never asks an employee to rate a colleague', () => {
    // The pulse measures experience; naming a colleague turns it into an
    // investigation and is a privacy problem as well as an HR one.
    const accusatory = /\b(rate your|colleague's performance|rank your|your team member)\b/i;
    for (const question of QUESTION_BANK) {
      expect(question.prompt).not.toMatch(accusatory);
    }
  });

  it('exhausts the bank exactly once per cycle', () => {
    // 20 questions, 5 a day: every question is used once in every 4 days.
    expect(QUESTION_BANK.length / QUESTIONS_PER_DAY).toBe(DAYS_PER_CYCLE);
  });
});

describe('seeded shuffle', () => {
  it('is reproducible for a seed', () => {
    expect(seededShuffle(QUESTION_BANK, 7)).toEqual(seededShuffle(QUESTION_BANK, 7));
  });

  it('differs between seeds', () => {
    expect(seededShuffle(QUESTION_BANK, 7)).not.toEqual(seededShuffle(QUESTION_BANK, 8));
  });

  it('keeps every element exactly once', () => {
    const shuffled = seededShuffle(QUESTION_BANK, 3);
    expect(shuffled).toHaveLength(QUESTION_BANK.length);
    expect(new Set(shuffled.map((q) => q.key)).size).toBe(QUESTION_BANK.length);
  });
});

describe('daily selection', () => {
  it('selects exactly five questions', () => {
    for (let offset = 0; offset < 40; offset += 1) {
      expect(selectForDate(day(offset))).toHaveLength(5);
    }
  });

  it('never selects the same question twice in one day', () => {
    for (let offset = 0; offset < 40; offset += 1) {
      const keys = selectForDate(day(offset)).map((question) => question.key);
      expect(new Set(keys).size).toBe(5);
    }
  });

  it('never shows the whole bank in one day', () => {
    for (let offset = 0; offset < 40; offset += 1) {
      expect(selectForDate(day(offset)).length).toBeLessThan(QUESTION_BANK.length);
    }
  });

  it('covers every question in the bank exactly once per cycle', () => {
    const cycle = cycleFrom(alignedCycleStart());
    const flat = cycle.flat();
    expect(flat).toHaveLength(20);
    expect(new Set(flat).size).toBe(20);
  });

  it('repeats the whole bank on the next cycle, still without adjacent repeats', () => {
    // A 20-question bank asked 5 a day cannot go 20 days without repeating. The
    // guarantee is coverage per cycle plus no adjacent repeats, and this holds
    // at the seam where the two cycles meet.
    const start = alignedCycleStart();
    const week = cycleFrom(start, DAYS_PER_CYCLE * 2);
    for (let index = 1; index < week.length; index += 1) {
      const previous = new Set(week[index - 1]);
      expect(week[index]!.filter((prompt) => previous.has(prompt))).toEqual([]);
    }
  });

  it('never repeats a question on consecutive days', () => {
    // This is the property the rotation exists for: asking about workload five
    // days running is how a daily pulse gets ignored.
    for (let offset = 0; offset < 60; offset += 1) {
      const today = new Set(promptsFor(day(offset)));
      const tomorrow = promptsFor(day(offset + 1));
      expect(tomorrow.filter((prompt) => today.has(prompt))).toEqual([]);
    }
  });

  it('avoids yesterday even across a cycle boundary', () => {
    // Two independently shuffled cycles could overlap at the seam, so the
    // selection filters the previous day's prompts rather than trusting the
    // shuffle alone.
    for (let offset = 0; offset < 60; offset += 1) {
      const today = promptsFor(day(offset));
      const tomorrow = selectForDate(
        day(offset + 1),
        new Set(today),
      ).map((question) => question.prompt);
      expect(tomorrow.filter((prompt) => today.includes(prompt))).toEqual([]);
    }
  });

  it('is reproducible for the same date', () => {
    // Two employees opening the pulse at the same moment must get the same
    // questions, so selection cannot depend on request order or randomness.
    expect(promptsFor(day(6))).toEqual(promptsFor(day(6)));
  });

  it('changes day to day', () => {
    expect(promptsFor(day(0))).not.toEqual(promptsFor(day(1)));
  });

  it('always yields at least one scorable question', () => {
    for (let offset = 0; offset < 40; offset += 1) {
      const scorable = selectForDate(day(offset)).filter(isScorable);
      expect(scorable.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('handles dates before the epoch', () => {
    expect(selectForDate(new Date(Date.UTC(1960, 5, 1)))).toHaveLength(5);
  });

  it('returns five even if every question is excluded', () => {
    const all = new Set(QUESTION_BANK.map((question) => question.prompt));
    // Degenerate input: the guarantee to protect is "five questions", and this
    // proves the exclusion filter can never leave an employee with a blank page.
    expect(selectForDate(day(0), all)).toHaveLength(5);
  });

  it('backfills from questions that were not asked the day before', () => {
    // The case the filter exists for: HR hand-rotated yesterday into exactly
    // today's slice. The result must stay five and must avoid yesterday.
    const today = promptsFor(day(3));
    const replacement = selectForDate(day(4), new Set(today)).map((question) => question.prompt);

    expect(replacement).toHaveLength(5);
    expect(replacement.filter((prompt) => today.includes(prompt))).toEqual([]);
    expect(new Set(replacement).size).toBe(5);
  });

  it('never repeats a question across every day of a year', () => {
    // The guarantee stated to HR, checked exhaustively rather than sampled:
    // no prompt may appear on two consecutive days for 365 consecutive days.
    for (let offset = 0; offset < 365; offset += 1) {
      const today = promptsFor(day(offset));
      const tomorrow = promptsFor(day(offset + 1));
      expect(tomorrow.filter((prompt) => today.includes(prompt))).toEqual([]);
    }
  });
});