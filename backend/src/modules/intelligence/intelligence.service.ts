import { ForbiddenError, NotFoundError, ValidationError } from '../../core/errors';
import { prisma } from '../../core/prisma';
import { assertCanAccessEmployee, resolveScope } from '../../core/scope';
import type { AuthenticatedUser } from '../../types/express';
import { periodOf, analysisPipeline } from './analysis.pipeline';
import { intelligenceAnalyticsService } from './analytics/intelligence-analytics.service';
import { engagementCalculator } from './engagement/engagement.calculator';
import { domainScoreService } from './engagement/domain-scores.service';
import { FACTOR_DEFINITIONS, ACTIVITY_SIGNAL_RULES } from './engagement/engagement.config';
import type {
  AnalyseRunInput,
  ApproveSignalInput,
  BreakdownQuery,
  CalculateQuery,
  DomainScoresQuery,
  EngagementTrendsQuery,
  ListSignalsQuery,
  RecentAnalysesQuery,
  RecordSignalInput,
  RefreshInput,
  SentimentTrendsQuery,
  ThemeTrendsQuery,
  UpdateFactorConfigInput,
} from './intelligence.schemas';

/**
 * Application service for the AI Intelligence module.
 *
 * Scope handling is centralised here rather than left to each method: every
 * method that can reach employee data calls one of the `scoped*` helpers, and
 * those helpers intersect a requested id with the caller's permissions so a
 * query parameter can never widen access.
 */
export class IntelligenceService {
  /** Sentiment label shares and polarity per period. */
  async sentimentTrends(user: AuthenticatedUser, query: SentimentTrendsQuery) {
    return intelligenceAnalyticsService.sentimentTrends(user, {
      months: query.months,
      source: query.source,
      employeeIds: await this.scopedEmployeeIds(user, query.employeeId),
    });
  }

  /** Theme prevalence per period. */
  async themeTrends(user: AuthenticatedUser, query: ThemeTrendsQuery) {
    return intelligenceAnalyticsService.themeTrends(user, {
      months: query.months,
      employeeIds: await this.scopedEmployeeIds(user, query.employeeId),
    });
  }

  /** Engagement trend, with the per-factor split. */
  async engagementTrends(user: AuthenticatedUser, query: EngagementTrendsQuery) {
    return intelligenceAnalyticsService.engagementTrends(user, {
      months: query.months,
      level: query.level,
      employeeIds: await this.scopedEmployeeIds(user, query.employeeId),
    });
  }

  /** Per-employee scores and their factor breakdowns. */
  async employeeBreakdown(user: AuthenticatedUser, query: BreakdownQuery) {
    return intelligenceAnalyticsService.employeeBreakdown(user, {
      period: query.period ?? periodOf(new Date()),
      employeeIds: await this.scopedEmployeeIds(user, query.employeeId),
    });
  }

  /** The most recently analysed texts, for human review. */
  async recentAnalyses(user: AuthenticatedUser, query: RecentAnalysesQuery) {
    return intelligenceAnalyticsService.recentAnalyses(user, {
      limit: query.limit,
      source: query.source,
      employeeIds: await this.scopedEmployeeIds(user, query.employeeId),
    });
  }

  /**
   * Scores one employee, or the caller's scope when no id is given.
   *
   * Scoping is enforced by intersecting the requested id with the caller's
   * permissions before any read or write, so an unauthorised id results in a
   * 403 rather than a score for someone else.
   *
   * Without an id a limited caller is scored only for their own employees. An
   * unrestricted caller runs the whole organisation. Previously any caller with
   * the route permission triggered a full-organisation write, which let a manager
   * recompute every score simply by omitting a query parameter.
   */
  async calculate(user: AuthenticatedUser, query: CalculateQuery) {
    const period = query.period ?? periodOf(new Date());

    if (query.employeeId) {
      await assertCanAccessEmployee(user, query.employeeId);
      const result = await engagementCalculator.calculateForEmployee(query.employeeId, period);
      return { period, scope: 'EMPLOYEE' as const, results: [result] };
    }

    const scope = await resolveScope(user);
    const allowed = scope.canReadAll
      ? undefined
      : [...new Set([...scope.selfEmployeeIds, ...scope.teamEmployeeIds])];

    const result = await engagementCalculator.calculateForAll(period, allowed);
    return {
      period,
      scope: scope.canReadAll ? ('ORGANISATION' as const) : ('SCOPED' as const),
      results: [result],
    };
  }

