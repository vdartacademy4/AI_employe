import { prisma } from '../../../core/prisma';
import {
  ENGAGEMENT_THEMES,
  SENTIMENT_CLASSES,
  THEME_LABELS,
  type AnalyticsDimension,
  type AnalyticsLevel,
  type EngagementTheme,
  type SentimentClass,
  type SentimentSource,
} from '../../../core/enums';
import { periodBounds } from '../engagement/engagement.calculator';
import { domainScoreService } from '../engagement/domain-scores.service';
import { periodOf, analysisPipeline } from '../analysis.pipeline';
import { DEFAULT_PRIVACY_SETTINGS } from '../../settings/settings.defaults';
import { resolveScope } from '../../../core/scope';
import type { AuthenticatedUser } from '../../../types/express';

export interface TrendPoint {
  period: string;
  value: number | null;
  sampleSize: number;
  suppressed: boolean;
}

export interface ThemeTrend {
  theme: EngagementTheme;
  label: string;
  /** Share of analysed texts in which the theme appeared, in [0, 1]. */
  share: number | null;
  mentions: number;
  sampleSize: number;
  suppressed: boolean;
  /** Mean confidence of the detections that produced `share`. */
  averageConfidence: number | null;
}

export interface EngagementTrendPoint extends TrendPoint {
  factorBreakdown: { key: string; score: number | null; sampleSize: number }[];
}

/** The trailing `months` `YYYY-MM` keys, oldest first. */
export function recentPeriods(months: number): string[] {
  const periods: string[] = [];
  const cursor = new Date();
  for (let index = months - 1; index >= 0; index -= 1) {
    const date = new Date(cursor.getFullYear(), cursor.getMonth() - index, 1);
    periods.push(periodOf(date));
  }
  return periods;
}

/**
 * Read models for the AI Intelligence dashboard.
 *
 * Everything here is derived from stored rows: `SentimentAnalysis`,
 * `ThemeDetection`, `EngagementScore` and `EngagementDomainScore`. A period with
 * no data returns `value: null` and `sampleSize: 0` rather than a zero, because
 * "nobody responded" and "everybody scored zero" are different facts and a
 * chart that cannot tell them apart is lying.
 */
export class IntelligenceAnalyticsService {
  /**
   * Sentiment label shares and mean polarity per period.
   * Honours the caller's employee scope, so a manager sees their team's trend.
   */
  async sentimentTrends(
    user: AuthenticatedUser,
    options: { months?: number; employeeIds?: string[]; source?: SentimentSource } = {},
  ) {
    const months = clampMonths(options.months);
    const employeeIds = options.employeeIds ?? (await this.scopedEmployeeIds(user));
    const threshold = await this.threshold();

    const periods = recentPeriods(months);
    const rows = await prisma.sentimentAnalysis.findMany({
      where: {
        period: { in: periods },
        method: { in: ['AI', 'LEXICON'] },
        ...(options.source ? { sourceType: options.source } : {}),
        // An unrestricted caller sees unattributed results too; a scoped one
        // never does, because they could not identify the subject anyway.
        ...(employeeIds ? { employeeId: { in: employeeIds } } : {}),
      },
      select: { period: true, label: true, score: true, method: true, provider: true, sourceType: true },
    });

    const byPeriod = groupBy(rows, (row) => row.period);

    const series = periods.map((period) => {
      const items = byPeriod.get(period) ?? [];
      const suppressed = items.length < threshold;
      const scores = items.map((item) => item.score);

      return {
        period,
        sampleSize: items.length,
        suppressed,
        ...(suppressed
          ? { positive: null, neutral: null, negative: null, polarity: null }
          : {
              positive: share(items, 'POSITIVE'),
              neutral: share(items, 'NEUTRAL'),
              negative: share(items, 'NEGATIVE'),
              polarity: mean(scores) === null ? null : round(mean(scores)!),
            }),
        // Surfaced so the UI can state how the figures were produced.
        aiAssisted: items.filter((item) => item.method === 'AI').length,
        lexiconOnly: items.filter((item) => item.method === 'LEXICON').length,
        bySource: countBy(items, (item) => item.sourceType),
      };
    });

    return {
      series,
      totals: {
        analysed: rows.length,
        aiAssisted: rows.filter((row) => row.method === 'AI').length,
        lexicon: rows.filter((row) => row.method === 'LEXICON').length,
      },
      threshold,
      periodRange: { from: periods[0], to: periods[periods.length - 1] },
    };
  }

