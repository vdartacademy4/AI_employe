import { logger } from '../../core/logger';
import { prisma } from '../../core/prisma';
import { ConflictError } from '../../core/errors';
import {
  DAILY_ANSWER_TYPES,
  QUESTION_TOPICS,
  QUESTION_SET_SOURCES,
  type DailyAnswerType,
  type QuestionSetSource,
  type QuestionTopic,
} from '../../core/enums';
import { getAiProvider } from '../ai/providers/provider.factory';
import {
  DAILY_QUESTION_SHAPE,
  QUESTION_BANK,
  normalisePrompt,
  type BankQuestion,
} from './question-bank';

/** How many previous days of questions a new set must avoid repeating. */
export const RECENT_DAYS_WINDOW = 14;

export interface GeneratedQuestion {
  prompt: string;
  answerType: DailyAnswerType;
  helpText: string | null;
  topic: QuestionTopic;
}

export interface GeneratedSet {
  source: QuestionSetSource;
  model: string | null;
  note: string | null;
  questions: GeneratedQuestion[];
}

export interface DailySetView {
  id: string;
  responseDate: string;
  source: QuestionSetSource;
  model: string | null;
  note: string | null;
  questions: Array<{
    id: string;
    prompt: string;
    answerType: DailyAnswerType;
    helpText: string | null;
    position: number;
    topic: QuestionTopic | null;
  }>;
}

/**
 * Builds and stores the five questions for each UTC day.
 *
 * The rules this service exists to enforce:
 *
 *  - **Everyone sees the same five on a given day.** The set is written once
 *    and frozen, so an employee's answers are comparable with everyone else's
 *    and a question's wording can never change after it has been answered.
 *  - **Five, always, of the documented mix.** The engagement score averages the
 *    numeric answers and the intelligence layer needs prose to classify, so a
 *    set that lost its text question would quietly degrade both.
 *  - **A configured model writes the questions; the curated bank covers the
 *    outage.** The fallback is a change of recorded provenance, never a change
 *    in behaviour - a missing key must not take the pulse offline.
 *  - **Recent questions are avoided.** A pulse that asks about workload five days
 *    running stops being read, and stops being honest.
 */
export class DailyQuestionGenerator {
  /**
   * The set for `responseDate`, creating it on first use.
   *
   * Two employees opening the same day at the same moment will both reach the
   * creation path. The unique constraint on `DailyQuestionSet.responseDate` is
   * what decides between them: the loser catches the violation and reads the
   * winner's set, so the cost of generation is paid once per day, not once per
   * employee.
   */
  async setForDate(responseDate: Date): Promise<DailySetView> {
    const existing = await this.findSet(responseDate);
    if (existing) return existing;
    return this.createSet(responseDate);
  }

  /** The stored set for a date, or null. Never creates one. */
  async findSet(responseDate: Date): Promise<DailySetView | null> {
    const row = await prisma.dailyQuestionSet.findUnique({
      where: { responseDate },
      include: { questions: { orderBy: { position: 'asc' } } },
    });
    return row ? toSetView(row) : null;
  }

  private async createSet(responseDate: Date): Promise<DailySetView> {
    const generated = await this.generate(responseDate);

    try {
      const row = await prisma.dailyQuestionSet.create({
        data: {
          responseDate,
          source: generated.source,
          model: generated.model,
          note: generated.note,
          questions: {
            create: generated.questions.map((question, index) => ({
              prompt: question.prompt,
              answerType: question.answerType,
              helpText: question.helpText,
              position: index + 1,
              theme: question.topic,
              isActive: true,
            })),
          },
        },
        include: { questions: { orderBy: { position: 'asc' } } },
      });
      logger.info('Daily question set created', {
        responseDate: responseDate.toISOString(),
        source: generated.source,
        model: generated.model,
      });
      return toSetView(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        // Another request won the race. Its set is the one everyone sees.
        const winner = await this.findSet(responseDate);
        if (winner) return winner;
      }
      throw error;
    }
  }

  /**
   * Replaces the set for a date with a freshly generated one.
   *
   * HR-only, and refused for any day that already has responses: regenerating
   * would strand those answers against questions nobody was ever asked, which
   * quietly corrupts every aggregate built from them.
   */
  async regenerateSet(responseDate: Date): Promise<DailySetView> {
    const existing = await this.findSet(responseDate);
    if (existing) {
      const responses = await prisma.dailyQuestionResponse.count({ where: { responseDate } });
      if (responses > 0) {
        throw new ConflictError(
          `${responses} response(s) already exist for ${responseDate.toISOString().slice(0, 10)}. ` +
            'Questions can only be regenerated for a day nobody has answered.',
        );
      }
      await prisma.dailyQuestionSet.delete({ where: { id: existing.id } });
    }
    return this.createSet(responseDate);
  }

