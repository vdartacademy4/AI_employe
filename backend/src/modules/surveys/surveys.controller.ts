import type { Request, Response } from 'express';
import { asyncHandler } from '../../core/async-handler';
import {
  changeSurveyStatusSchema,
  createSurveySchema,
  listSurveysQuerySchema,
  submitResponseSchema,
  surveyIdParamSchema,
  updateSurveySchema,
} from './surveys.schemas';
import { surveysService } from './surveys.service';

export const surveysController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const query = listSurveysQuerySchema.parse(req.query);
    const { items, meta } = await surveysService.list(req.user!, query);
    res.status(200).json({ data: items, meta });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const { id } = surveyIdParamSchema.parse(req.params);
    const data = await surveysService.getById(id);
    res.status(200).json({ data });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const input = createSurveySchema.parse(req.body);
    const data = await surveysService.create(req.user!, input);
    res.status(201).json({ data });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const { id } = surveyIdParamSchema.parse(req.params);
    const input = updateSurveySchema.parse(req.body);
    const data = await surveysService.update(id, input);
    res.status(200).json({ data });
  }),

  changeStatus: asyncHandler(async (req: Request, res: Response) => {
    const { id } = surveyIdParamSchema.parse(req.params);
    const { status } = changeSurveyStatusSchema.parse(req.body);
    const data = await surveysService.changeStatus(id, status);
    res.status(200).json({ data });
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    const { id } = surveyIdParamSchema.parse(req.params);
    await surveysService.remove(id);
    res.status(204).send();
  }),

  myResponse: asyncHandler(async (req: Request, res: Response) => {
    const { id } = surveyIdParamSchema.parse(req.params);
    const data = await surveysService.getOwnResponse(req.user!, id);
    res.status(200).json({ data });
  }),

  submitResponse: asyncHandler(async (req: Request, res: Response) => {
    const input = submitResponseSchema.parse(req.body);
    const data = await surveysService.submitResponse(req.user!, input);
    res.status(201).json({ data });
  }),

  results: asyncHandler(async (req: Request, res: Response) => {
    const { id } = surveyIdParamSchema.parse(req.params);
    const data = await surveysService.getResults(req.user!, id);
    res.status(200).json({ data });
  }),
};