  /** Theme prevalence per period, for the theme bar chart. */
  async themeTrends(
    user: AuthenticatedUser,
    options: { months?: number; employeeIds?: string[] } = {},
  ) {
    const months = clampMonths(options.months);
    const employeeIds = options.employeeIds ?? (await this.scopedEmployeeIds(user));
    const threshold = await this.threshold();
    const periods = recentPeriods(months);

    const detections = await prisma.themeDetection.findMany({
      where: {
        analysis: {
          period: { in: periods },
          method: { in: ['AI', 'LEXICON'] },
          ...(employeeIds ? { employeeId: { in: employeeIds } } : {}),
        },
      },
      select: {
        analysisId: true,
        theme: true,
        confidence: true,
        analysis: { select: { period: true } },
      },
    });

    // The denominator has to be every analysed text in the period, not every
    // analysed text that happened to raise a theme. Deriving it from the theme
    // rows would silently drop unthemed texts and inflate every share, and it
    // would also make the shares sum to more than 1 because one text can raise
    // several themes.
    const analyses = await prisma.sentimentAnalysis.findMany({
      where: {
        period: { in: periods },
        method: { in: ['AI', 'LEXICON'] },
        ...(employeeIds ? { employeeId: { in: employeeIds } } : {}),
      },
      select: { id: true, period: true },
    });

    const series = periods.map((period) => {
      const items = detections.filter((item) => item.analysis.period === period);
      const denominator = analyses.filter((analysis) => analysis.period === period).length;
      const suppressed = denominator < threshold;

      const themes: ThemeTrend[] = ENGAGEMENT_THEMES.map((theme) => {
        const matching = items.filter((item) => item.theme === theme);
        return {
          theme,
          label: THEME_LABELS[theme],
          mentions: new Set(matching.map((item) => item.analysisId)).size,
          share: suppressed || denominator === 0 ? null : round(matching.length / denominator),
          sampleSize: denominator,
          suppressed,
          averageConfidence:
            matching.length > 0 ? round(mean(matching.map((item) => item.confidence))!) : null,
        };
      });

      return { period, sampleSize: denominator, suppressed, themes };
    });

    return { series, threshold, periodRange: { from: periods[0], to: periods[periods.length - 1] } };
  }

  /**
   * Engagement trend, with the per-factor split for the most recent period.
   * Reads stored `EngagementScore` rows, so it reflects what the calculator
   * actually persisted rather than recomputing on the fly.
   */
  async engagementTrends(
    user: AuthenticatedUser,
    options: { months?: number; employeeIds?: string[]; level?: AnalyticsLevel } = {},
  ) {
    const months = clampMonths(options.months);
    const employeeIds = options.employeeIds ?? (await this.scopedEmployeeIds(user));
    const threshold = await this.threshold();
    const periods = recentPeriods(months);

    // The organisation view reads the materialised domain rows so suppression
    // is applied by the same code that wrote them.
    if (!employeeIds && options.level && options.level !== 'EMPLOYEE') {
      return this.domainTrends(periods, options.level, threshold);
    }

    const scoped = employeeIds ?? undefined;
    const scores = await prisma.engagementScore.findMany({
      where: { period: { in: periods }, ...(scoped ? { employeeId: { in: scoped } } : {}) },
      select: { employeeId: true, period: true, overallScore: true, confidence: true, method: true },
    });

    const factorResults = await prisma.engagementFactorResult.findMany({
      where: { period: { in: periods }, ...(scoped ? { employeeId: { in: scoped } } : {}) },
      select: { employeeId: true, period: true, factorKey: true, normalizedScore: true, sampleSize: true, enabled: true },
    });

    const series: EngagementTrendPoint[] = periods.map((period) => {
      const items = scores.filter((score) => score.period === period);
      const suppressed = items.length < threshold;
      const values = items.map((item) => item.overallScore);

      const factors = factorResults.filter((factor) => factor.period === period && factor.enabled);
      const factorBreakdown = [...new Set(factors.map((factor) => factor.factorKey))].map((key) => {
        const matching = factors.filter((factor) => factor.factorKey === key);
        const scored = matching.filter((factor) => factor.normalizedScore !== null);
        return {
          key,
          score:
            suppressed || scored.length === 0
              ? null
              : round(mean(scored.map((factor) => factor.normalizedScore!))!),
          sampleSize: matching.reduce((sum, factor) => sum + factor.sampleSize, 0),
        };
      });

      return {
        period,
        value: suppressed || values.length === 0 ? null : round(mean(values)!),
        sampleSize: items.length,
        suppressed,
        averageConfidence:
          items.length === 0
            ? null
            : round(mean(items.map((item) => item.confidence ?? 1))!),
        method: items[0]?.method ?? null,
        factorBreakdown,
      };
    });

    return { series, threshold, periodRange: { from: periods[0], to: periods[periods.length - 1] } };
  }

