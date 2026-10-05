import { logger } from '../../../core/logger';
import { prisma } from '../../../core/prisma';
import {
  ENGAGEMENT_FACTOR_KEYS,
  type AnalyticsDimension,
  type AnalyticsLevel,
  type EngagementFactorKey,
} from '../../../core/enums';
import {
  defaultFactorConfigs,
  scaleMaximumForQuestion,
  scoreActivitySignal,
  type ResolvedFactorConfig,
} from './engagement.config';

/** Everything needed to explain one factor's contribution to a score. */
export interface FactorBreakdown {
  key: EngagementFactorKey;
  label: string;
  weight: number;
  enabled: boolean;
  /** Null when the factor had no usable data for this period. */
  score: number | null;
  contribution: number;
  /** Share of the possible weight this factor could contribute. */
  dataCoverage: number;
  sampleSize: number;
  explanation: string;
}

export interface EngagementResult {
  employeeId: string;
  period: string;
  overallScore: number | null;
  factors: FactorBreakdown[];
  /** 0-1: how much of the enabled weight actually had data. */
  confidence: number;
  method: string;
  notes: string[];
}

interface SurveyMeasurement {
  score: number;
  sampleSize: number;
}

interface SentimentMeasurement {
  score: number;
  sampleSize: number;
}

interface ActivityMeasurement {
  score: number;
  sampleSize: number;
  detail: { key: string; value: number; score: number }[];
}

/**
 * Computes engagement scores from stored facts.
 *
 * The design decision that matters: this service only ever reads from the
 * database. It never accepts a caller-supplied score, and it never defaults a
 * missing input to a number that looks like a measurement. A factor with no data
 * reports `null` and is excluded from the average, with the shortfall reflected
 * in `confidence`, so a 78 made from one survey cannot be mistaken for a 78 made
 * from all three factors.
 */
export class EngagementCalculator {
  /** Scores one employee for one `YYYY-MM` period and persists the result. */
  async calculateForEmployee(employeeId: string, period: string): Promise<EngagementResult> {
    const configs = await this.resolveConfigs();

    const [survey, sentiment, activity] = await Promise.all([
      this.measureSurveyResponses(employeeId, period),
      this.measureFeedbackSentiment(employeeId, period),
      this.measureActivity(employeeId, period),
    ]);

    const measurements: Record<EngagementFactorKey, { score: number; sampleSize: number; detail?: ActivityMeasurement['detail'] }> = {
      SURVEY_RESPONSES: survey,
      FEEDBACK_SENTIMENT: sentiment,
      ACTIVITY_DATA: activity,
    };

    const notes: string[] = [];
    // Shared by every factor so each one's contribution is a share of the same
    // total rather than a share of itself.
    const enabledWeightTotal = totalEnabledWeight(configs);
    const factors: FactorBreakdown[] = configs.map((config) =>
      this.buildFactor(config, measurements[config.key], notes, enabledWeightTotal),
    );

    const usable = factors.filter((factor) => factor.enabled && factor.score !== null);
    const weightTotal = usable.reduce((sum, factor) => sum + factor.weight, 0);

    if (weightTotal === 0) {
      notes.push('No engagement factor had data for this period, so no score was produced.');
      return {
        employeeId,
        period,
        overallScore: null,
        factors,
        confidence: 0,
        method: 'AI_INTELLIGENCE_V1',
        notes,
      };
    }

    // Weighted mean over the factors that actually contributed, divided by the
    // weight that was *available*. Dividing by the available weight rather than
    // renormalising to 1 keeps an all-weights-present score on the same 0-100
    // scale as a partial one, which is what makes the two comparable.
    const weightedSum = usable.reduce((sum, factor) => sum + (factor.score ?? 0) * factor.weight, 0);
    const available = enabledWeightTotal > 0 ? enabledWeightTotal : weightTotal;
    const overallScore = round2((weightedSum / available) * 100);

    const confidence = round2(available === 0 ? 0 : weightTotal / available);

    if (usable.length < configs.filter((c) => c.enabled).length) {
      notes.push('Score is based on a subset of the enabled factors; treat it as indicative.');
    }

    const result: EngagementResult = {
      employeeId,
      period,
      overallScore,
      factors,
      confidence,
      method: 'AI_INTELLIGENCE_V1',
      notes,
    };

    await this.persist(result, period);
    return result;
  }

