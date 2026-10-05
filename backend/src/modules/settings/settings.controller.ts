import type { Request, Response } from 'express';
import { asyncHandler } from '../../core/async-handler';
import { privacySettingsSchema } from './settings.schemas';
import { settingsService } from './settings.service';

export const settingsController = {
  getPrivacy: asyncHandler(async (_req: Request, res: Response) => {
    const settings = await settingsService.getPrivacySettings();
    const overridden = await settingsService.overriddenKeys();
    res.status(200).json({ data: { settings, overridden } });
  }),

  updatePrivacy: asyncHandler(async (req: Request, res: Response) => {
    const input = privacySettingsSchema.parse(req.body);
    const settings = await settingsService.updatePrivacySettings(input, req.user!.id);
    res.status(200).json({ data: { settings } });
  }),
};
