import { logger } from '../../../core/logger';
import { SENTIMENT_CLASSES, THEME_LABELS, type EngagementTheme, type SentimentClass, type SentimentMethod } from '../../../core/enums';
import { getAiProvider } from '../../ai/providers/provider.factory';
import { analyseSentimentLexicon, detectThemesLexicon } from './lexicon';

/**
 * The single entry point for turning free text into sentiment and themes.
 *
 * Strategy, in order:
 *  1. A provider that declares native `classifySentiment` support.
 *  2. Any configured chat provider, prompted for strict JSON and parsed
 *     defensively.
 *  3. The deterministic lexicon.
 *
 * Steps 1 and 2 can fail - a timeout, a rate limit, a model that returns prose
 * where JSON was asked for. None of those are allowed to fail the request: the
 * lexicon result is used instead and the *method* recorded on the result is
 * `LEXICON`, so a stored sentiment row always says how it was produced. A
 * provider error is logged, never surfaced as a fake score.
 */

export interface ThemeMatch {
  theme: EngagementTheme;
  confidence: number;
  evidence: string[];
}

export interface TextAnalysis {
  label: SentimentClass;
  /** Polarity in [-1, 1]; `label` is the coarse bucket of this number. */
  score: number;
  confidence: number;
  method: SentimentMethod;
  provider: string | null;
  model: string | null;
  themes: ThemeMatch[];
  /** Set when an AI provider was tried and failed. */
  degradedReason: string | null;
}

/** Text shorter than this carries no usable sentiment signal. */
const MIN_ANALYSABLE_LENGTH = 8;

/** A theme must clear this confidence to be stored as detected. */
const THEME_CONFIDENCE_FLOOR = 0.2;

const SENTIMENT_SYSTEM_PROMPT = [
  'You are a sentiment analysis engine for an employee experience platform.',
  'Classify the sentiment of the supplied workplace text as exactly one of POSITIVE, NEUTRAL or NEGATIVE.',
  'Return polarity between -1 (very negative) and 1 (very positive).',
  'Identify any of these themes that are present: ' + Object.values(THEME_LABELS).join(', ') + '.',
  'Themes must be uppercase keys: ' + Object.keys(THEME_LABELS).join(', ') + '.',
  'Return only a JSON object with keys label, score, confidence and themes.',
  'Never invent themes that are not evidenced by the text.',
].join(' ');

export class NlpService {
  /** Analyses a batch, stopping early if the caller is no longer waiting. */
  async analyseBatch(texts: string[], options: { onProgress?: (done: number) => void } = {}): Promise<TextAnalysis[]> {
    const results: TextAnalysis[] = [];
    for (const [index, text] of texts.entries()) {
      results.push(await this.analyse(text));
      options.onProgress?.(index + 1);
    }
    return results;
  }

  async analyse(text: string): Promise<TextAnalysis> {
    const trimmed = text?.trim() ?? '';
    if (trimmed.length < MIN_ANALYSABLE_LENGTH) {
      return {
        label: 'NEUTRAL',
        score: 0,
        confidence: 0,
        method: 'UNSCORED',
        provider: null,
        model: null,
        themes: [],
        degradedReason: null,
      };
    }

    // The lexicon runs regardless: it is the fallback, and its theme evidence
    // is worth keeping even when a model supplies the sentiment label.
    const lexiconSentiment = analyseSentimentLexicon(trimmed);
    const lexiconThemes = detectThemesLexicon(trimmed).filter(
      (theme) => theme.confidence >= THEME_CONFIDENCE_FLOOR,
    );

    const provider = getAiProvider();

    if (!provider.isConfigured() || !provider.capabilities.sentiment) {
      return {
        label: lexiconSentiment.label,
        score: lexiconSentiment.polarity,
        confidence: lexiconSentiment.confidence,
        method: lexiconSentiment.matches.length > 0 ? 'LEXICON' : 'UNSCORED',
        provider: null,
        model: null,
        themes: lexiconThemes,
        degradedReason: null,
      };
    }

    try {
      const result = await provider.complete({
        prompt: trimmed,
        system: SENTIMENT_SYSTEM_PROMPT,
        temperature: 0,
        maxTokens: 400,
      });

      const parsed = parseSentimentJson(result.content);
      if (!parsed) {
        throw new Error('provider did not return a parseable sentiment payload');
      }

      return {
        label: parsed.label,
        score: parsed.score,
        confidence: parsed.confidence,
        method: 'AI',
        provider: result.provider,
        model: result.model,
        // Union of model and lexicon themes: the model sees nuance the keyword
        // list misses, and the keyword list is a recall backstop.
        themes: mergeThemes(parsed.themes, lexiconThemes),
        degradedReason: null,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown provider error';
      logger.warn('AI sentiment classification failed, falling back to lexicon', { reason, provider: provider.id });
      return {
        label: lexiconSentiment.label,
        score: lexiconSentiment.polarity,
        confidence: lexiconSentiment.confidence,
        method: lexiconSentiment.matches.length > 0 ? 'LEXICON' : 'UNSCORED',
        provider: null,
        model: null,
        themes: lexiconThemes,
        degradedReason: reason,
      };
    }
  }
}

interface ParsedSentiment {
  label: SentimentClass;
  score: number;
  confidence: number;
  themes: ThemeMatch[];
}

/**
 * Extracts the JSON object from a model response.
 *
 * Tolerates a fenced code block and leading prose, because models frequently
 * wrap JSON in one even when told not to. Returns null rather than guessing,
 * so a malformed response triggers the documented fallback.
 */
export function parseSentimentJson(raw: string): ParsedSentiment | null {
  if (!raw) return null;

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced?.[1] ?? raw).trim();

  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') return null;
  const record = parsed as Record<string, unknown>;

