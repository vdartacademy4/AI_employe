import { logger } from '../../core/logger';
import { prisma } from '../../core/prisma';
import { SENTIMENT_SOURCES, type SentimentSource } from '../../core/enums';
import type { Prisma } from '@prisma/client';
import { getAiProvider } from '../ai/providers/provider.factory';
import { nlpService, type TextAnalysis } from './sentiment/nlp.service';

/** `YYYY-MM` for a date, in server-local time to match the period convention. */
export function periodOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** A unit of analysable text, resolved from whichever table it lives in. */
interface AnalysisTarget {
  sourceType: SentimentSource;
  sourceId: string;
  text: string;
  /** Null when the text cannot be attributed to a person (anonymous feedback). */
  employeeId: string | null;
  /** Mirrors the analysis row onto the source record for cheap list views. */
  responseId?: string;
  createdAt: Date;
}

export interface AnalyseOptions {
  /** Restrict to one source, or omit for all. */
  sources?: SentimentSource[];
  /** Only text created at or after this instant. */
  since?: Date;
  /** Only text created strictly before this instant. Half-open, so a period
   * refresh can be bounded to exactly one `YYYY-MM` month. */
  until?: Date;
  /** Maximum records to process per source in this run. */
  limitPerSource?: number;
  /** Re-analyse records that already have a result. */
  reanalyze?: boolean;
}

export interface RunSummary {
  analysed: number;
  skipped: number;
  failed: number;
  bySource: Record<string, { analysed: number; skipped: number; failed: number }>;
  provider: string;
  providerConfigured: boolean;
  ranAt: string;
}

/**
 * Drives NLP over the platform's own text and persists the results.
 *
 * Design rules:
 *  - **Real data only.** Every target is a row that exists; nothing is invented
 *    and an empty database produces an empty run, not sample sentiment.
 *  - **Idempotent.** `(sourceType, sourceId)` is unique, so re-running updates
 *    in place instead of inflating the aggregates.
 *  - **Attribution is honest.** Anonymous feedback is analysed and counted but
 *    stored with no employee, so it can never be traced back to a person.
 *  - **Failures are contained.** One bad record must not abort a batch, so a
 *    failure is counted, logged and skipped.
 */
