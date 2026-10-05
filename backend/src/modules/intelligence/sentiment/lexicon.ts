import { ENGAGEMENT_THEMES, type EngagementTheme, type SentimentClass } from '../../../core/enums';

/**
 * A small, explicit lexicon for the deterministic analyser.
 *
 * This is NOT presented as NLP intelligence: it is a transparent baseline that
 * (a) keeps sentiment reporting honest before a model provider is connected,
 * (b) gives theme evidence a human can audit, and (c) acts as the fallback when
 * a configured model errors. Every result it produces is stored with
 * `method = LEXICON`, so the product can always say which analyser ran.
 *
 * Weighting is intentionally simple: each term contributes its `weight`, negated
 * terms flip sign, and intensifiers scale the window that follows them. It will
 * misread sarcasm and mixed clauses - which is exactly why a model, when
 * configured, takes priority.
 */

interface Term {
  /** Lower-case term or phrase matched on word boundaries. */
  term: string;
  weight: number;
  /** Words that invert the meaning of a nearby term, e.g. "not". */
  handledBy?: 'negation' | 'intensifier';
}

const POSITIVE: Term[] = [
  { term: 'thank you', weight: 1.2 },
  { term: 'thanks', weight: 1 },
  { term: 'grateful', weight: 1.2 },
  { term: 'appreciate', weight: 1.1 },
  { term: 'brilliant', weight: 1.4 },
  { term: 'excellent', weight: 1.4 },
  { term: 'amazing', weight: 1.4 },
  { term: 'awesome', weight: 1.4 },
  { term: 'wonderful', weight: 1.3 },
  { term: 'fantastic', weight: 1.4 },
  { term: 'great', weight: 1 },
  { term: 'good', weight: 0.8 },
  { term: 'happy', weight: 1.1 },
  { term: 'glad', weight: 0.9 },
  { term: 'enjoy', weight: 1 },
  { term: 'enjoyed', weight: 1 },
  { term: 'love', weight: 1.1 },
  { term: 'supported', weight: 1 },
  { term: 'supportive', weight: 1.1 },
  { term: 'helpful', weight: 0.9 },
  { term: 'collaborative', weight: 1 },
  { term: 'inclusive', weight: 1 },
  { term: 'fair', weight: 0.8 },
  { term: 'respectful', weight: 1.1 },
  { term: 'valued', weight: 1.1 },
  { term: 'appreciated', weight: 1.2 },
  { term: 'recognised', weight: 1 },
  { term: 'recognized', weight: 1 },
  { term: 'empowered', weight: 1.1 },
  { term: 'motivated', weight: 1.1 },
  { term: 'engaged', weight: 1 },
  { term: 'energised', weight: 1.1 },
  { term: 'energized', weight: 1.1 },
  { term: 'motivated me', weight: 1.2 },
  { term: 'opportunity', weight: 0.6 },
  { term: 'support', weight: 0.7 },
  { term: 'positive', weight: 1 },
  { term: 'improve', weight: 0.5 },
  { term: 'improving', weight: 0.6 },
  { term: 'better', weight: 0.5 },
  { term: 'flexible', weight: 0.8 },
  { term: 'trust', weight: 0.8 },
  { term: 'confidence', weight: 0.7 },
  { term: 'proud', weight: 1.1 },
  { term: 'successful', weight: 0.9 },
  { term: 'work life balance', weight: 1 },
  { term: 'work-life balance', weight: 1 },
];

