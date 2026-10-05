import { prisma } from '../../core/prisma';
import { startOfUtcDay, TREND_WINDOW_DAYS } from './daily-pulse.service';

/**
 * Weights for the three daily components.
 *
 * The question score leads because it is the only component every employee
 * produces. Written sentiment is a strong signal but most days nobody writes
 * anything, and the trend component is a stabiliser: it damps a one-day swing
 * without hiding a genuine move. Weights are renormalised per day over the
 * components that actually have data, so an employee who skipped writing still
 * receives a score based on their answers.
 */
const WEIGHTS = {
  questions: 0.6,
  feedback: 0.25,
  trend: 0.15,
} as const;

export const DAILY_SCORE_METHOD = 'DAILY_V1';

export interface DailyScoreResult {
  scoreDate: Date;
  overallScore: number;
  questionScore: number | null;
  feedbackScore: number | null;
  trendScore: number | null;
}

/**
 * Computes one employee's engagement score for one day.
 *
 * Returns `null` when the employee submitted no numeric answers and no
 * analysable written feedback: there is nothing to score, and returning 0 would
 * be indistinguishable from a real measurement of zero.
 */
export async function calculateDailyScore(
  employeeId: string,
  scoreDate: Date = startOfUtcDay(new Date()),
): Promise<DailyScoreResult | null> {
  const day = startOfUtcDay(scoreDate);

  const [answers, sentiments, history] = await Promise.all([
    prisma.dailyQuestionAnswer.findMany({
      where: { employeeId, responseDate: day },
      select: { numericValue: true },
    }),
    prisma.sentimentAnalysis.findMany({
      where: {
        employeeId,
        sourceType: { in: ['DAILY_FEEDBACK', 'ANONYMOUS_FEEDBACK', 'DAILY_ANSWER'] },
        createdAt: { gte: day, lt: new Date(day.getTime() + 86_400_000) },
      },
      select: { label: true, score: true },
    }),
    prisma.dailyEngagementScore.findMany({
      where: {
        employeeId,
        scoreDate: { gte: new Date(day.getTime() - TREND_WINDOW_DAYS * 86_400_000), lt: day },
      },
      select: { overallScore: true },
      orderBy: { scoreDate: 'desc' },
    }),
  ]);

  const questionScore = toQuestionScore(answers.map((a) => a.numericValue ?? null));
  const feedbackScore = toFeedbackScore(sentiments);
  const trendScore = toTrendScore(history.map((h) => h.overallScore));

  if (questionScore === null && feedbackScore === null) {
    return null;
  }

  const overallScore = combine({ questionScore, feedbackScore, trendScore });

  return {
    scoreDate: day,
    overallScore,
    questionScore,
    feedbackScore,
    trendScore,
  };
}

/**
 * Rating and yes/no answers mapped to [0, 100].
 *
 * A yes/no question is read as "1 = the good state" at configuration time, so a
 * 0 is a genuine negative and not an unanswered slot. Answers that are null
 * (free text, unselected) are excluded rather than counted as zero.
 */
function toQuestionScore(values: Array<number | null>): number | null {
  const numeric = values.filter((value): value is number => value !== null);
  if (numeric.length === 0) return null;

  const average = numeric.reduce((sum, value) => sum + value, 0) / numeric.length;
  // Ratings are 1-5 and yes/no is 0-1; both normalise as (v - min) / (max - min).
  const min = numeric.every((value) => value === 0 || value === 1) ? 0 : 1;
  const normalised = (average - min) / (5 - min);
  return clampToHundred(normalised * 100);
}

/**
 * Written-feedback sentiment for the day.
 *
 * Uses the signed `score` rather than the label: a day with one mildly positive
 * and one strongly negative comment is a net negative, which averaging labels
 * would report as merely neutral.
 */
function toFeedbackScore(sentiments: Array<{ label: string; score: number | null }>): number | null {
  const scored = sentiments.filter(
    (row): row is { label: string; score: number } => row.score !== null,
  );
  if (scored.length === 0) return null;

  const mean = scored.reduce((sum, row) => sum + row.score, 0) / scored.length;
  // `score` is in [-1, 1]; map onto [0, 100].
  return clampToHundred((mean + 1) * 50);
}

function toTrendScore(previous: number[]): number | null {
  if (previous.length === 0) return null;
  const mean = previous.reduce((sum, value) => sum + value, 0) / previous.length;
  return clampToHundred(mean);
}

/** Renormalises over the components that have data, so a missing input is a
 * reweighting rather than a penalty. */
function combine(parts: {
  questionScore: number | null;
  feedbackScore: number | null;
  trendScore: number | null;
}): number {
  const available: Array<[number, number]> = [];
  if (parts.questionScore !== null) available.push([parts.questionScore, WEIGHTS.questions]);
  if (parts.feedbackScore !== null) available.push([parts.feedbackScore, WEIGHTS.feedback]);
  if (parts.trendScore !== null) available.push([parts.trendScore, WEIGHTS.trend]);

  const totalWeight = available.reduce((sum, [, weight]) => sum + weight, 0);
  if (totalWeight === 0) return 0;

  const weighted = available.reduce((sum, [value, weight]) => sum + value * weight, 0);
  return clampToHundred(weighted / totalWeight);
}

function clampToHundred(value: number): number {
  return Math.round(Math.min(100, Math.max(0, value)) * 10) / 10;
}

/**
 * Recomputes and stores the score for one employee/day. Safe to call repeatedly.
 */
export async function storeDailyScore(
  employeeId: string,
  scoreDate: Date = startOfUtcDay(new Date()),
): Promise<DailyScoreResult | null> {
  const result = await calculateDailyScore(employeeId, scoreDate);
  if (!result) return null;

  await prisma.dailyEngagementScore.upsert({
    where: { employeeId_scoreDate: { employeeId, scoreDate: result.scoreDate } },
    create: { employeeId, ...result, method: DAILY_SCORE_METHOD },
    update: {
      overallScore: result.overallScore,
      questionScore: result.questionScore,
      feedbackScore: result.feedbackScore,
      trendScore: result.trendScore,
      method: DAILY_SCORE_METHOD,
    },
  });

  return result;
}
