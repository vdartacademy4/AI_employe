import type { Request, Response } from 'express';
import { asyncHandler } from '../../core/async-handler';
import {
  analyseRunSchema,
  approveSignalSchema,
  breakdownQuerySchema,
  calculateQuerySchema,
  domainScoresQuerySchema,
  employeeParamSchema,
  engagementTrendsQuerySchema,
  factorConfigParamSchema,
  listSignalsQuerySchema,
  recentAnalysesQuerySchema,
  recordSignalSchema,
  signalParamSchema,
  refreshSchema,
  sentimentTrendsQuerySchema,
  themeTrendsQuerySchema,
  updateFactorConfigSchema,
} from './intelligence.schemas';
import { intelligenceService } from './intelligence.service';

export const intelligenceController = {
  // ---------------------------------------------------------------- trends

  sentimentTrends: asyncHandler(async (req: Request, res: Response) => {
    const query = sentimentTrendsQuerySchema.parse(req.query);
    const data = await intelligenceService.sentimentTrends(req.user!, query);
    res.status(200).json({ data });
  }),

  themeTrends: asyncHandler(async (req: Request, res: Response) => {
    const query = themeTrendsQuerySchema.parse(req.query);
    const data = await intelligenceService.themeTrends(req.user!, query);
    res.status(200).json({ data });
  }),

  engagementTrends: asyncHandler(async (req: Request, res: Response) => {
    const query = engagementTrendsQuerySchema.parse(req.query);
    const data = await intelligenceService.engagementTrends(req.user!, query);
    res.status(200).json({ data });
  }),

  domainScores: asyncHandler(async (req: Request, res: Response) => {
    const query = domainScoresQuerySchema.parse(req.query);
    const data = await intelligenceService.domainScores(req.user!, query);
    res.status(200).json({ data });
  }),

  // ------------------------------------------------------------- employees

  employeeBreakdown: asyncHandler(async (req: Request, res: Response) => {
    const query = breakdownQuerySchema.parse(req.query);
    const data = await intelligenceService.employeeBreakdown(req.user!, query);
    res.status(200).json({ data });
  }),

  employeeDetail: asyncHandler(async (req: Request, res: Response) => {
    const { employeeId } = employeeParamSchema.parse(req.params);
    const query = breakdownQuerySchema.parse(req.query);
    const [rows] = await intelligenceService.employeeBreakdown(req.user!, {
      period: query.period,
      employeeId,
    });
    // The scoped query returns an empty list for an out-of-scope id, so an
    // empty result is reported as 404 rather than an empty success.
    if (!rows) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Employee not found' } });
      return;
    }
    res.status(200).json({ data: rows });
  }),

  // ------------------------------------------------------------ processing

  calculate: asyncHandler(async (req: Request, res: Response) => {
    const query = calculateQuerySchema.parse(req.query);
    const data = await intelligenceService.calculate(req.user!, query);
    res.status(200).json({ data });
  }),

  refresh: asyncHandler(async (req: Request, res: Response) => {
    const input = refreshSchema.parse(req.body);
    const data = await intelligenceService.refresh(input);
    res.status(200).json({ data });
  }),

  runAnalysis: asyncHandler(async (req: Request, res: Response) => {
    const input = analyseRunSchema.parse(req.body);
    const data = await intelligenceService.runAnalysis(input);
    res.status(200).json({ data });
  }),

  // ---------------------------------------------------------------- review

  recentAnalyses: asyncHandler(async (req: Request, res: Response) => {
    const query = recentAnalysesQuerySchema.parse(req.query);
    const data = await intelligenceService.recentAnalyses(req.user!, query);
    res.status(200).json({ data });
  }),

  // --------------------------------------------------------------- config

  factorConfigs: asyncHandler(async (_req: Request, res: Response) => {
    const data = await intelligenceService.factorConfigs();
    res.status(200).json({ data });
  }),

  updateFactorConfig: asyncHandler(async (req: Request, res: Response) => {
    const { factorKey } = factorConfigParamSchema.parse(req.params);
    const input = updateFactorConfigSchema.parse(req.body);
    const data = await intelligenceService.updateFactorConfig(factorKey, input, req.user!.id);
    res.status(200).json({ data });
  }),

  // -------------------------------------------------------------- signals

  recordSignal: asyncHandler(async (req: Request, res: Response) => {
    const input = recordSignalSchema.parse(req.body);
    const data = await intelligenceService.recordSignal(req.user!, input);
    res.status(201).json({ data });
  }),

  listSignals: asyncHandler(async (req: Request, res: Response) => {
    const query = listSignalsQuerySchema.parse(req.query);
    const data = await intelligenceService.listSignals(req.user!, query);
    res.status(200).json({ data });
  }),

  approveSignal: asyncHandler(async (req: Request, res: Response) => {
    const { signalId } = signalParamSchema.parse(req.params);
    const input = approveSignalSchema.parse(req.body);
    const data = await intelligenceService.approveSignal(signalId, input, req.user!);
    res.status(200).json({ data });
  }),
};
