import { describe, expect, it } from 'vitest';
import { DAILY_ANSWER_TYPES, QUESTION_TOPICS } from '../../core/enums';
import {
  DAILY_QUESTION_SHAPE,
  QUESTION_BANK,
  bankQuestionsFor,
  normalisePrompt,
} from './question-bank';
import { parseGeneratedQuestions, pickFromBank } from './daily-question.generator';

/**
 * Pure selection and parsing tests - no database, no provider.
 *
 * The properties defended here are the ones an employee would notice: five
 * questions, the right kinds of question, and not the same ones as yesterday.
 */

const day = (offset: number) => new Date(Date.UTC(2026, 2, 1 + offset));

describe('question bank', () => {
  it('supplies every topic the daily pulse is required to cover', () => {
    for (const topic of QUESTION_TOPICS) {
      expect(bankQuestionsFor(topic).length).toBeGreaterThan(0);
    }
  });

  it('gives every topic at least one question of each kind the shape needs', () => {
    // A pool that is thin on ratings or texts would force the selector to
    // duplicate a topic, which is the repetition the rotation exists to stop.
    for (const topic of QUESTION_TOPICS) {
      const questions = bankQuestionsFor(topic);
      expect(questions.filter((q) => q.answerType === 'RATING').length).toBeGreaterThanOrEqual(1);
      expect(questions.filter((q) => q.answerType === 'YES_NO').length).toBeGreaterThanOrEqual(1);
      expect(questions.filter((q) => q.answerType === 'SHORT_TEXT').length).toBeGreaterThanOrEqual(1);
    }
  });

  it('uses unique keys, since rotation is tracked by key', () => {
    const keys = QUESTION_BANK.map((question) => question.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('never asks an employee to rate a colleague', () => {
    // The pulse measures experience; naming a colleague turns it into an
    // investigation and is a privacy problem as well as an HR one.
    const accusatory = /\b(your colleague|your manager's performance|rank your|team member)\b/i;
    for (const question of QUESTION_BANK) {
      expect(question.prompt).not.toMatch(accusatory);
    }
  });

  it('keeps prompts short enough to answer at a glance', () => {
    for (const question of QUESTION_BANK) {
      expect(question.prompt.length).toBeLessThanOrEqual(120);
    }
  });
});

describe('bank selection', () => {
  it('returns exactly five questions in the required mix', () => {
    for (let offset = 0; offset < 20; offset += 1) {
      const picked = pickFromBank(day(offset));
      expect(picked).toHaveLength(5);

      // Keyed over every answer type so an unexpected type is counted rather
      // than silently dropped by an index that does not exist.
      const counts = Object.fromEntries(
        DAILY_ANSWER_TYPES.map((type) => [type, 0]),
      ) as Record<(typeof DAILY_ANSWER_TYPES)[number], number>;
      for (const question of picked) counts[question.answerType] += 1;

      expect(counts.RATING).toBe(DAILY_QUESTION_SHAPE.rating);
      expect(counts.YES_NO).toBe(DAILY_QUESTION_SHAPE.yesNo);
      expect(counts.SHORT_TEXT).toBe(DAILY_QUESTION_SHAPE.shortText);
      // Nothing else is allowed in: the count has to add up to five.
      expect(Object.values(counts).reduce((sum, count) => sum + count, 0)).toBe(5);
    }
  });

  it('only uses answer types the renderer knows how to draw', () => {
    for (let offset = 0; offset < 20; offset += 1) {
      for (const question of pickFromBank(day(offset))) {
        expect(DAILY_ANSWER_TYPES).toContain(question.answerType);
      }
    }
  });

  it('spreads a day across five different topics', () => {
    for (let offset = 0; offset < 20; offset += 1) {
      const topics = pickFromBank(day(offset)).map((question) => question.topic);
      expect(new Set(topics).size).toBe(5);
    }
  });

  it('is reproducible for a given date', () => {
    // Seeded by date so regenerating a day nobody answered returns the same
    // questions rather than a surprise.
    expect(pickFromBank(day(3))).toEqual(pickFromBank(day(3)));
  });

  it('differs between days', () => {
    const first = pickFromBank(day(0)).map((q) => normalisePrompt(q.prompt));
    const later = new Set(
      [1, 2, 3, 4, 5, 6].flatMap((offset) => pickFromBank(day(offset)).map((q) => normalisePrompt(q.prompt))),
    );
    expect(later.size).toBeGreaterThan(first.length);
  });

  it('prefers questions that were not asked recently', () => {
    // Mark a whole type's worth of pool as recently used and check the selector
    // routes around them where it can.
    const seen = pickFromBank(day(0));
    const avoided = seen
      .filter((q) => q.answerType === 'SHORT_TEXT')
      .map((q) => normalisePrompt(q.prompt));

    const next = pickFromBank(day(1), new Set(avoided));
    const textQuestions = next.filter((q) => q.answerType === 'SHORT_TEXT');
    expect(textQuestions).toHaveLength(1);
    for (const question of textQuestions) {
      expect(avoided).not.toContain(normalisePrompt(question.prompt));
    }
  });

  it('still returns five when almost everything has been used recently', () => {
    // Rotation must never shrink the set: five questions is the contract, and
    // an exhausted pool is a reason to repeat, not to under-ask.
    const everything = new Set(QUESTION_BANK.map((q) => normalisePrompt(q.prompt)));
    expect(pickFromBank(day(0), everything)).toHaveLength(5);
  });
});

describe('prompt comparison', () => {
  it('ignores case and punctuation', () => {
    expect(normalisePrompt('How was your workload today?')).toBe(
      normalisePrompt('how was your workload today'),
    );
  });

  it('separates genuinely different questions', () => {
    expect(normalisePrompt('How was your workload today?')).not.toBe(
      normalisePrompt('How was your team today?'),
    );
  });
});

describe('generated-question parsing', () => {
  const good = JSON.stringify([
    { prompt: 'How was your day?', answerType: 'RATING', helpText: '', topic: 'ENGAGEMENT' },
    { prompt: 'How was your workload?', answerType: 'RATING', helpText: '', topic: 'WORKLOAD' },
    { prompt: 'How was your focus?', answerType: 'RATING', helpText: '', topic: 'SATISFACTION' },
    { prompt: 'Did you feel supported?', answerType: 'YES_NO', helpText: '', topic: 'MANAGER_SUPPORT' },
    { prompt: 'Anything to tell us?', answerType: 'SHORT_TEXT', helpText: '', topic: 'OVERALL_EXPERIENCE' },
  ]);

  it('accepts a well-formed set', () => {
    const parsed = parseGeneratedQuestions(good);
    expect(parsed).toHaveLength(5);
    expect(parsed?.map((q) => q.answerType)).toEqual([
      'RATING',
      'RATING',
      'RATING',
      'YES_NO',
      'SHORT_TEXT',
    ]);
  });

  it('tolerates a fenced code block', () => {
    const parsed = parseGeneratedQuestions('Here you go:\n```json\n' + good + '\n```');
    expect(parsed).toHaveLength(5);
  });

  it('rejects the wrong number of questions', () => {
    expect(parseGeneratedQuestions('[]')).toBeNull();
    // Four questions is as wrong as six: the submission contract is exactly five.
    expect(parseGeneratedQuestions(JSON.stringify(JSON.parse(good).slice(0, 4)))).toBeNull();
    expect(parseGeneratedQuestions(JSON.stringify([...JSON.parse(good), { prompt: 'Sixth?', answerType: 'RATING', helpText: '', topic: 'LEARNING' }]))).toBeNull();
  });

  it('rejects a set that breaks the answer-type mix', () => {
    // Five ratings would leave the pulse with no prose for sentiment analysis.
    const allRatings = JSON.stringify(
      Array.from({ length: 5 }, (_, i) => ({
        prompt: `Question number ${i}`,
        answerType: 'RATING',
        helpText: '',
        topic: QUESTION_TOPICS[i],
      })),
    );
    expect(parseGeneratedQuestions(allRatings)).toBeNull();
  });

  it('rejects an unknown answer type or topic', () => {
    const badType = good.replace('"YES_NO"', '"EMOJI_SCALE"');
    expect(parseGeneratedQuestions(badType)).toBeNull();

    const badTopic = good.replace('"WORKLOAD"', '"PENGUINS"');
    expect(parseGeneratedQuestions(badTopic)).toBeNull();
  });

  it('rejects duplicate prompts', () => {
    const duplicated = good.replace('How was your workload?', 'How was your day?');
    expect(parseGeneratedQuestions(duplicated)).toBeNull();
  });

  it('rejects a set that repeats a topic', () => {
    const repeated = good.replace('"MANAGER_SUPPORT"', '"WORKLOAD"');
    expect(parseGeneratedQuestions(repeated)).toBeNull();
  });

  it('rejects a question that repeats a recent one', () => {
    const recent = new Set([normalisePrompt('How was your workload?')]);
    expect(parseGeneratedQuestions(good, recent)).toBeNull();
  });

  it('rejects anything that is not a JSON array', () => {
    expect(parseGeneratedQuestions('not json at all')).toBeNull();
    expect(parseGeneratedQuestions('{"questions":[]}')).toBeNull();
    expect(parseGeneratedQuestions('')).toBeNull();
  });

it('strips control characters from model-authored text', () => {
    // Raw control bytes in a JSON string literal make the document unparseable,
    // so they arrive escaped and decode into real characters - which is the
    // case that actually has to be cleaned before rendering.
    const injected = good.replace(
      'How was your day?',
      'How was your\\u0000day\\u0007?',
    );
    const parsed = parseGeneratedQuestions(injected);
    expect(parsed?.[0]?.prompt).toBe('How was your day ?');
  });

  it('truncates an over-long prompt rather than storing it whole', () => {
    const long = 'A'.repeat(500);
    const parsed = parseGeneratedQuestions(good.replace('How was your day?', long));
    expect(parsed?.[0]?.prompt.length).toBeLessThanOrEqual(240);
  });
});
