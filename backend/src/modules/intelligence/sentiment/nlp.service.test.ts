import { describe, expect, it } from 'vitest';
import { parseSentimentJson } from './nlp.service';
import { analyseSentimentLexicon, detectThemesLexicon } from './lexicon';

describe('parseSentimentJson', () => {
  it('parses a clean model response', () => {
    const parsed = parseSentimentJson(
      '{"label":"NEGATIVE","score":-0.72,"confidence":0.9,"themes":["WORKLOAD"]}',
    );

    expect(parsed).not.toBeNull();
    expect(parsed?.label).toBe('NEGATIVE');
    expect(parsed?.score).toBeCloseTo(-0.72);
    expect(parsed?.confidence).toBeCloseTo(0.9);
    expect(parsed?.themes).toHaveLength(1);
    expect(parsed?.themes[0]?.theme).toBe('WORKLOAD');
  });

  it('tolerates a fenced code block and surrounding prose', () => {
    const parsed = parseSentimentJson(
      'Here is the result:\n```json\n{"label":"POSITIVE","score":0.4,"confidence":0.8}\n```\nHope that helps.',
    );

    expect(parsed).not.toBeNull();
    expect(parsed?.label).toBe('POSITIVE');
    expect(parsed?.score).toBeCloseTo(0.4);
  });

  it('accepts `sentiment` as an alias for `label`', () => {
    expect(parseSentimentJson('{"sentiment":"NEUTRAL","score":0}')?.label).toBe('NEUTRAL');
  });

  it('rejects a label outside the three allowed classes', () => {
    // `MIXED` exists for hand-entered values but is never a model output, so
    // accepting it here would let an unclassifiable item enter the pipeline.
    expect(parseSentimentJson('{"label":"MIXED","score":0.2}')).toBeNull();
    expect(parseSentimentJson('{"label":"ANGRY","score":-0.5}')).toBeNull();
  });

  it('returns null rather than guessing on malformed input', () => {
    expect(parseSentimentJson('not json at all')).toBeNull();
    expect(parseSentimentJson('{"label":"POSITIVE"}')).toBeNull();
    expect(parseSentimentJson('{"label":"POSITIVE","score":"very bad"}')).toBeNull();
    expect(parseSentimentJson('')).toBeNull();
  });

  it('clamps an out-of-range score instead of storing it', () => {
    expect(parseSentimentJson('{"label":"POSITIVE","score":5}')?.score).toBe(1);
    expect(parseSentimentJson('{"label":"NEGATIVE","score":-9}')?.score).toBe(-1);
  });

  it('defaults confidence modestly when the model omits it', () => {
    // A model that states a label but no confidence has still asserted
    // something, so a neutral default is fairer than reporting full trust.
    expect(parseSentimentJson('{"label":"NEUTRAL","score":0}')?.confidence).toBeCloseTo(0.6);
  });

  it('drops themes that are not in the published set', () => {
    const parsed = parseSentimentJson(
      '{"label":"NEUTRAL","score":0,"themes":["WORKLOAD","PARANOI","PRODUCT_OWNERSHIP"]}',
    );
    expect(parsed?.themes.map((theme) => theme.theme)).toEqual(['WORKLOAD']);
  });
});

describe('lexicon sentiment', () => {
  it('reads clear negative workplace language as negative', () => {
    const result = analyseSentimentLexicon(
      'I am completely overwhelmed by the workload and my manager does not listen.',
    );
    expect(result.label).toBe('NEGATIVE');
    expect(result.polarity).toBeLessThan(0);
  });

  it('reads clear positive workplace language as positive', () => {
    const result = analyseSentimentLexicon(
      'My team is supportive and I feel valued and appreciated here.',
    );
    expect(result.label).toBe('POSITIVE');
    expect(result.polarity).toBeGreaterThan(0);
  });

  it('finds nothing in text with no sentiment vocabulary', () => {
    const result = analyseSentimentLexicon('The meeting is scheduled for Tuesday at ten.');
    expect(result.matches).toHaveLength(0);
    expect(result.label).toBe('NEUTRAL');
  });

  it('lets an intensifier strengthen the term that follows it', () => {
    const plain = analyseSentimentLexicon('The onboarding process was overwhelming.');
    const intense = analyseSentimentLexicon('The onboarding process was extremely overwhelming.');
    expect(Math.abs(intense.polarity)).toBeGreaterThan(Math.abs(plain.polarity));
  });

  it('lets a negator flip the sign of the term that follows it', () => {
    const positive = analyseSentimentLexicon('My manager is supportive.');
    const negated = analyseSentimentLexicon('My manager is not supportive.');
    expect(negated.polarity).toBeLessThan(positive.polarity);
  });

  it('ignores a modifier that is too far from the term', () => {
    // "extremely" only counts within the three-token window before a term.
    // Push it further back by lengthening the gap and the score must not move.
    const withIntensifier = analyseSentimentLexicon('It was extremely overwhelming.');
    const withoutIntensifier = analyseSentimentLexicon('It was overwhelming.');
    expect(withIntensifier.polarity).not.toBe(withoutIntensifier.polarity);

    // Same intensifier, but pushed outside the three-token window by neutral
    // filler, so it must have no effect at all.
    const tooFar = analyseSentimentLexicon('It was, in my honest opinion, quite overwhelming.');
    expect(tooFar.polarity).toBe(withoutIntensifier.polarity);
  });
});

describe('lexicon themes', () => {
  it('detects the published themes from keyword evidence', () => {
    const themes = detectThemesLexicon(
      'The workload is unmanageable, my manager gives no feedback, and I have had no training all year.',
    );
    const found = themes.map((theme) => theme.theme);

    expect(found).toContain('WORKLOAD');
    expect(found).toContain('MANAGEMENT');
    expect(found).toContain('LEARNING');
  });

  it('only ever returns themes from the published set', () => {
    const themes = detectThemesLexicon('Workload, management, team, learning, career, environment, catering.');
    const allowed = new Set([
      'WORKLOAD',
      'MANAGEMENT',
      'TEAM',
      'LEARNING',
      'CAREER_GROWTH',
      'WORK_ENVIRONMENT',
    ]);
    for (const theme of themes) expect(allowed.has(theme.theme)).toBe(true);
  });

  it('reports the matched terms as evidence', () => {
    const themes = detectThemesLexicon('The workload is far too heavy right now.');
    const workload = themes.find((theme) => theme.theme === 'WORKLOAD');
    expect(workload?.evidence.length).toBeGreaterThan(0);
  });
});