  /**
   * Full refresh: analyse text, score employees, materialise domain scores.
   * Reserved for HR/Admin because it processes the whole organisation.
   */
  async refresh(periodInput: RefreshInput) {
    return intelligenceAnalyticsService.refresh(periodInput.period, {
      reanalyze: periodInput.reanalyze,
      limitPerSource: periodInput.limitPerSource,
    });
  }

  /** Runs the NLP pass over the given sources and persists the results. */
  async runAnalysis(input: AnalyseRunInput) {
    return analysisPipeline.run({
      sources: input.sources,
      since: input.since,
      limitPerSource: input.limitPerSource,
      reanalyze: input.reanalyze,
    });
  }

  /** Current factor configuration: code defaults merged with overrides. */
  async factorConfigs() {
    const configs = await engagementCalculator.resolveConfigs();
    return {
      factors: configs.map((config) => ({
        ...config,
        source: config.overridden ? 'OVERRIDDEN' : 'DEFAULT',
      })),
      // Published alongside the weights so the scoring rule is reviewable in the
      // UI, not only in source code.
      definitions: FACTOR_DEFINITIONS,
      activitySignals: ACTIVITY_SIGNAL_RULES,
    };
  }

  /**
   * Overrides one factor's weight or enabled state.
   *
   * Rejects a configuration that would disable every factor, because that
   * produces a system where no engagement score can ever be produced and the
   * failure would otherwise be silent.
   */
  async updateFactorConfig(
    factorKey: string,
    input: UpdateFactorConfigInput,
    updatedById: string,
  ) {
    const configs = await engagementCalculator.resolveConfigs();
    const current = configs.find((config) => config.key === factorKey);
    if (!current) throw new NotFoundError('Engagement factor');

    const nextWeight = input.weight ?? current.weight;
    const nextEnabled = input.enabled ?? current.enabled;

    const othersEnabled = configs.filter((config) => config.key !== factorKey && config.enabled);
    if (!nextEnabled && othersEnabled.length === 0) {
      throw new ValidationError('At least one engagement factor must stay enabled');
    }
    if (nextEnabled && nextWeight === 0 && othersEnabled.every((config) => config.weight === 0)) {
      throw new ValidationError('An enabled factor must have a weight greater than zero');
    }

    return prisma.engagementFactorConfig.upsert({
      where: { key: factorKey },
      create: {
        key: factorKey,
        weight: nextWeight,
        enabled: nextEnabled,
        description: input.description ?? current.description,
        updatedById,
      },
      update: {
        weight: nextWeight,
        enabled: nextEnabled,
        ...(input.description !== undefined ? { description: input.description } : {}),
        updatedById,
      },
    });
  }

  /** Records an activity signal as PENDING, so it cannot affect a score yet. */
  async recordSignal(user: AuthenticatedUser, input: RecordSignalInput) {
    await assertCanAccessEmployee(user, input.employeeId);

    return prisma.employeeActivitySignal.upsert({
      where: {
        employeeId_period_signalKey: {
          employeeId: input.employeeId,
          period: input.period,
          signalKey: input.signalKey,
        },
      },
      create: {
        employeeId: input.employeeId,
        period: input.period,
        signalKey: input.signalKey,
        value: input.value,
        unit: input.unit,
        source: input.source,
        note: input.note,
        // Deliberately PENDING: a new signal is never scored until reviewed.
        approvalStatus: 'PENDING',
      },
      // Editing a value invalidates any earlier approval, so the signal returns
      // to PENDING rather than keeping an approval for a number that changed.
      update: {
        value: input.value,
        unit: input.unit,
        source: input.source,
        note: input.note,
        approvalStatus: 'PENDING',
        approvedById: null,
        approvedAt: null,
      },
    });
  }