export class AnalysisPipeline {
  /** Analyses every configured source and reports what happened. */
  async run(options: AnalyseOptions = {}): Promise<RunSummary> {
    const limit = clampLimit(options.limitPerSource);
    const sources = options.sources?.length ? options.sources : [...SENTIMENT_SOURCES];
    const provider = getAiProvider();

    const summary: RunSummary = {
      analysed: 0,
      skipped: 0,
      failed: 0,
      bySource: {},
      provider: provider.id,
      providerConfigured: provider.isConfigured(),
      ranAt: new Date().toISOString(),
    };

    for (const source of sources) {
      const counters = { analysed: 0, skipped: 0, failed: 0 };
      summary.bySource[source] = counters;

      let targets: AnalysisTarget[];
      try {
        targets = await this.collect(source, {
        limit,
        since: options.since,
        until: options.until,
        reanalyze: options.reanalyze,
      });
      } catch (error) {
        logger.error('Failed to collect analysis targets', {
          source,
          error: error instanceof Error ? error.message : String(error),
        });
        counters.failed += 1;
        summary.failed += 1;
        continue;
      }

      for (const target of targets) {
        // Anything too short to classify is recorded as skipped, not stored as
        // a fake neutral reading that would dilute the aggregates.
        if (target.text.trim().length < 8) {
          counters.skipped += 1;
          continue;
        }

        try {
          const analysis = await nlpService.analyse(target.text);
          if (analysis.method === 'UNSCORED') {
            counters.skipped += 1;
            continue;
          }

          await this.persist(target, analysis);
          counters.analysed += 1;
        } catch (error) {
          counters.failed += 1;
          logger.error('Failed to persist sentiment analysis', {
            source: target.sourceType,
            sourceId: target.sourceId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      summary.analysed += counters.analysed;
      summary.skipped += counters.skipped;
      summary.failed += counters.failed;
    }

    logger.info('Sentiment analysis run complete', {
      analysed: summary.analysed,
      skipped: summary.skipped,
      failed: summary.failed,
      provider: summary.provider,
    });

    return summary;
  }

  /** Reads one source's analysable text, excluding anything already stored. */
  private async collect(
    source: SentimentSource,
    options: { limit: number; since?: Date; until?: Date; reanalyze?: boolean },
  ): Promise<AnalysisTarget[]> {
    const since = options.since;
    // Half-open range, so a bounded run covers [since, until) exactly.
    const dateRange =
      since || options.until
        ? { ...(since ? { gte: since } : {}), ...(options.until ? { lt: options.until } : {}) }
        : undefined;
    const reanalyze = options.reanalyze ?? false;

    if (source === 'FEEDBACK') {
      const rows = await prisma.feedback.findMany({
        where: {
          ...(dateRange ? { createdAt: dateRange } : {}),
          // Re-analysing means "forget the previous answer", so only rows that
          // already have one are excluded when not re-analysing.
          ...(reanalyze ? {} : { sentiment: null }),
        },
        select: {
          id: true,
          title: true,
          content: true,
          isAnonymous: true,
          createdAt: true,
          // Employee lives on the user record, one-to-one, so the attribution
          // hop for feedback is author -> employee.
          author: { select: { employee: { select: { id: true } } } },
        },
        orderBy: { createdAt: 'asc' },
        take: options.limit,
      });

      return rows.map((row) => ({
        sourceType: 'FEEDBACK',
        sourceId: row.id,
        // The title carries signal the body often lacks, so both are analysed.
        text: joinText(row.title, row.content),
        // Anonymous means unattributable, full stop.
        employeeId: row.isAnonymous ? null : (row.author?.employee?.id ?? null),
        createdAt: row.createdAt,
      }));
    }

    if (source === 'SURVEY_RESPONSE') {
      const rows = await prisma.surveyResponse.findMany({
        where: {
          status: 'SUBMITTED',
          ...(dateRange ? { submittedAt: dateRange } : {}),
          ...(reanalyze ? {} : { sentiment: null }),
        },
        select: {
          id: true,
          employeeId: true,
          submittedAt: true,
          createdAt: true,
          answers: {
            where: { question: { type: 'FREE_TEXT' }, valueText: { not: null } },
            select: { valueText: true },
          },
        },
        orderBy: { createdAt: 'asc' },
        take: options.limit,
      });

      return rows
        .map((row) => ({
          sourceType: 'SURVEY_RESPONSE' as const,
          sourceId: row.id,
          // Rating questions are scored numerically, not classified; only the
          // written comments carry sentiment.
          text: row.answers.map((answer) => answer.valueText ?? '').join(' '),
          employeeId: row.employeeId,
          responseId: row.id,
          createdAt: row.submittedAt ?? row.createdAt,
        }))
        .filter((target) => target.text.trim().length > 0);
    }

    if (source === 'CHECK_IN_NOTE') {
      const rows = await prisma.employeeCheckIn.findMany({
        where: {
          note: { not: null },
          ...(dateRange ? { createdAt: dateRange } : {}),
          ...(reanalyze ? {} : { sentiment: null }),
        },
        select: { id: true, employeeId: true, note: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
        take: options.limit,
      });

      return rows
        .filter((row): row is typeof row & { note: string } => Boolean(row.note))
        .map((row) => ({
          sourceType: 'CHECK_IN_NOTE' as const,
          sourceId: row.id,
          text: row.note,
          employeeId: row.employeeId,
          createdAt: row.createdAt,
        }));
    }

    // DAILY_FEEDBACK: the employee's own written feedback from the pulse. The
    // author is known here by construction, so the attribution is honest.
    if (source === 'DAILY_FEEDBACK') {
      const analysedIds = reanalyze
        ? []
        : (
            await prisma.sentimentAnalysis.findMany({
              where: { sourceType: 'DAILY_FEEDBACK' },
              select: { sourceId: true },
            })
          ).map((row) => row.sourceId);

      const rows = await prisma.employeeFeedback.findMany({
        where: {
          ...(dateRange ? { createdAt: dateRange } : {}),
          ...(analysedIds.length > 0 ? { id: { notIn: analysedIds } } : {}),
        },
        select: { id: true, employeeId: true, content: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
        take: options.limit,
      });

      return rows.map((row) => ({
        sourceType: 'DAILY_FEEDBACK' as const,
        sourceId: row.id,
        text: row.content,
        employeeId: row.employeeId,
        createdAt: row.createdAt,
      }));
    }

    // DAILY_ANSWER: the free-text answer to one of the five daily questions.
    // The question set guarantees one text answer per submission, so this is
    // the pulse's most reliably present prose - unlike the optional written
    // comment, which an employee may skip. The author is known by construction.
    if (source === 'DAILY_ANSWER') {
      const analysedIds = reanalyze
        ? []
        : (
            await prisma.sentimentAnalysis.findMany({
              where: { sourceType: 'DAILY_ANSWER' },
              select: { sourceId: true },
            })
          ).map((row) => row.sourceId);

      const rows = await prisma.dailyQuestionAnswer.findMany({
        where: {
          textValue: { not: null },
          ...(dateRange ? { createdAt: dateRange } : {}),
          ...(analysedIds.length > 0 ? { id: { notIn: analysedIds } } : {}),
        },
        select: {
          id: true,
          employeeId: true,
          textValue: true,
          // The prompt is prepended so a bare "it was fine" still classifies in
          // context; without it a one-word answer carries no theme signal.
          question: { select: { prompt: true } },
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
        take: options.limit,
      });

      return rows
        .filter((row): row is typeof row & { textValue: string } => Boolean(row.textValue))
        .map((row) => ({
          sourceType: 'DAILY_ANSWER' as const,
          sourceId: row.id,
          text: joinText(row.question.prompt, row.textValue),
          employeeId: row.employeeId,
          createdAt: row.createdAt,
        }));
    }

    // ANONYMOUS_FEEDBACK: analysed for organisation-level aggregates but stored
    // with employeeId null. The table has no author column, so there is nothing
    // to attribute and nothing to accidentally leak.
    if (source === 'ANONYMOUS_FEEDBACK') {
      const analysedIds = reanalyze
        ? []
        : (
            await prisma.sentimentAnalysis.findMany({
              where: { sourceType: 'ANONYMOUS_FEEDBACK' },
              select: { sourceId: true },
            })
          ).map((row) => row.sourceId);

      const rows = await prisma.anonymousFeedback.findMany({
        where: {
          ...(dateRange ? { createdAt: dateRange } : {}),
          ...(analysedIds.length > 0 ? { id: { notIn: analysedIds } } : {}),
        },
        select: { id: true, content: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
        take: options.limit,
      });

      return rows.map((row) => ({
        sourceType: 'ANONYMOUS_FEEDBACK' as const,
        sourceId: row.id,
        text: row.content,
        employeeId: null,
        createdAt: row.createdAt,
      }));
    }

    // CHAT_MESSAGE: only the two surfaces where an employee is describing their
    // own experience. General-purpose questions ("what does eNPS mean?") are
    // excluded by kind, and assistant turns are never analysed.
    const rows = await prisma.aiMessage.findMany({
      where: {
        role: 'user',
        ...(dateRange ? { createdAt: dateRange } : {}),
        conversation: {
          kind: { in: ['CHECK_IN', 'FEEDBACK'] },
          // A conversation whose user has no employee record cannot be
          // attributed, so it is excluded rather than analysed unattributed.
          user: { employee: { isNot: null } },
        },
      },
      select: {
        id: true,
        content: true,
        createdAt: true,
        conversation: { select: { user: { select: { employee: { select: { id: true } } } } } },
      },
      orderBy: { createdAt: 'asc' },
      take: options.limit,
    });

    return rows
      .filter((row): row is typeof row & { conversation: { user: { employee: { id: string } } } } =>
        Boolean(row.conversation?.user?.employee),
      )
      .map((row) => ({
        sourceType: 'CHAT_MESSAGE' as const,
        sourceId: row.id,
        text: row.content,
        employeeId: row.conversation.user.employee.id,
        createdAt: row.createdAt,
      }));
  }

  /**
   * Writes the analysis and its themes, then mirrors the label onto the source
   * row so list views do not need a join.
   */
  private async persist(target: AnalysisTarget, analysis: TextAnalysis): Promise<void> {
    const excerpt = target.text.slice(0, 200);
    const period = periodOf(target.createdAt);

    await prisma.$transaction(async (tx) => {
      const row = await tx.sentimentAnalysis.upsert({
        where: {
          sourceType_sourceId: {
            sourceType: target.sourceType,
            sourceId: target.sourceId,
          },
        },
        create: {
          sourceType: target.sourceType,
          sourceId: target.sourceId,
          employeeId: target.employeeId,
          responseId: target.responseId ?? null,
          period,
          label: analysis.label,
          score: analysis.score,
          confidence: analysis.confidence,
          method: analysis.method,
          provider: analysis.provider,
          model: analysis.model,
          excerpt,
          analyzedAt: new Date(),
        },
        update: {
          employeeId: target.employeeId,
          responseId: target.responseId ?? null,
          period,
          label: analysis.label,
          score: analysis.score,
          confidence: analysis.confidence,
          method: analysis.method,
          provider: analysis.provider,
          model: analysis.model,
          excerpt,
          analyzedAt: new Date(),
        },
        select: { id: true },
      });

      // Themes are fully replaced: a re-analysis that finds fewer themes must
      // not leave the previous ones behind.
      await tx.themeDetection.deleteMany({ where: { analysisId: row.id } });
      if (analysis.themes.length > 0) {
        await tx.themeDetection.createMany({
          data: analysis.themes.map((theme) => ({
            analysisId: row.id,
            theme: theme.theme,
            confidence: theme.confidence,
            evidence: theme.evidence.length > 0 ? theme.evidence.join('|') : null,
          })),
        });
      }

      await this.mirrorToSource(tx, target, analysis);
    });
  }

  /** Keeps the denormalised sentiment columns on the source record in step. */
  private async mirrorToSource(
    tx: Prisma.TransactionClient,
    target: AnalysisTarget,
    analysis: TextAnalysis,
  ): Promise<void> {
    const data = { sentiment: analysis.label, sentimentScore: analysis.score };

    if (target.sourceType === 'FEEDBACK') {
      await tx.feedback.update({ where: { id: target.sourceId }, data });
      return;
    }
    if (target.sourceType === 'SURVEY_RESPONSE' && target.responseId) {
      await tx.surveyResponse.update({ where: { id: target.responseId }, data });
      return;
    }
    if (target.sourceType === 'CHECK_IN_NOTE') {
      await tx.employeeCheckIn.update({ where: { id: target.sourceId }, data });
    }
  }
}

function joinText(...parts: (string | null | undefined)[]): string {
  return parts.map((part) => part?.trim()).filter(Boolean).join('. ');
}

function clampLimit(value: number | undefined): number {
  if (!value) return 200;
  return Math.min(Math.max(value, 1), 1000);
}

export const analysisPipeline = new AnalysisPipeline();