  /**
   * Reads a level's materialised domain rows into per-dimension series.
   *
   * A level holds one row per group per dimension, so a level-wide series has to
   * average the groups. It previously took `find` - the first group's row - which
   * reported a single team's figure as if it were the whole department's, and
   * reported nothing at all when that one group happened to be suppressed.
   */
  private async domainTrends(periods: string[], level: AnalyticsLevel, threshold: number) {
    const rows = await prisma.engagementDomainScore.findMany({
      where: { domain: level, period: { in: periods } },
      select: {
        period: true,
        domainKey: true,
        domainName: true,
        dimension: true,
        value: true,
        sampleSize: true,
        suppressed: true,
      },
    });

    const series = periods.map((period) => {
      const items = rows.filter((row) => row.period === period);

      /**
       * Averages one dimension across the period's groups. Suppressed groups are
       * excluded rather than treated as zero, so a level is not dragged down by
       * a small team whose value is deliberately withheld.
       */
      const levelAverage = (dimension: AnalyticsDimension): number | null => {
        const matching = items.filter((row) => row.dimension === dimension && !row.suppressed);
        if (matching.length === 0) return null;
        const total = matching.reduce((sum, row) => sum + (row.value ?? 0), 0);
        return round(total / matching.length);
      };

      const suppressedGroups = items.filter((row) => row.dimension === 'ENGAGEMENT' && row.suppressed);
      const reportedGroups = items.filter((row) => row.dimension === 'ENGAGEMENT' && !row.suppressed);

      return {
        period,
        engagement: levelAverage('ENGAGEMENT'),
        polarity: levelAverage('SENTIMENT_POLARITY'),
        sampleSize: items.find((row) => row.dimension === 'ENGAGEMENT')?.sampleSize ?? 0,
        // Suppressed when no group reported, or when every group is below the
        // threshold: there is nothing meaningful to show in either case.
        suppressed: reportedGroups.length === 0,
        groups: reportedGroups.length,
        suppressedGroups: suppressedGroups.length,
        dimensions: {
          positive: levelAverage('SENTIMENT_POSITIVE'),
          neutral: levelAverage('SENTIMENT_NEUTRAL'),
          negative: levelAverage('SENTIMENT_NEGATIVE'),
          themes: Object.fromEntries(
            ENGAGEMENT_THEMES.map((theme) => [theme, levelAverage(theme)]),
          ) as Record<EngagementTheme, number | null>,
        },
      };
    });

    return { series, threshold, level, periodRange: { from: periods[0], to: periods[periods.length - 1] } };
  }

  /**
   * Per-employee engagement for a period, with the factor split that produced
   * each score. This is the explainability endpoint behind the score detail.
   */
  async employeeBreakdown(
    user: AuthenticatedUser,
    options: { period?: string; employeeIds?: string[] } = {},
  ) {
    const period = options.period ?? periodOf(new Date());
    const employeeIds = options.employeeIds ?? (await this.scopedEmployeeIds(user));

    const employees = await prisma.employee.findMany({
      where: {
        deletedAt: null,
        ...(employeeIds ? { id: { in: employeeIds } } : {}),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        jobTitle: true,
        department: { select: { id: true, name: true } },
      },
    });

    const ids = employees.map((employee) => employee.id);
    const [scores, factors, sentiment] = await Promise.all([
      prisma.engagementScore.findMany({
        where: { period, employeeId: { in: ids } },
        select: { employeeId: true, overallScore: true, confidence: true, method: true, calculatedAt: true },
      }),
      prisma.engagementFactorResult.findMany({
        where: { period, employeeId: { in: ids } },
        select: {
          employeeId: true,
          factorKey: true,
          weight: true,
          normalizedScore: true,
          contribution: true,
          sampleSize: true,
          enabled: true,
          explanation: true,
        },
      }),
      prisma.sentimentAnalysis.groupBy({
        by: ['employeeId', 'label'],
        where: { period, employeeId: { in: ids } },
        _count: { _all: true },
      }),
    ]);

    const scoreByEmployee = new Map(scores.map((score) => [score.employeeId, score]));

    return employees
      .map((employee) => {
        const score = scoreByEmployee.get(employee.id);
        // An employee's own row is never suppressed: a group threshold applied
        // to a group of one would hide the number from its subject.
        const suppressed = false;
        return {
          employeeId: employee.id,
          name: `${employee.firstName} ${employee.lastName}`,
          jobTitle: employee.jobTitle,
          department: employee.department?.name ?? null,
          departmentId: employee.department?.id ?? null,
          overallScore: score && !suppressed ? score.overallScore : null,
          confidence: score?.confidence ?? null,
          method: score?.method ?? null,
          calculatedAt: score?.calculatedAt ?? null,
          factors: factors
            .filter((factor) => factor.employeeId === employee.id)
            .map((factor) => ({
              key: factor.factorKey,
              weight: factor.weight,
              score: factor.normalizedScore,
              contribution: factor.contribution,
              sampleSize: factor.sampleSize,
              enabled: factor.enabled,
              explanation: factor.explanation,
            })),
          sentiment: Object.fromEntries(
            SENTIMENT_CLASSES.map((label) => [
              label,
              sentiment.find((row) => row.employeeId === employee.id && row.label === label)?._count._all ?? 0,
            ]),
          ),
        };
      })
      .sort((a, b) => (b.overallScore ?? -1) - (a.overallScore ?? -1));
  }

