import { prisma } from '../../core/prisma';
import { DEFAULT_PRIVACY_SETTINGS, SETTINGS_KEYS, type PrivacySettings } from './settings.defaults';
import type { PrivacySettingsInput } from './settings.schemas';

/**
 * Settings access with a code-defined default layer.
 *
 * Reads never write: a missing key resolves to the compiled-in default and the
 * table stays empty until someone deliberately saves an override. Writes are
 * whole-object upserts so a partial document can never be persisted.
 */
export class SettingsService {
  async getPrivacySettings(): Promise<PrivacySettings> {
    const row = await prisma.systemSetting.findUnique({ where: { key: SETTINGS_KEYS.PRIVACY } });
    if (!row) return { ...DEFAULT_PRIVACY_SETTINGS };

    return { ...DEFAULT_PRIVACY_SETTINGS, ...parseJson<Partial<PrivacySettings>>(row.value) };
  }

  async updatePrivacySettings(input: PrivacySettingsInput, updatedById: string): Promise<PrivacySettings> {
    const value = JSON.stringify(input);

    await prisma.systemSetting.upsert({
      where: { key: SETTINGS_KEYS.PRIVACY },
      create: {
        key: SETTINGS_KEYS.PRIVACY,
        value,
        description: 'Employee data privacy and reporting rules',
        updatedById,
      },
      update: { value, updatedById },
    });

    return input;
  }

  /** Which settings keys have been explicitly overridden. */
  async overriddenKeys(): Promise<string[]> {
    const rows = await prisma.systemSetting.findMany({ select: { key: true } });
    return rows.map((row) => row.key);
  }

  /**
   * Aggregates across a set of employees, returning a suppressed flag instead of
   * a figure when the group is smaller than the configured privacy threshold.
   * A suppressed result must never be rendered as a number.
   */
  async aggregateRespectingPrivacy<T>(
    values: number[],
    threshold: number,
    compute: (values: number[]) => T,
  ): Promise<{ value: T | null; suppressed: boolean; sampleSize: number }> {
    if (values.length < threshold) {
      return { value: null, suppressed: true, sampleSize: values.length };
    }
    return { value: compute(values), suppressed: false, sampleSize: values.length };
  }
}

function parseJson<T>(raw: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    // A malformed row should degrade to defaults rather than break the request.
    return {} as T;
  }
}

export const settingsService = new SettingsService();
