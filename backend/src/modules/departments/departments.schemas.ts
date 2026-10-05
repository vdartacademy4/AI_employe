import { z } from 'zod';

export const departmentIdParamSchema = z.object({ id: z.string().min(1) });

export const createDepartmentSchema = z.object({
  name: z.string().trim().min(1).max(120),
  code: z
    .string()
    .trim()
    .min(2)
    .max(20)
    .regex(/^[A-Za-z0-9_-]+$/, 'Code may only contain letters, numbers, hyphens and underscores')
    .transform((value) => value.toUpperCase()),
  description: z.string().trim().max(500).nullable().optional(),
  parentId: z.string().min(1).nullable().optional(),
  headId: z.string().min(1).nullable().optional(),
});

export const updateDepartmentSchema = createDepartmentSchema.partial();

export const listDepartmentsQuerySchema = z.object({
  includeInactive: z.coerce.boolean().default(false),
  parentId: z.string().min(1).optional(),
  search: z.string().trim().max(120).optional(),
});

export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;
export type ListDepartmentsQuery = z.infer<typeof listDepartmentsQuerySchema>;