  /** Latest analysed texts with their themes, for the review screen. */
  async recentAnalyses(
    user: AuthenticatedUser,
    options: { limit?: number; source?: SentimentSource; employeeIds?: string[] } = {},
  ) {
    const employeeIds = options.employeeIds ?? (await this.scopedEmployeeIds(user));
    const limit = Math.min(Math.max(options.limit ?? 25, 1), 100);

    const rows = await prisma.sentimentAnalysis.findMany({
      where: {
        method: { in: ['AI', 'LEXICON'] },
        ...(options.source ? { sourceType: options.source } : {}),
        ...(employeeIds ? { employeeId: { in: employeeIds } } : {}),
      },
      orderBy: { analyzedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        sourceType: true,
        sourceId: true,
        period: true,
        label: true,
        score: true,
        confidence: true,
        method: true,
        provider: true,
        model: true,
        excerpt: true,
        analyzedAt: true,
        employee: { select: { id: true, firstName: true, lastName: true, department: { select: { name: true } } } },
        themes: { select: { theme: true, confidence: true, evidence: true } },
      },
    });

    return rows.map((row) => ({
      ...row,
      themes: row.themes.map((theme) => ({
        ...theme,
        label: THEME_LABELS[theme.theme as EngagementTheme] ?? theme.theme,
      })),
    }));
  }

  /**
   * Runs a full refresh: analysis, scoring, aggregation.
   *
   * Returned as a summary rather than done silently, so an operator can see
   * what a run actually processed and what it skipped.
   *
   * The window is bounded to the requested month on both sides. Without the
   * upper bound, refreshing an old month would also analyse every later month
   * and quietly rewrite their results.
   */
  async refresh(period: string, options: { reanalyze?: boolean; limitPerSource?: number } = {}) {
    const bounds = periodBounds(period);

    const analysis = await analysisPipeline.run({
      since: bounds.start,
      until: bounds.end,
      reanalyze: options.reanalyze,
      limitPerSource: options.limitPerSource,
    });

    // Domain materialisation scores employees internally, so scoring here as
    // well would run the whole calculation twice.
    const domains = await domainScoreService.rebuild(period);

    return {
      period,
      analysis,
      scores: { scored: domains.scored, skipped: domains.skipped },
      domains: { rows: Object.values(domains.levels).flat().length },
    };
  }

  /** Employee ids the caller may see, or undefined when unrestricted. */
  private async scopedEmployeeIds(user: AuthenticatedUser): Promise<string[] | undefined> {
    const scope = await resolveScope(user);
    if (scope.canReadAll) return undefined;
    return [...new Set([...scope.selfEmployeeIds, ...scope.teamEmployeeIds])];
  }

  /** The configured minimum group size, read from stored privacy settings. */
  private async threshold(): Promise<number> {
    const stored = await prisma.systemSetting.findFirst({
      where: { key: 'privacy' },
      select: { value: true },
    });

    if (!stored) return DEFAULT_PRIVACY_SETTINGS.reportingMinimumGroupSize;

    try {
      const parsed = JSON.parse(stored.value) as { reportingMinimumGroupSize?: number };
      const value = parsed.reportingMinimumGroupSize;
      return typeof value === 'number' && value >= 1
        ? value
        : DEFAULT_PRIVACY_SETTINGS.reportingMinimumGroupSize;
    } catch {
      // A malformed setting must not break the dashboard; fall back rather than
      // fail the request.
      return DEFAULT_PRIVACY_SETTINGS.reportingMinimumGroupSize;
    }
  }
}

function clampMonths(value: number | undefined): number {
  if (!value) return 6;
  return Math.min(Math.max(value, 1), 24);
}

function share(items: { label: string }[], label: SentimentClass): number {
  if (items.length === 0) return 0;
  return round(items.filter((item) => item.label === label).length / items.length);
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const bucket = key(item);
    map.set(bucket, [...(map.get(bucket) ?? []), item]);
  }
  return map;
}

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  return items.reduce<Record<string, number>>((acc, item) => {
    const bucket = key(item);
    acc[bucket] = (acc[bucket] ?? 0) + 1;
    return acc;
  }, {});
}

export const intelligenceAnalyticsService = new IntelligenceAnalyticsService();