  /** Lists activity signals within the caller's scope. */
  async listSignals(user: AuthenticatedUser, query: ListSignalsQuery) {
    const scopeFilter = await this.scopedEmployeeIds(user, query.employeeId);

    return prisma.employeeActivitySignal.findMany({
      where: {
        ...(scopeFilter ? { employeeId: { in: scopeFilter } } : {}),
        ...(query.period ? { period: query.period } : {}),
        ...(query.approvalStatus ? { approvalStatus: query.approvalStatus } : {}),
      },
      orderBy: [{ period: 'desc' }, { signalKey: 'asc' }],
      include: {
        employee: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  /**
   * Approves or rejects a signal.
   *
   * Approval is an explicit human act: it records who decided and when, and it
   * is the only path by which a signal can influence an engagement score. The
   * caller must also be allowed to see the signal's employee, otherwise the
   * route permission alone would let a manager approve any employee's activity
   * data by guessing an id.
   */
  async approveSignal(signalId: string, input: ApproveSignalInput, user: AuthenticatedUser) {
    const signal = await prisma.employeeActivitySignal.findUnique({
      where: { id: signalId },
      select: { id: true, value: true, period: true, signalKey: true, employeeId: true },
    });
    if (!signal) throw new NotFoundError('Activity signal');

    await assertCanAccessEmployee(user, signal.employeeId);

    const status = input.status;
    return prisma.employeeActivitySignal.update({
      where: { id: signal.id },
      data: {
        approvalStatus: status,
        approvedById: status === 'PENDING' ? null : user.id,
        approvedAt: status === 'PENDING' ? null : new Date(),
        ...(input.note !== undefined ? { note: input.note } : {}),
      },
      include: { employee: { select: { id: true, firstName: true, lastName: true } } },
    });
  }

  /**
   * Materialised domain scores for a period, honouring caller scope.
   *
   * Team, department and organisation rows are aggregates of *other* people's
   * data, so they are gated on organisation-wide read access rather than on an
   * employee list. Filtering them by the caller's employee ids is not an option:
   * a team row's key is a team id, so an id filter silently returns nothing (or,
   * worse, the right row for the wrong reason). Scoped callers get their own
   * employee rows and a 403 for a level they may not see.
   */
  async domainScores(user: AuthenticatedUser, query: DomainScoresQuery) {
    const period = query.period ?? periodOf(new Date());
    const scope = await this.scopedEmployeeIds(user, query.employeeId);
    const { canReadAll } = await resolveScope(user);

    // Any level above EMPLOYEE aggregates other people's data.
    if (query.level && query.level !== 'EMPLOYEE' && !canReadAll) {
      throw new ForbiddenError(
        `Organisation-wide ${query.level.toLowerCase()} scores are restricted to users who can read every employee`,
      );
    }

    if (query.level && query.level !== 'EMPLOYEE' && query.level !== 'ORGANISATION') {
      return domainScoreService.read(period, { level: query.level });
    }

    return domainScoreService.read(period, {
      level: query.level,
      // Only a personal view is filtered by scope; organisation rows are gated
      // by the route permission, not by an employee list.
      ...(query.employeeId ? { employeeIds: scope ?? [query.employeeId] } : {}),
    });
  }

  /**
   * Employee ids a caller may see, or `undefined` when unrestricted.
   *
   * A requested id outside the caller's scope collapses to an empty list, which
   * matches no rows, rather than being trusted.
   */
  private async scopedEmployeeIds(user: AuthenticatedUser, requestedEmployeeId?: string): Promise<string[] | undefined> {
    const scope = await resolveScope(user);
    if (scope.canReadAll) return requestedEmployeeId ? [requestedEmployeeId] : undefined;

    const allowed = [...new Set([...scope.selfEmployeeIds, ...scope.teamEmployeeIds])];
    if (!requestedEmployeeId) return allowed;
    return allowed.includes(requestedEmployeeId) ? [requestedEmployeeId] : [];
  }
}

export const intelligenceService = new IntelligenceService();
