import { logger } from '../../../core/logger';
import { prisma } from '../../../core/prisma';
import {
  ENGAGEMENT_THEMES,
  SENTIMENT_CLASSES,
  type AnalyticsDimension,
  type AnalyticsLevel,
} from '../../../core/enums';
import { DEFAULT_PRIVACY_SETTINGS } from '../../settings/settings.defaults';
import { engagementCalculator } from './engagement.calculator';

/** One materialised figure, already subject to suppression. */
export interface DomainScoreRow {
  period: string;
  domain: AnalyticsLevel;
  domainKey: string;
  domainName: string;
  dimension: AnalyticsDimension;
  value: number;
  sampleSize: number;
  suppressed: boolean;
}

export interface AggregateResult {
  period: string;
  levels: Record<AnalyticsLevel, DomainScoreRow[]>;
  threshold: number;
  calculatedAt: string;
  /** Employee scoring performed as part of this rebuild. */
  scored: number;
  skipped: number;
}

/**
 * Rolls employee-level facts up into the domains the dashboard reads.
 *
 * Two rules make these numbers safe to show:
 *
 * 1. **Suppression is applied before storage, not at read time.** A group
 *    below `reportingMinimumGroupSize` is written with `suppressed = true` and
 *    `value = 0`. The read path returns the flag, so no API can accidentally
 *    serve a real average for a group of two - and the decision itself is
 *    auditable after the fact.
 * 2. **Employee-level rows are exempt.** An employee may always read their own
 *    score; applying a group threshold to a group of one would make the
 *    personal view useless.
 */