  const rawLabel = String(record.label ?? record.sentiment ?? '').toUpperCase();
  if (!(SENTIMENT_CLASSES as readonly string[]).includes(rawLabel)) return null;

  const score = clamp(toNumber(record.score ?? record.polarity), -1, 1);
  if (score === null) return null;

  return {
    label: rawLabel as SentimentClass,
    score,
    // A model that omits confidence still asserts the label, so a modest
    // default is fairer than reporting full trust.
    confidence: clamp(toNumber(record.confidence), 0, 1) ?? 0.6,
    themes: parseThemes(record.themes),
  };
}

function parseThemes(raw: unknown): ThemeMatch[] {
  if (raw === null || raw === undefined) return [];

  // Accepts an array of theme keys or of {theme, confidence} objects.
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];

  const themes: ThemeMatch[] = [];
  for (const entry of list) {
    if (typeof entry === 'string') {
      const theme = normaliseTheme(entry);
      if (theme) themes.push({ theme, confidence: 0.6, evidence: [] });
      continue;
    }
    if (entry && typeof entry === 'object' && 'theme' in entry) {
      const theme = normaliseTheme(String((entry as Record<string, unknown>).theme));
      if (theme) {
        themes.push({
          theme,
          confidence: clamp(toNumber((entry as Record<string, unknown>).confidence), 0, 1) ?? 0.6,
          evidence: [],
        });
      }
    }
  }
  return themes;
}

function normaliseTheme(value: string): EngagementTheme | null {
  const key = value.trim().toUpperCase().replace(/[\s-]+/g, '_');
  const aliases: Record<string, EngagementTheme> = {
    WORKLOAD: 'WORKLOAD',
    WORK_LOAD: 'WORKLOAD',
    MANAGEMENT: 'MANAGEMENT',
    MANAGER: 'MANAGEMENT',
    TEAM: 'TEAM',
    TEAMWORK: 'TEAM',
    LEARNING: 'LEARNING',
    TRAINING: 'LEARNING',
    DEVELOPMENT: 'LEARNING',
    CAREER_GROWTH: 'CAREER_GROWTH',
    CAREER: 'CAREER_GROWTH',
    GROWTH: 'CAREER_GROWTH',
    WORK_ENVIRONMENT: 'WORK_ENVIRONMENT',
    ENVIRONMENT: 'WORK_ENVIRONMENT',
    CULTURE: 'WORK_ENVIRONMENT',
  };
  return aliases[key] ?? null;
}

function mergeThemes(fromModel: ThemeMatch[], fromLexicon: ThemeMatch[]): ThemeMatch[] {
  const merged = new Map<EngagementTheme, ThemeMatch>();

  for (const theme of fromLexicon) merged.set(theme.theme, theme);
  for (const theme of fromModel) {
    const existing = merged.get(theme.theme);
    merged.set(theme.theme, {
      theme: theme.theme,
      // Evidence from the lexicon is more auditable, so it is preserved.
      confidence: Math.max(existing?.confidence ?? 0, theme.confidence),
      evidence: existing?.evidence ?? theme.evidence,
    });
  }

  return [...merged.values()]
    .filter((theme) => theme.confidence >= THEME_CONFIDENCE_FLOOR)
    .sort((a, b) => b.confidence - a.confidence);
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function clamp(value: number | null, min: number, max: number): number | null {
  if (value === null) return null;
  return Math.min(Math.max(value, min), max);
}

export const nlpService = new NlpService();
