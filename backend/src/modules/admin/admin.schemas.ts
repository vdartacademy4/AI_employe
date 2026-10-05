import { z } from 'zod';

export const maintenanceSchema = z.object({
  purgeExpiredTokens: z.boolean().default(true),
});

export const maintenanceQuerySchema = z.object({
  verbose: z.coerce.boolean().default(false),
});

export type MaintenanceInput = z.infer<typeof maintenanceSchema>;