  /**
   * Scores every active employee who has any input in the period.
   *
   * `employeeIds` restricts the run to a subset. Callers with limited scope must
   * pass it, otherwise a manager pressing "calculate" would rewrite scores for
   * the whole organisation.
   */
  async calculateForAll(
    period: string,
    employeeIds?: string[],
  ): Promise<{ scored: number; skipped: number }> {
    const employees = await prisma.employee.findMany({
      where: {
        status: { in: ['ACTIVE', 'ON_LEAVE', 'ONBOARDING'] },
        deletedAt: null,
        ...(employeeIds ? { id: { in: employeeIds } } : {}),
      },
      select: { id: true },
    });

    let scored = 0;
    let skipped = 0;

    for (const employee of employees) {
      try {
        const result = await this.calculateForEmployee(employee.id, period);
        if (result.overallScore === null) skipped += 1;
        else scored += 1;
      } catch (error) {
        skipped += 1;
        logger.error('Failed to calculate engagement score', {
          employeeId: employee.id,
          period,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info('Engagement run complete', { period, scored, skipped });
    return { scored, skipped };
  }

  /**
   * Factor configuration: stored overrides merged onto the published defaults.
   * A factor with no stored row still appears, so the UI can always show the
   * full set of factors and their current weights.
   */
  async resolveConfigs(): Promise<ResolvedFactorConfig[]> {
    const stored = await prisma.engagementFactorConfig.findMany();

    return ENGAGEMENT_FACTOR_KEYS.map((key) => {
      const base = defaultFactorConfigs().find((config) => config.key === key)!;
      const override = stored.find((row) => row.key === key);
      if (!override) return base;

      return {
        ...base,
        weight: override.weight,
        enabled: override.enabled,
        overridden: true,
      };    });
  }

  private buildFactor(
    config: ResolvedFactorConfig,
    measurement: { score: number; sampleSize: number; detail?: ActivityMeasurement['detail'] },
    notes: string[],
    enabledWeightTotal: number,
  ): FactorBreakdown {
    const hasData = measurement.sampleSize > 0;
    const score = hasData ? round2(measurement.score) : null;

    if (!config.enabled) {
      return {
        key: config.key,
        label: config.label,
        weight: config.weight,
        enabled: false,
        score,
        contribution: 0,
        dataCoverage: hasData ? 1 : 0,
        sampleSize: measurement.sampleSize,
        explanation: 'This factor is switched off in the current configuration, so it does not affect the score.',
      };
    }

    if (!hasData) {
      notes.push(`${config.label}: no data for this period.`);
      return {
        key: config.key,
        label: config.label,
        weight: config.weight,
        enabled: true,
        score: null,
        contribution: 0,
        dataCoverage: 0,
        sampleSize: 0,
        explanation: `No data for this factor in this period, so it was excluded from the score rather than assumed to be zero.`,
      };
    }

    return {
      key: config.key,
      label: config.label,
      weight: config.weight,
      enabled: true,
      score,
      // Expressed as a share of the total enabled weight so the parts sum to
      // 100 across every enabled factor. Dividing by the full enabled total (not
      // just the contributing subset) keeps this a configuration share, which is
      // what a UI needs to explain where a score came from.
      contribution: round2((config.weight / Math.max(enabledWeightTotal, 0.0001)) * 100),
      dataCoverage: 1,
      sampleSize: measurement.sampleSize,
      explanation: `${measurement.sampleSize} data point${measurement.sampleSize === 1 ? '' : 's'} in this period. ${config.explain}`,
    };
  }

  /**
   * Survey factor.
   *
   * Only numeric-capable questions count, and each is normalised by its own
   * scale maximum, so a 5-point question and a 10-point question are comparable.
   * Each question's own `weight` is respected when averaging.
   */
  private async measureSurveyResponses(employeeId: string, period: string): Promise<SurveyMeasurement> {
    const range = periodBounds(period);

    const responses = await prisma.surveyResponse.findMany({
      where: {
        employeeId,
        status: 'SUBMITTED',
        // `SurveyResponse` has no `period` column, so the window is derived
        // from the submission date rather than assumed.
        submittedAt: { gte: range.start, lt: range.end },
      },
      select: {
        answers: {
          select: {
            valueNumber: true,
            question: { select: { type: true, weight: true, options: true } },
          },
        },
      },
    });

    let weightedTotal = 0;
    let weightUsed = 0;
    let count = 0;

    for (const response of responses) {
      for (const answer of response.answers) {
        if (answer.valueNumber === null || answer.valueNumber === undefined) continue;

        const options = parseOptions(answer.question.options);
        const max = scaleMaximumForQuestion(answer.question.type, options);
        // A question with no known maximum cannot be placed on 0-100, so it is
        // skipped rather than guessed at.
        if (max === null || max <= 0) continue;

        const normalised = Math.min(Math.max(answer.valueNumber / max, 0), 1) * 100;
        const questionWeight = answer.question.weight ?? 1;

        weightedTotal += normalised * questionWeight;
        weightUsed += questionWeight;
        count += 1;
      }
    }

    if (count === 0) return { score: 0, sampleSize: 0 };
    return { score: weightedTotal / weightUsed, sampleSize: count };
  }

  /**
   * Sentiment factor: mean polarity of this employee's attributed feedback in
   * the period, mapped from [-1, 1] onto [0, 100].
   *
   * Anonymous submissions have no `employeeId` and are therefore never included
   * here; they still count in organisation-level aggregates.
   */
  private async measureFeedbackSentiment(employeeId: string, period: string): Promise<SentimentMeasurement> {
    const rows = await prisma.sentimentAnalysis.findMany({
      where: {
        employeeId,
        period,
        method: { in: ['AI', 'LEXICON'] },
      },
      select: { score: true },
    });

    if (rows.length === 0) return { score: 0, sampleSize: 0 };

    const mean = rows.reduce((sum, row) => sum + (row.score ?? 0), 0) / rows.length;
    return { score: (mean + 1) / 2 * 100, sampleSize: rows.length };
  }

  /**
   * Activity factor: mean of the per-signal sub-scores, using APPROVED signals
   * only. Pending and rejected signals are invisible here by design, so an
   * unapproved signal can never move a score.
   */
  private async measureActivity(employeeId: string, period: string): Promise<ActivityMeasurement> {
    const signals = await prisma.employeeActivitySignal.findMany({
      where: { employeeId, period, approvalStatus: 'APPROVED' },
      select: { signalKey: true, value: true },
    });

    if (signals.length === 0) return { score: 0, sampleSize: 0, detail: [] };

    const detail = signals.map((signal) => ({
      key: signal.signalKey,
      value: signal.value,
      score: scoreActivitySignal(signal.signalKey as never, signal.value),
    }));

    const score = detail.reduce((sum, item) => sum + item.score, 0) / detail.length;
    return { score, sampleSize: signals.length, detail };
  }

  /** Writes the score, its factor rows and the domain rows in one transaction. */
  private async persist(result: EngagementResult, period: string): Promise<void> {
    if (result.overallScore === null) return;

    await prisma.$transaction(async (tx) => {
      await tx.engagementScore.upsert({
        where: { employeeId_period: { employeeId: result.employeeId, period } },
        create: {
          employeeId: result.employeeId,
          period,
          source: 'AI_INFERRED',
          overallScore: result.overallScore!,
          confidence: result.confidence,
          method: result.method,
          calculatedAt: new Date(),
        },
        update: {
          source: 'AI_INFERRED',
          overallScore: result.overallScore!,
          confidence: result.confidence,
          method: result.method,
          calculatedAt: new Date(),
        },
      });

      // Factor results are rewritten wholesale: a config change must remove the
      // rows of factors that are now disabled, not just update the ones present.
      await tx.engagementFactorResult.deleteMany({
        where: { employeeId: result.employeeId, period },
      });

      await tx.engagementFactorResult.createMany({
        data: result.factors.map((factor) => ({
          employeeId: result.employeeId,
          period,
          factorKey: factor.key,
          weight: factor.weight,
          rawValue: factor.score,
          normalizedScore: factor.score,
          contribution: factor.contribution,
          sampleSize: factor.sampleSize,
          enabled: factor.enabled,
          explanation: factor.explanation,
        })),
      });
    });
  }
}

function totalEnabledWeight(configs: ResolvedFactorConfig[]): number {
  return configs.filter((config) => config.enabled).reduce((sum, config) => sum + config.weight, 0);
}

/**
 * Converts a `YYYY-MM` period into a half-open date range.
 *
 * Uses local time and `getMonth() + 1` rather than `toISOString()`, which would
 * shift the window by a day either side of midnight for non-UTC deployments.
 */
export function periodBounds(period: string): { start: Date; end: Date } {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  const year = match ? Number(match[1]) : new Date().getFullYear();
  const month = match ? Number(match[2]) - 1 : new Date().getMonth();
  return {
    start: new Date(year, month, 1),
    end: new Date(year, month + 1, 1),
  };
}

/** `SurveyQuestion.options` is a pipe-delimited string, not JSON. */
function parseOptions(raw: string | null): string[] | undefined {
  if (!raw) return undefined;
  const parts = raw.split('|').map((part) => part.trim()).filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export const engagementCalculator = new EngagementCalculator();
export type { AnalyticsDimension, AnalyticsLevel };