  /** Recent sets, newest first, so HR can see rotation and provenance. */
  async recentSets(limit = 14): Promise<DailySetView[]> {
    const rows = await prisma.dailyQuestionSet.findMany({
      orderBy: { responseDate: 'desc' },
      take: limit,
      include: { questions: { orderBy: { position: 'asc' } } },
    });
    return rows.map(toSetView);
  }

  /**
   * Asks the configured provider for the day's five questions, falling back to
   * the bank on any failure.
   *
   * The fallback is not an error path: a daily pulse that stops working because
   * a model is unavailable is worse than one that asks slightly less interesting
   * questions. The reason is recorded on the set so the degradation is visible
   * to HR instead of being disguised as a normal day.
   */
  private async generate(responseDate: Date): Promise<GeneratedSet> {
    const recent = await this.recentlyUsedPrompts(responseDate);

    const provider = getAiProvider();
    if (provider.isConfigured()) {
      try {
        const result = await provider.complete({
          prompt: buildPrompt(responseDate, recent),
          system: QUESTION_SYSTEM_PROMPT,
          temperature: 0.7,
          maxTokens: 900,
        });

        const parsed = parseGeneratedQuestions(result.content, recent);
        if (!parsed) {
          throw new Error('provider did not return five usable questions');
        }

        return {
          source: 'GEMINI',
          model: `${result.provider}:${result.model}`,
          note: null,
          questions: parsed,
        };
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'unknown provider error';
        logger.warn('Daily question generation failed, falling back to the bank', {
          responseDate: responseDate.toISOString(),
          provider: provider.id,
          reason,
        });
        return {
          source: 'BANK',
          model: null,
          note: `Fallback: ${truncate(reason, 200)}`,
          questions: pickFromBank(responseDate, recent),
        };
      }
    }

    return {
      source: 'BANK',
      model: null,
      note: 'Fallback: no AI provider is configured, so the curated bank was used.',
      questions: pickFromBank(responseDate, recent),
    };
  }

  /**
   * Comparison forms of every prompt asked in the recent window.
   *
   * Read from stored sets rather than from memory, so the window survives a
   * restart and stays correct after a manual regeneration.
   */
  private async recentlyUsedPrompts(responseDate: Date): Promise<Set<string>> {
    const windowStart = new Date(responseDate.getTime() - RECENT_DAYS_WINDOW * 86_400_000);
    const rows = await prisma.dailyQuestion.findMany({
      where: {
        questionSet: { responseDate: { gte: windowStart, lt: responseDate } },
      },
      select: { prompt: true },
    });
    return new Set(rows.map((row) => normalisePrompt(row.prompt)));
  }
}

// ---------------------------------------------------------------------------
// Bank selection
// ---------------------------------------------------------------------------

/**
 * Picks five bank questions for a date: three ratings, one yes/no, one short
 * text, drawn from five different topics and avoiding anything asked recently.
 *
 * Seeded by the date so the same day always produces the same set. That matters
 * even though the result is persisted: an HR user who regenerates a day nobody
 * answered gets the same questions back rather than a surprise, and the daily
 * job (if one is ever added) is reproducible.
 */
export function pickFromBank(responseDate: Date, recent: Set<string> = new Set()): GeneratedQuestion[] {
  const random = seededRandom(dateSeed(responseDate));

  const byType: Record<DailyAnswerType, BankQuestion[]> = {
    RATING: [],
    YES_NO: [],
    MULTIPLE_CHOICE: [],
    SHORT_TEXT: [],
  };
  for (const question of QUESTION_BANK) byType[question.answerType].push(question);

  const chosen: BankQuestion[] = [];
  const usedTopics = new Set<QuestionTopic>();
  const usedPrompts = new Set<string>();

  const slots: DailyAnswerType[] = [
    ...Array<DailyAnswerType>(DAILY_QUESTION_SHAPE.rating).fill('RATING'),
    ...Array<DailyAnswerType>(DAILY_QUESTION_SHAPE.yesNo).fill('YES_NO'),
    ...Array<DailyAnswerType>(DAILY_QUESTION_SHAPE.shortText).fill('SHORT_TEXT'),
  ];

  for (const type of slots) {
    const pick = chooseOne(byType[type], usedPrompts, usedTopics, recent, random);
    if (!pick) continue;
    chosen.push(pick);
    usedPrompts.add(normalisePrompt(pick.prompt));
    usedTopics.add(pick.topic);
  }

  // A bank edit could in principle leave a type short. Top up from anything
  // still unused rather than returning fewer than five questions, because the
  // submission contract is exactly five.
  if (chosen.length < slots.length) {
    const spare = QUESTION_BANK.filter((question) => !usedPrompts.has(normalisePrompt(question.prompt)));
    shuffle(spare, random);
    for (const question of spare) {
      if (chosen.length >= slots.length) break;
      chosen.push(question);
      usedPrompts.add(normalisePrompt(question.prompt));
    }
  }

  shuffle(chosen, random);

  return chosen.map((question) => ({
    prompt: question.prompt,
    answerType: question.answerType,
    helpText: question.helpText ?? null,
    topic: question.topic,
  }));
}