const NEGATIVE: Term[] = [
  { term: 'unacceptable', weight: -1.8 },
  { term: 'exhausting', weight: -1.5 },
  { term: 'exhausted', weight: -1.5 },
  { term: 'draining', weight: -1.4 },
  { term: 'drained', weight: -1.4 },
  { term: 'burnout', weight: -1.7 },
  { term: 'burnt out', weight: -1.7 },
  { term: 'overwhelmed', weight: -1.5 },
  { term: 'overwhelming', weight: -1.4 },
  { term: 'understaffed', weight: -1.5 },
  { term: 'underpaid', weight: -1.6 },
  { term: 'unfair', weight: -1.5 },
  { term: 'toxic', weight: -1.8 },
  { term: 'hostile', weight: -1.8 },
  { term: 'bully', weight: -1.9 },
  { term: 'bullying', weight: -1.9 },
  { term: 'harassment', weight: -2 },
  { term: 'harassed', weight: -2 },
  { term: 'discriminated', weight: -2 },
  { term: 'discrimination', weight: -2 },
  { term: 'frustrated', weight: -1.2 },
  { term: 'frustrating', weight: -1.3 },
  { term: 'stressed', weight: -1.3 },
  { term: 'stress', weight: -1.1 },
  { term: 'anxious', weight: -1.3 },
  { term: 'anxiety', weight: -1.3 },
  { term: 'worried', weight: -1.1 },
  { term: 'concerned', weight: -0.7 },
  { term: 'disappointed', weight: -1.4 },
  { term: 'disappointing', weight: -1.4 },
  { term: 'upset', weight: -1.2 },
  { term: 'angry', weight: -1.5 },
  { term: 'furious', weight: -1.8 },
  { term: 'ignored', weight: -1.4 },
  { term: 'neglected', weight: -1.4 },
  { term: 'undervalued', weight: -1.5 },
  { term: 'unvalued', weight: -1.4 },
  { term: 'unappreciated', weight: -1.5 },
  { term: 'unfairly', weight: -1.4 },
  { term: 'poor', weight: -0.9 },
  { term: 'bad', weight: -0.9 },
  { term: 'terrible', weight: -1.6 },
  { term: 'awful', weight: -1.6 },
  { term: 'horrible', weight: -1.6 },
  { term: 'worse', weight: -0.9 },
  { term: 'worst', weight: -1.4 },
  { term: 'hate', weight: -1.5 },
  { term: 'no support', weight: -1.4 },
  { term: 'lack of support', weight: -1.5 },
  { term: 'no growth', weight: -1.3 },
  { term: 'no feedback', weight: -1.1 },
  { term: 'no recognition', weight: -1.3 },
  { term: 'never heard', weight: -1.2 },
  { term: 'ignored feedback', weight: -1.4 },
  { term: 'always expected', weight: -1.1 },
  { term: 'endless', weight: -1 },
  { term: 'impossible', weight: -1.3 },
  { term: 'deadline', weight: -0.4 },
  { term: 'deadlines', weight: -0.5 },
  { term: 'long hours', weight: -1.2 },
  { term: 'work late', weight: -0.9 },
  { term: 'workload', weight: -0.5 },
  { term: 'under-resourced', weight: -1.2 },
  { term: 'no resources', weight: -1.2 },
  { term: 'ignored concerns', weight: -1.5 },
  { term: 'unsafe', weight: -1.6 },
  { term: 'unwelcoming', weight: -1.2 },
  { term: 'isolated', weight: -1.3 },
];

const NEGATORS = ['not', 'no', 'never', 'cannot', "can't", 'without', 'hardly', 'barely', 'stopped', 'quit', 'lack of', 'absence of'];
const INTENSIFIERS: Record<string, number> = {
  very: 1.4,
  really: 1.4,
  extremely: 1.6,
  incredibly: 1.6,
  so: 1.25,
  totally: 1.4,
  completely: 1.4,
  absolutely: 1.5,
  constantly: 1.5,
  always: 1.35,
  increasingly: 1.3,
  deeply: 1.4,
};
const DIMINISHERS: Record<string, number> = {
  slightly: 0.6,
  somewhat: 0.65,
  a: 0.5,
  bit: 0.6,
  little: 0.6,
  mildly: 0.6,
  occasionally: 0.7,
};

/**
 * Theme vocabulary. Themes are the actionable output of the pipeline, so each
 * list is written from the perspective of "what would someone complain about or
 * praise here" rather than from a dictionary of HR jargon.
 */
