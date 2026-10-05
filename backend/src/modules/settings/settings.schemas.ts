import { z } from 'zod';
import { DEFAULT_PRIVACY_SETTINGS } from './settings.defaults';

/**
 * Admin-editable settings. The shape mirrors `PrivacySettings`, and the range
 * checks here are what stop an administrator from disabling anonymity controls
 * or setting a reporting threshold that would deanonymise a small group.
 */
export const privacySettingsSchema = z
  .object({
    feedbackEnabled: z.boolean(),
    feedbackAllowAnonymous: z.boolean(),
    feedbackAnonymousSelfVisible: z.boolean(),
    feedbackManagerVisible: z.boolean(),
    reportingMinimumGroupSize: z.coerce.number().int().min(1).max(1000),
    checkInsEnabled: z.boolean(),
    checkInMinimumGroupSize: z.coerce.number().int().min(1).max(1000),
  })
  .refine(
    (value) => !(value.feedbackAnonymousSelfVisible && !value.feedbackAllowAnonymous),
    {
      message: 'Anonymous self-visibility requires anonymous submissions to be enabled',
      path: ['feedbackAnonymousSelfVisible'],
    },
  )
  .refine((value) => value.checkInMinimumGroupSize >= value.reportingMinimumGroupSize, {
    message: 'The check-in threshold must be at least the general reporting threshold',
    path: ['checkInMinimumGroupSize'],
  });

export type PrivacySettingsInput = z.infer<typeof privacySettingsSchema>;

/** Defaults, exposed so the Settings page can render the current effective state. */
export const defaultPrivacySettings = DEFAULT_PRIVACY_SETTINGS;