/**
 * Prefers, in order: not asked recently, a topic not yet used today, then the
 * seeded order. The first two preferences are what turn a random draw into a
 * set that feels varied; the third only breaks ties.
 */
function chooseOne(
  pool: BankQuestion[],
  usedPrompts: Set<string>,
  usedTopics: Set<QuestionTopic>,
  recent: Set<string>,
  random: () => number,
): BankQuestion | null {
  const unused = pool.filter((question) => !usedPrompts.has(normalisePrompt(question.prompt)));
  if (unused.length === 0) return null;

  const order = shuffledIndices(unused.length, random);
  const rank = (index: number) => {
    const question = unused[index]!;
    if (recent.has(normalisePrompt(question.prompt))) return 2;
    if (usedTopics.has(question.topic)) return 1;
    return 0;
  };

  let best = order[0]!;
  for (const index of order) {
    if (rank(index) < rank(best)) best = index;
  }
  return unused[best]!;
}

// ---------------------------------------------------------------------------
// Gemini prompt
// ---------------------------------------------------------------------------

const QUESTION_SYSTEM_PROMPT = `You write the five questions that appear in a daily employee feedback pulse for an HR department.

Rules you must follow exactly:
- Return exactly five questions as a single JSON array, with no prose and no markdown fence.
- Each element must be an object: {"prompt": string, "answerType": string, "helpText": string, "topic": string}.
- "answerType" must be one of RATING, YES_NO, SHORT_TEXT.
- The set must contain exactly three RATING, one YES_NO and one SHORT_TEXT, in that order.
- "topic" must be one of: ${QUESTION_TOPICS.join(', ')}.
- The five topics must all be different.
- Write for the employee, in plain everyday language, under 120 characters each.
- Ask about the person's own day. Never ask them to rate or comment on a named colleague, and never ask them to speculate about anyone else.
- Keep questions professional and suitable for an employer to read, while staying neutral enough that an unhappy employee will answer honestly.
- RATING questions are answered on a 1-5 scale, so phrase them so that 1 is clearly bad and 5 is clearly good.
- YES_NO questions must be answerable with a single yes or no.
- Use "helpText" only when a scale needs explaining; otherwise use an empty string.
- Do not number the questions and do not repeat the scale in the prompt text.`;

function buildPrompt(responseDate: Date, recent: Set<string>): string {
  const date = responseDate.toISOString().slice(0, 10);
  const avoid =
    recent.size > 0
      ? `\n\nThese questions were asked in the last ${RECENT_DAYS_WINDOW} days. Do not repeat them or ask about the same thing in different words:\n${[...recent]
          .map((prompt) => `- ${prompt}`)
          .join('\n')}`
      : '';

  return `Write today's five daily feedback questions for ${date}.${avoid}`;
}

/**
 * Parses and validates a provider response.
 *
 * Returns null rather than repairing anything. A model answer is untrusted text
 * that employees will read and HR will act on, so anything that does not match
 * the documented contract exactly - five items, the required answer-type mix,
 * distinct non-empty prompts, known topics - is rejected wholesale and the bank
 * is used instead. A partially-correct set would be worse than a curated one.
 */