const THEME_TERMS: Record<EngagementTheme, Term[]> = {
  WORKLOAD: [
    { term: 'workload', weight: 1 },
    { term: 'deadline', weight: 0.8 },
    { term: 'deadlines', weight: 0.9 },
    { term: 'hours', weight: 0.5 },
    { term: 'overtime', weight: 0.9 },
    { term: 'long hours', weight: 1.2 },
    { term: 'understaffed', weight: 1.2 },
    { term: 'overwhelmed', weight: 1.1 },
    { term: 'capacity', weight: 0.7 },
    { term: 'bandwidth', weight: 0.8 },
    { term: 'burnout', weight: 1.3 },
    { term: 'burnt out', weight: 1.3 },
    { term: 'prioritise', weight: 0.7 },
    { term: 'prioritize', weight: 0.7 },
    { term: 'too much', weight: 0.9 },
    { term: 'work life balance', weight: 1.2 },
    { term: 'work-life balance', weight: 1.2 },
    { term: 'flexible', weight: 0.7 },
  ],
  MANAGEMENT: [
    { term: 'manager', weight: 1 },
    { term: 'management', weight: 1 },
    { term: 'line manager', weight: 1.2 },
    { term: 'leadership', weight: 0.9 },
    { term: 'leader', weight: 0.8 },
    { term: 'supervisor', weight: 0.9 },
    { term: 'one to one', weight: 0.8 },
    { term: '1:1', weight: 0.7 },
    { term: 'feedback', weight: 0.6 },
    { term: 'no feedback', weight: 1.1 },
    { term: 'micro manage', weight: 1.3 },
    { term: 'micromanage', weight: 1.3 },
    { term: 'authoritarian', weight: 1.1 },
    { term: 'dictatorial', weight: 1.3 },
    { term: 'supported', weight: 0.8 },
    { term: 'supportive', weight: 0.9 },
    { term: 'fair', weight: 0.7 },
    { term: 'unfair', weight: 1.2 },
    { term: 'accountability', weight: 0.6 },
  ],
  TEAM: [
    { term: 'team', weight: 1 },
    { term: 'teammate', weight: 1 },
    { term: 'teammates', weight: 1 },
    { term: 'colleague', weight: 1 },
    { term: 'colleagues', weight: 1 },
    { term: 'collaboration', weight: 0.9 },
    { term: 'collaborative', weight: 0.9 },
    { term: 'cooperation', weight: 0.8 },
    { term: 'support', weight: 0.7 },
    { term: 'communication', weight: 0.7 },
    { term: 'conflict', weight: 1 },
    { term: 'toxic', weight: 1.3 },
    { term: 'inclusive', weight: 0.9 },
    { term: 'belonging', weight: 1 },
    { term: 'isolated', weight: 1.2 },
    { term: 'trust', weight: 0.7 },
    { term: 'bully', weight: 1.4 },
    { term: 'bullying', weight: 1.4 },
  ],
  LEARNING: [
    { term: 'training', weight: 1 },
    { term: 'learning', weight: 1 },
    { term: 'course', weight: 0.8 },
    { term: 'courses', weight: 0.8 },
    { term: 'workshop', weight: 0.8 },
    { term: 'development', weight: 0.9 },
    { term: 'onboarding', weight: 0.9 },
    { term: 'mentoring', weight: 1 },
    { term: 'mentor', weight: 0.9 },
    { term: 'coaching', weight: 0.9 },
    { term: 'coach', weight: 0.8 },
    { term: 'skills', weight: 0.8 },
    { term: 'upskilling', weight: 1.1 },
    { term: 'reskilling', weight: 1.1 },
    { term: 'certification', weight: 0.9 },
    { term: 'no training', weight: 1.2 },
    { term: 'buddy', weight: 0.6 },
  ],
  CAREER_GROWTH: [
    { term: 'career', weight: 1 },
    { term: 'promotion', weight: 1.1 },
    { term: 'promotions', weight: 1.1 },
    { term: 'progression', weight: 1.1 },
    { term: 'growth', weight: 0.8 },
    { term: 'opportunity', weight: 0.6 },
    { term: 'opportunities', weight: 0.6 },
    { term: 'advancement', weight: 1.1 },
    { term: 'role', weight: 0.4 },
    { term: 'stuck', weight: 0.9 },
    { term: 'ambition', weight: 0.9 },
    { term: 'retention', weight: 0.8 },
    { term: 'staying', weight: 0.6 },
  ],
  WORK_ENVIRONMENT: [
    { term: 'office', weight: 0.7 },
    { term: 'remote', weight: 0.8 },
    { term: 'hybrid', weight: 0.8 },
    { term: 'environment', weight: 0.9 },
    { term: 'culture', weight: 1 },
    { term: 'facilities', weight: 0.8 },
    { term: 'desk', weight: 0.5 },
    { term: 'noise', weight: 0.7 },
    { term: 'lighting', weight: 0.6 },
    { term: 'ergonomic', weight: 0.8 },
    { term: 'wfh', weight: 0.7 },
    { term: 'workspace', weight: 0.8 },
    { term: 'safety', weight: 0.8 },
    { term: 'inclusive', weight: 0.8 },
  ],
  // --- Added for the daily-feedback module ---------------------------------
  // Each of these was previously folded into an adjacent theme, which made the
  // dashboards unusable: a team could be told engagement around "work
  // environment" was falling without any indication that the actual complaint
  // was broken tooling. They are separate themes so each is separately
  // measurable and separately actionable.
  COMMUNICATION: [
    { term: 'communication', weight: 1.2 },
    { term: 'communicate', weight: 1.1 },
    { term: 'communicating', weight: 1.1 },
    { term: 'unclear', weight: 0.9 },
    { term: 'clarity', weight: 0.9 },
    { term: 'transparent', weight: 0.9 },
    { term: 'transparency', weight: 1 },
    { term: 'miscommunication', weight: 1.2 },
    { term: 'not heard', weight: 1.1 },
    { term: 'ignored', weight: 1.1 },
    { term: 'silence', weight: 0.8 },
    { term: 'no updates', weight: 1 },
    { term: 'updates', weight: 0.5 },
    { term: 'alignment', weight: 0.8 },
    { term: 'disconnected', weight: 0.9 },
    { term: 'town hall', weight: 0.8 },
    { term: 'all hands', weight: 0.8 },
    { term: 'unresponsive', weight: 1.1 },
  ],
  COMPENSATION: [
    { term: 'salary', weight: 1.2 },
    { term: 'pay', weight: 1 },
    { term: 'pay rise', weight: 1.3 },
    { term: 'pay cut', weight: 1.3 },
    { term: 'raise', weight: 0.8 },
    { term: 'compensation', weight: 1.3 },
    { term: 'remuneration', weight: 1.2 },
    { term: 'bonus', weight: 1.1 },
    { term: 'benefits', weight: 1 },
    { term: 'perks', weight: 0.9 },
    { term: 'underpaid', weight: 1.3 },
    { term: 'overpaid', weight: 1.1 },
    { term: 'wages', weight: 1.1 },
    { term: 'market rate', weight: 1.2 },
    { term: 'equity', weight: 0.8 },
    { term: 'payroll', weight: 0.9 },
  ],
  WORK_LIFE_BALANCE: [
    { term: 'work life balance', weight: 1.4 },
    { term: 'work-life balance', weight: 1.4 },
    { term: 'balance', weight: 0.6 },
    { term: 'long hours', weight: 1.2 },
    { term: 'overtime', weight: 1.1 },
    { term: 'late nights', weight: 1.2 },
    { term: 'weekend', weight: 1 },
    { term: 'evenings', weight: 0.8 },
    { term: 'burnout', weight: 1.4 },
    { term: 'burnt out', weight: 1.4 },
    { term: 'exhausted', weight: 1.2 },
    { term: 'time off', weight: 1 },
    { term: 'holiday', weight: 0.8 },
    { term: 'holidays', weight: 0.8 },
    { term: 'leave', weight: 0.7 },
    { term: 'flexible', weight: 0.9 },
    { term: 'flexibility', weight: 0.9 },
    { term: 'family time', weight: 1.1 },
    { term: 'stress', weight: 1.1 },
    { term: 'overwhelmed', weight: 1.2 },
    { term: 'pace', weight: 0.7 },
  ],
  TECHNICAL_ISSUES: [
    { term: 'tooling', weight: 1.2 },
    { term: 'tools', weight: 0.7 },
    { term: 'build', weight: 0.9 },
    { term: 'builds', weight: 0.9 },
    { term: 'bug', weight: 1 },
    { term: 'bugs', weight: 1 },
    { term: 'buggy', weight: 1.1 },
    { term: 'outage', weight: 1.3 },
    { term: 'downtime', weight: 1.2 },
    { term: 'crash', weight: 1.1 },
    { term: 'crashes', weight: 1.1 },
    { term: 'slow', weight: 0.9 },
    { term: 'performance', weight: 0.9 },
    { term: 'infrastructure', weight: 1.1 },
    { term: 'deployment', weight: 1 },
    { term: 'pipeline', weight: 0.9 },
    { term: 'ci', weight: 0.8 },
    { term: 'broken', weight: 1 },
    { term: 'flaky', weight: 1.1 },
    { term: 'outdated', weight: 0.9 },
    { term: 'legacy', weight: 0.9 },
    { term: 'laptop', weight: 0.7 },
    { term: 'equipment', weight: 0.8 },
    { term: 'workstation', weight: 0.7 },
    { term: 'documentation', weight: 0.8 },
  ],
};