export class DomainScoreService {
  /**
   * Computes and persists every level for a period.
   *
   * `employeeIds` scopes the run: pass the caller's allowed employees to build
   * a personal view, or omit it for the full organisation.
   */
  async rebuild(period: string, options: { employeeIds?: string[]; threshold?: number } = {}): Promise<AggregateResult> {
    const threshold = Math.max(options.threshold ?? DEFAULT_PRIVACY_SETTINGS.reportingMinimumGroupSize, 1);

    // Employee scores are the base of every roll-up, so make sure they exist.
    // The counts are reported so a caller can see how many employees were
    // actually scored, rather than scoring them separately and paying twice.
    let scored = 0;
    let skipped = 0;

    if (options.employeeIds) {
      for (const employeeId of options.employeeIds) {
        try {
          await engagementCalculator.calculateForEmployee(employeeId, period);
        } catch (error) {
          skipped += 1;
          logger.error('Failed to score employee during aggregation', {
            employeeId,
            period,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      scored = options.employeeIds.length - skipped;
    } else {
      const result = await engagementCalculator.calculateForAll(period);
      scored = result.scored;
      skipped = result.skipped;
    }

    const employees = await prisma.employee.findMany({
      where: {
        deletedAt: null,
        status: { not: 'TERMINATED' },
        ...(options.employeeIds ? { id: { in: options.employeeIds } } : {}),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        departmentId: true,
        department: { select: { name: true } },
        user: {
          select: { managedRecords: { where: { endedAt: null }, select: { managerUserId: true } } },
        },
      },
    });

    const employeeIds = employees.map((employee) => employee.id);

    const [scores, sentiment, themes] = await Promise.all([
      prisma.engagementScore.findMany({
        where: { employeeId: { in: employeeIds }, period },
        select: { employeeId: true, overallScore: true },
      }),
      prisma.sentimentAnalysis.findMany({
        where: { employeeId: { in: employeeIds }, period, method: { in: ['AI', 'LEXICON'] } },
        select: { employeeId: true, label: true, score: true },
      }),
      prisma.themeDetection.findMany({
        // The `in` filter already excludes anonymous analyses, whose employeeId
        // is null, so no unattributed theme can reach a group.
        where: { analysis: { employeeId: { in: employeeIds }, period } },
        select: { theme: true, confidence: true, analysis: { select: { employeeId: true } } },
      }),
    ]);

    const scoreByEmployee = new Map(scores.map((row) => [row.employeeId, row.overallScore]));

    // Unattributed rows (anonymous feedback) have no employee, so they are
    // excluded from employee/team/department rolls. They are deliberately not
    // folded into the organisation either: doing so would let anonymous
    // submissions shift a number that is otherwise per-employee.
    const attributedSentiment = sentiment.filter(
      (row): row is { employeeId: string; label: string; score: number } => row.employeeId !== null,
    );
    const attributedThemes = themes.filter(
      (row): row is { theme: string; confidence: number; analysis: { employeeId: string } } =>
        row.analysis.employeeId !== null,
    );

    /** Groups of employees, in the order the levels are reported. */
    const groups = this.buildGroups(employees, scoreByEmployee, attributedSentiment, attributedThemes);

    const rows: DomainScoreRow[] = [];
    for (const group of groups) {
      for (const row of this.computeGroup(group, threshold)) rows.push(row);
    }

    await this.persist(rows, period);

    const levels = groupByLevel(rows);
    logger.info('Domain scores rebuilt', { period, rows: rows.length, threshold });

    return { period, levels, threshold, scored, skipped, calculatedAt: new Date().toISOString() };
  }

  /**
   * Builds the employee / team / department / organisation groupings.
   *
   * `TEAM` is derived from the `Manager` table, so it means the same thing as
   * everywhere else in the product rather than being a separate concept here.
   */
  private buildGroups(
    employees: Awaited<ReturnType<typeof prisma.employee.findMany<{
      select: {
        id: true; firstName: true; lastName: true; departmentId: true;
        department: { select: { name: true } };
        user: { select: { managedRecords: { where: { endedAt: null }; select: { managerUserId: true } } } };
      };
    }>>>,
    scoreByEmployee: Map<string, number>,
    sentiment: { employeeId: string; label: string; score: number }[],
    themes: { theme: string; confidence: number; analysis: { employeeId: string } }[],
  ): Group[] {
    const groups: Group[] = [];

    for (const employee of employees) {
      groups.push({
        domain: 'EMPLOYEE',
        domainKey: employee.id,
        domainName: `${employee.firstName} ${employee.lastName}`,
        employeeIds: [employee.id],
        engagementValues: scoreByEmployee.has(employee.id) ? [scoreByEmployee.get(employee.id)!] : [],
        sentiment,
        themes,
        // Personal view: never suppressed.
        exemptFromThreshold: true,
      });
    }

    // Team = every manager's direct reports, in one group each.
    const managedByUser = new Map<string, string[]>();
    for (const employee of employees) {
      for (const record of employee.user?.managedRecords ?? []) {
        const existing = managedByUser.get(record.managerUserId) ?? [];
        existing.push(employee.id);
        managedByUser.set(record.managerUserId, existing);
      }
    }

    let teamIndex = 0;
    for (const [managerUserId, memberIds] of managedByUser) {
      teamIndex += 1;
      groups.push({
        domain: 'TEAM',
        domainKey: managerUserId,
        domainName: `Team ${teamIndex}`,
        employeeIds: memberIds,
        engagementValues: memberIds.map((id) => scoreByEmployee.get(id)).filter((v): v is number => v !== undefined),
        sentiment,
        themes,
        exemptFromThreshold: false,
      });
    }

    const byDepartment = new Map<string, { name: string; ids: string[] }>();
    for (const employee of employees) {
      if (!employee.departmentId) continue;
      const entry = byDepartment.get(employee.departmentId) ?? {
        name: employee.department?.name ?? 'Unknown',
        ids: [],
      };
      entry.ids.push(employee.id);
      byDepartment.set(employee.departmentId, entry);
    }

    for (const [departmentId, entry] of byDepartment) {
      groups.push({
        domain: 'DEPARTMENT',
        domainKey: departmentId,
        domainName: entry.name,
        employeeIds: entry.ids,
        engagementValues: entry.ids.map((id) => scoreByEmployee.get(id)).filter((v): v is number => v !== undefined),
        sentiment,
        themes,
        exemptFromThreshold: false,
      });
    }

    groups.push({
      domain: 'ORGANISATION',
      domainKey: 'ALL',
      domainName: 'Organisation',
      employeeIds: employees.map((employee) => employee.id),
      engagementValues: employees
        .map((employee) => scoreByEmployee.get(employee.id))
        .filter((value): value is number => value !== undefined),
      sentiment,
      themes,
      exemptFromThreshold: false,
    });

    return groups;
  }

  /** Computes every dimension for one group, applying the threshold. */
  private computeGroup(group: Group, threshold: number): DomainScoreRow[] {
    const rows: DomainScoreRow[] = [];

    const sentimentForGroup = group.sentiment.filter((row) => group.employeeIds.includes(row.employeeId));
    const themesForGroup = group.themes.filter((row) => group.employeeIds.includes(row.analysis.employeeId));

    const push = (dimension: AnalyticsDimension, value: number | null, sampleSize: number) => {
      const suppressed = !group.exemptFromThreshold && sampleSize < threshold;
      rows.push({
        period: '',
        domain: group.domain,
        domainKey: group.domainKey,
        domainName: group.domainName,
        dimension,
        // A suppressed row must never carry a real value, so it stores 0.
        value: value === null || suppressed ? 0 : round(value),
        sampleSize,
        suppressed,
      });
    };

    push('ENGAGEMENT', mean(group.engagementValues), group.engagementValues.length);

    for (const label of SENTIMENT_CLASSES) {
      const matching = sentimentForGroup.filter((row) => row.label === label);
      // Sentiment dimensions are shares, so the group size is the denominator.
      const share = sentimentForGroup.length > 0 ? matching.length / sentimentForGroup.length : null;
      push(`SENTIMENT_${label}` as AnalyticsDimension, share, sentimentForGroup.length);
    }

    const polarityValues = sentimentForGroup.map((row) => row.score);
    push('SENTIMENT_POLARITY' as AnalyticsDimension, mean(polarityValues), polarityValues.length);

    for (const theme of ENGAGEMENT_THEMES) {
      const matching = themesForGroup.filter((row) => row.theme === theme);
      const share = themesForGroup.length > 0 ? matching.length / themesForGroup.length : null;
      push(theme, share, themesForGroup.length);
    }

    return rows;
  }

  private async persist(rows: DomainScoreRow[], period: string): Promise<void> {
    if (rows.length === 0) return;

    // One transaction per batch: a partially written aggregation would show
    // half-old, half-new numbers with no way for the reader to tell.
    const BATCH = 200;
    for (let index = 0; index < rows.length; index += BATCH) {
      const chunk = rows.slice(index, index + BATCH);
      await prisma.$transaction(
        chunk.map((row) =>
          prisma.engagementDomainScore.upsert({
            where: {
              period_domain_domainKey_dimension: {
                period,
                domain: row.domain,
                domainKey: row.domainKey,
                dimension: row.dimension,
              },
            },
            create: { ...row, period },
            update: {
              domainName: row.domainName,
              value: row.value,
              sampleSize: row.sampleSize,
              suppressed: row.suppressed,
              calculatedAt: new Date(),
            },
          }),
        ),
      );
    }
  }

  /** Reads materialised scores back for a period, honouring caller scope. */
  async read(
    period: string,
    options: { level?: AnalyticsLevel; employeeIds?: string[] } = {},
  ): Promise<DomainScoreRow[]> {
    const rows = await prisma.engagementDomainScore.findMany({
      where: {
        period,
        ...(options.level ? { domain: options.level } : {}),
        // A personal view may only ever return that person's own rows.
        ...(options.employeeIds ? { domainKey: { in: options.employeeIds } } : {}),
      },
      orderBy: [{ domain: 'asc' }, { dimension: 'asc' }],
    });

    return rows as DomainScoreRow[];
  }
}

interface Group {
  domain: AnalyticsLevel;
  domainKey: string;
  domainName: string;
  employeeIds: string[];
  engagementValues: number[];
  sentiment: { employeeId: string; label: string; score: number }[];
  themes: { theme: string; confidence: number; analysis: { employeeId: string } }[];
  exemptFromThreshold: boolean;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function groupByLevel(rows: DomainScoreRow[]): Record<AnalyticsLevel, DomainScoreRow[]> {
  const levels = { EMPLOYEE: [], TEAM: [], DEPARTMENT: [], ORGANISATION: [] } as Record<AnalyticsLevel, DomainScoreRow[]>;
  for (const row of rows) levels[row.domain]?.push(row);
  return levels;
}

export const domainScoreService = new DomainScoreService();