export function parseGeneratedQuestions(raw: string, recent: Set<string> = new Set()): GeneratedQuestion[] | null {
  const json = extractJsonArray(raw);
  if (!json) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length !== 5) return null;

  const questions: GeneratedQuestion[] = [];
  const seenPrompts = new Set<string>();
  const seenTopics = new Set<QuestionTopic>();

  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') return null;
    const record = entry as Record<string, unknown>;

    const prompt = sanitisePrompt(record.prompt);
    if (!prompt || seenPrompts.has(normalisePrompt(prompt))) return null;
    if (recent.has(normalisePrompt(prompt))) return null;

    const answerType = String(record.answerType ?? '').toUpperCase();
    if (!(DAILY_ANSWER_TYPES as readonly string[]).includes(answerType)) return null;
    if (answerType === 'MULTIPLE_CHOICE') return null;

    const topic = String(record.topic ?? '').toUpperCase();
    if (!(QUESTION_TOPICS as readonly string[]).includes(topic)) return null;
    if (seenTopics.has(topic as QuestionTopic)) return null;

    const helpText = sanitisePrompt(record.helpText);

    seenPrompts.add(normalisePrompt(prompt));
    seenTopics.add(topic as QuestionTopic);
    questions.push({
      prompt,
      answerType: answerType as DailyAnswerType,
      helpText: helpText && helpText.length >= 4 ? truncate(helpText, 200) : null,
      topic: topic as QuestionTopic,
    });
  }

  // The mix is the whole reason a set is worth generating. MULTIPLE_CHOICE is
  // rejected above, so only the three shape types can appear here.
  const counts: Record<string, number> = { RATING: 0, YES_NO: 0, SHORT_TEXT: 0 };
  for (const question of questions) {
    counts[question.answerType] = (counts[question.answerType] ?? 0) + 1;
  }
  if (
    counts.RATING !== DAILY_QUESTION_SHAPE.rating ||
    counts.YES_NO !== DAILY_QUESTION_SHAPE.yesNo ||
    counts.SHORT_TEXT !== DAILY_QUESTION_SHAPE.shortText
  ) {
    return null;
  }

  return questions;
}

/**
 * Trims, bounds and strips control characters from model-authored text.
 *
 * It is about to be rendered to every employee and stored as history, so it is
 * treated as untrusted input rather than as a string the app already knows.
 */
function sanitisePrompt(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;

  // C0 controls and DEL are filtered by code point rather than by a regex
  // literal: it is the same check, and a regex spelling of it trips the
  // no-control-regex lint rule.
  let withoutControls = '';
  for (const character of raw) {
    const code = character.codePointAt(0) ?? 0;
    const isControl = code <= 0x1f || code === 0x7f;
    withoutControls += isControl ? ' ' : character;
  }

  const cleaned = withoutControls.replace(/\s+/g, ' ').trim();
  if (cleaned.length === 0) return null;
  return truncate(cleaned, 240);
}

/**
 * Pulls a JSON array out of a completion.
 *
 * Tolerates a fenced block and surrounding prose, because models emit both even
 * when told not to.
 */
function extractJsonArray(raw: string): string | null {
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced?.[1] ?? raw).trim();
  const start = candidate.indexOf('[');
  const end = candidate.lastIndexOf(']');
  if (start === -1 || end <= start) return null;
  return candidate.slice(start, end + 1);
}

// ---------------------------------------------------------------------------
// Deterministic randomness
// ---------------------------------------------------------------------------

/** A 32-bit FNV-1a hash, used to turn a date into a stable seed. */
function dateSeed(date: Date): number {
  const key = date.toISOString().slice(0, 10);
  let hash = 0x811c9dc5;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * mulberry32: small, fast, and - the reason it is here - reproducible from its
 * seed, so a given date always yields the same question set.
 */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffledIndices(length: number, random: () => number): number[] {
  const indices = Array.from({ length }, (_, index) => index);
  for (let index = indices.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [indices[index], indices[swap]] = [indices[swap]!, indices[index]!];
  }
  return indices;
}

function shuffle<T>(items: T[], random: () => number): void {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [items[index], items[swap]] = [items[swap]!, items[index]!];
  }
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}

type SetRow = {
  id: string;
  responseDate: Date;
  source: string;
  model: string | null;
  note: string | null;
  questions: {
    id: string;
    prompt: string;
    answerType: string;
    helpText: string | null;
    position: number;
    theme: string | null;
  }[];
};

function toSetView(row: SetRow): DailySetView {
  return {
    id: row.id,
    responseDate: row.responseDate.toISOString(),
    source: (QUESTION_SET_SOURCES as readonly string[]).includes(row.source)
      ? (row.source as QuestionSetSource)
      : 'BANK',
    model: row.model,
    note: row.note,
    questions: row.questions.map((question) => ({
      id: question.id,
      prompt: question.prompt,
      answerType: question.answerType as DailyAnswerType,
      helpText: question.helpText,
      position: question.position,
      topic: (QUESTION_TOPICS as readonly string[]).includes(question.theme ?? '')
        ? (question.theme as QuestionTopic)
        : null,
    })),
  };
}

export const dailyQuestionGenerator = new DailyQuestionGenerator();