export interface LexiconMatch {
  term: string;
  weight: number;
  index: number;
}

/** Normalises text for matching without destroying word order. */
export function normaliseText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9'\- ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Counts how many times a phrase occurs, returning weighted matches. */
function findTerms(text: string, terms: Term[]): LexiconMatch[] {
  const matches: LexiconMatch[] = [];
  for (const { term, weight } of terms) {
    // Word-boundary match so "lead" does not fire inside "leader" unless listed.
    const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(term)}([^a-z0-9]|$)`, 'g');
    let match = pattern.exec(text);
    while (match !== null) {
      matches.push({ term, weight, index: match.index });
      match = pattern.exec(text);
    }
  }
  return matches;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Finds a negator or intensifier within the few words before a match, which is
 * the window these modifiers realistically operate over ("not supported",
 * "really overwhelming"). Beyond it the modifier is ignored.
 */
function modifierFor(text: string, index: number): { negated: boolean; scale: number } {
  const window = text.slice(Math.max(0, index - 40), index);
  const tokens = window.split(' ').slice(-3);

  let negated = false;
  let scale = 1;

  for (const token of tokens) {
    const bare = token.replace(/[^a-z']/g, '');
    if (NEGATORS.includes(bare)) negated = true;
    if (bare in INTENSIFIERS) scale *= INTENSIFIERS[bare]!;
    if (bare in DIMINISHERS) scale *= DIMINISHERS[bare]!;
  }

  return { negated, scale };
}

export interface LexiconSentiment {
  /** Signed polarity: positive is good, negative is bad. */
  polarity: number;
  label: SentimentClass;
  confidence: number;
  matches: LexiconMatch[];
}

/**
 * Scores polarity in [-1, 1] and maps it to a class.
 *
 * The dead zone is deliberate: short factual text ("the meeting is at 3pm")
 * must read as NEUTRAL rather than being pushed positive by incidental words.
 */
export function analyseSentimentLexicon(rawText: string): LexiconSentiment {
  const text = normaliseText(rawText);
  if (!text) {
    return { polarity: 0, label: 'NEUTRAL', confidence: 0, matches: [] };
  }

  const matches = [...findTerms(text, POSITIVE), ...findTerms(text, NEGATIVE)];

  let weighted = 0;
  let magnitude = 0;
  const applied: LexiconMatch[] = [];

  for (const match of matches) {
    const { negated, scale } = modifierFor(text, match.index);
    const weight = negated ? -match.weight : match.weight;
    const adjusted = weight * scale;

    weighted += adjusted;
    magnitude += Math.abs(adjusted);
    applied.push({ term: match.term, weight: adjusted, index: match.index });
  }

  if (magnitude === 0) {
    // Nothing recognised. Confidence reflects how much text there was to judge.
    return {
      polarity: 0,
      label: 'NEUTRAL',
      confidence: Math.min(0.5, 0.2 + text.split(' ').length / 60),
      matches: [],
    };
  }

  // Saturating normaliser: many weak signals approach 1 without ever exceeding
  // it, so a long rant cannot swamp a short but decisive complaint.
  const polarity = Math.tanh(weighted / 3);

  let label: SentimentClass = 'NEUTRAL';
  if (polarity >= 0.18) label = 'POSITIVE';
  else if (polarity <= -0.18) label = 'NEGATIVE';

  // More recognised signal means more confidence; bare agreement with a
  // threshold-adjacent polarity is the least trustworthy case.
  const agreement = Math.abs(polarity);
  const confidence = Math.min(0.85, 0.35 + agreement * 0.5 + Math.min(magnitude, 6) / 12);

  return {
    polarity: round(polarity, 4),
    label,
    confidence: round(confidence, 3),
    matches: applied,
  };
}

export interface LexiconThemeMatch {
  theme: EngagementTheme;
  confidence: number;
  evidence: string[];
}

/** Detects which of the six themes appear in the text, with the terms found. */
export function detectThemesLexicon(rawText: string): LexiconThemeMatch[] {
  const text = normaliseText(rawText);
  if (!text) return [];

  const results: LexiconThemeMatch[] = [];

  for (const theme of ENGAGEMENT_THEMES) {
    const matches = findTerms(text, THEME_TERMS[theme]);
    if (matches.length === 0) continue;

    const evidence = [...new Set(matches.map((match) => match.term))];
    const totalWeight = matches.reduce((sum, match) => sum + match.weight, 0);
    // Saturates at ~3 weighted hits, so one passing mention never saturates.
    const confidence = round(Math.min(1, Math.tanh(totalWeight / 2.5)), 3);

    results.push({ theme, confidence, evidence });
  }

  return results.sort((a, b) => b.confidence - a.confidence);
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
