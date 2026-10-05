import { prisma } from '../../core/prisma';
import { NotFoundError, ValidationError } from '../../core/errors';
import { employeeIdFilter } from '../../core/scope';
import { logger } from '../../core/logger';
import { roleHasPermission } from '../auth/permissions';
import { PERMISSIONS } from '../auth/permissions';
import type { AuthenticatedUser } from '../../types/express';
import type { ListRiskQuery, RunRiskModelInput } from './risk.schemas';

export interface RiskFactor {
  key: string;
  label: string;
  /** Signed contribution to the final score. */
  impact: number;
  detail: string;
}

/** Score bands shared with the frontend so both sides colour risks identically. */
export function riskLevelFor(score: number): string {
  if (score >= 75) return 'CRITICAL';
  if (score >= 55) return 'HIGH';
  if (score >= 35) return 'MODERATE';
  return 'LOW';
}

export class RiskService {
  async list(user: AuthenticatedUser, query: ListRiskQuery) {
    const scopeFilter = await employeeIdFilter(user, query.employeeId);

    const where = {
      ...(scopeFilter ?? {}),
      ...(query.riskLevel ? { riskLevel: query.riskLevel } : {}),
      ...(query.departmentId ? { employee: { departmentId: query.departmentId } } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.riskPrediction.findMany({
        where,
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              jobTitle: true,
              department: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { riskScore: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.riskPrediction.count({ where }),
    ]);

    return {
      items,
      meta: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) },
    };
  }

  async getForEmployee(user: AuthenticatedUser, employeeId: string) {
    const scopeFilter = await employeeIdFilter(user, employeeId);
    const predictions = await prisma.riskPrediction.findMany({
      where: { ...(scopeFilter ?? {}) },
      orderBy: { predictedAt: 'desc' },
      take: 20,
    });
    if (predictions.length === 0) throw new NotFoundError('Risk predictions for this employee');
    return predictions;
  }

  /**
   * Deterministic, fully explainable heuristic scorer.
   *
   * This is intentionally a transparent baseline rather than a learned model:
   * it derives its inputs only from data the organisation has actually
   * recorded, and every point it awards is returned in `factors` so a manager
   * can see exactly why someone was flagged. The interface matches what a
   * trained model will need (factors, model version, confidence, horizon), so
   * swapping in a real model later is a provider swap, not a schema change.
   */
  async runModel(user: AuthenticatedUser, input: RunRiskModelInput) {
    if (!roleHasPermission(user.role, PERMISSIONS.RISK_MODEL_RUN)) {
      throw new ValidationError('Your role cannot run the risk model');
    }

    const employees = await prisma.employee.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        ...(input.departmentId ? { departmentId: input.departmentId } : {}),
      },
      include: {
        engagementScores: { orderBy: { period: 'desc' }, take: 6 },
        feedbackReceived: {
          where: { sentiment: { in: ['NEGATIVE', 'MIXED'] } },
          select: { sentiment: true, sentimentScore: true, createdAt: true },
        },
        _count: { select: { directReports: true } },
        department: { select: { id: true, name: true } },
      },
    });

    if (employees.length === 0) {
      return { modelVersion: input.modelVersion, evaluated: 0, predictions: [], generatedAt: new Date() };
    }

    const now = Date.now();
    const created: { id: string; employeeId: string; riskScore: number; riskLevel: string }[] = [];

    for (const employee of employees) {
      const factors: RiskFactor[] = [];
      const scores = employee.engagementScores;
      const latest = scores[0];
      const previous = scores[1];

      if (latest && latest.overallScore < 60) {
        factors.push({
          key: 'low_engagement',
          label: 'Low engagement score',
          impact: (60 - latest.overallScore) * 0.9,
          detail: `Latest engagement ${latest.overallScore} for ${latest.period}`,
        });
      }

      if (latest && previous && latest.overallScore < previous.overallScore - 10) {
        const drop = previous.overallScore - latest.overallScore;
        factors.push({
          key: 'engagement_drop',
          label: 'Sharp engagement decline',
          impact: Math.min(25, drop * 1.1),
          detail: `Fell ${drop.toFixed(1)} points between ${previous.period} and ${latest.period}`,
        });
      }

      if (latest && latest.eNps !== null && latest.eNps < 0) {
        factors.push({
          key: 'negative_enps',
          label: 'Negative promoter score',
          impact: Math.min(18, Math.abs(latest.eNps) * 0.35),
          detail: `eNPS of ${latest.eNps} in ${latest.period}`,
        });
      }

      const ninetyDaysAgo = now - 90 * 86_400_000;
      const recentNegative = employee.feedbackReceived.filter(
        (feedback) => feedback.createdAt.getTime() >= ninetyDaysAgo,
      );
      if (recentNegative.length > 0) {
        factors.push({
          key: 'negative_feedback',
          label: 'Recent negative feedback',
          impact: Math.min(20, recentNegative.length * 4),
          detail: `${recentNegative.length} negative or mixed item(s) in the last 90 days`,
        });
      }

      if (employee._count.directReports > 8) {
        factors.push({
          key: 'span_of_control',
          label: 'Wide span of control',
          impact: Math.min(10, (employee._count.directReports - 8) * 1.5),
          detail: `${employee._count.directReports} direct reports`,
        });
      }

      const tenureMonths = employee.hireDate
        ? (now - employee.hireDate.getTime()) / (30 * 86_400_000)
        : null;
      if (tenureMonths !== null && tenureMonths < 6) {
        factors.push({
          key: 'early_tenure',
          label: 'Early tenure',
          impact: 8,
          detail: `${tenureMonths.toFixed(1)} months since hire date`,
        });
      }

      const riskScore = Math.max(
        0,
        Math.min(100, Math.round(factors.reduce((sum, factor) => sum + factor.impact, 0))),
      );
      const riskLevel = riskLevelFor(riskScore);

      // With no contributing factors there is nothing to report; recording a
      // zero-risk row for everyone would be noise, not signal.
      if (factors.length === 0) continue;

      // Fewer inputs means less confidence in the score.
      const confidence = Math.min(0.9, 0.35 + factors.length * 0.1 + (scores.length > 1 ? 0.15 : 0));

      const prediction = await prisma.riskPrediction.create({
        data: {
          employeeId: employee.id,
          riskScore,
          riskLevel,
          factors: JSON.stringify(factors),
          modelVersion: input.modelVersion,
          confidence,
          horizonDays: input.horizonDays,
          explanation:
            factors.length > 0
              ? factors.map((factor) => `${factor.label}: ${factor.detail}`).join('; ')
              : null,
        },
        select: { id: true, employeeId: true, riskScore: true, riskLevel: true },
      });

      created.push(prediction);

      if (riskLevel === 'CRITICAL' || riskLevel === 'HIGH') {
        await this.raiseAlert(employee.id, prediction.id, riskScore, riskLevel, factors);
      }
    }

    logger.info('Risk model run', {
      modelVersion: input.modelVersion,
      evaluated: employees.length,
      flagged: created.length,
    });

    return {
      modelVersion: input.modelVersion,
      evaluated: employees.length,
      predictions: created,
      generatedAt: new Date(),
    };
  }

  /** Opens an alert, de-duplicating against an existing open alert. */
  private async raiseAlert(
    employeeId: string,
    riskPredictionId: string,
    riskScore: number,
    riskLevel: string,
    factors: RiskFactor[],
  ): Promise<void> {
    const existing = await prisma.alert.findFirst({
      where: { employeeId, riskPredictionId, status: { in: ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS'] } },
    });
    if (existing) return;

    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { firstName: true, lastName: true },
    });

    await prisma.alert.create({
      data: {
        type: 'RISK_ESCALATION',
        severity: riskLevel === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
        title: `${riskLevel} attrition risk: ${employee?.firstName ?? ''} ${employee?.lastName ?? ''}`.trim(),
        message: `Risk score ${riskScore}. Primary factors: ${factors
          .slice(0, 3)
          .map((factor) => factor.label)
          .join(', ')}.`,
        employeeId,
        riskPredictionId,
        status: 'OPEN',
      },
    });
  }
}

export const riskService = new RiskService();
