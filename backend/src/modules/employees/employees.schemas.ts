import { z } from 'zod';
import { EMPLOYEE_STATUSES, EMPLOYMENT_TYPES, MANAGER_SCOPES } from '../../core/enums';

export const employeeIdParamSchema = z.object({ id: z.string().min(1) });

export const listEmployeesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(120).optional(),
  departmentId: z.string().min(1).optional(),
  status: z.enum(EMPLOYEE_STATUSES).optional(),
  employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
  includeSubordinates: z.coerce.boolean().default(false),
  sortBy: z.enum(['lastName', 'hireDate', 'createdAt']).default('lastName'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export const createEmployeeSchema = z.object({
  employeeNumber: z.string().trim().min(1).max(30),
  userId: z.string().min(1).nullable().optional(),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(255).transform((value) => value.toLowerCase()),
  jobTitle: z.string().trim().max(120).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  location: z.string().trim().max(120).nullable().optional(),
  timezone: z.string().trim().max(60).nullable().optional(),
  employmentType: z.enum(EMPLOYMENT_TYPES).default('FULL_TIME'),
  status: z.enum(EMPLOYEE_STATUSES).default('ACTIVE'),
  hireDate: z.coerce.date().nullable().optional(),
  departmentId: z.string().min(1).nullable().optional(),
  skills: z.string().trim().max(1000).nullable().optional(),
});

export const updateEmployeeSchema = createEmployeeSchema.partial().omit({ employeeNumber: true });

export const assignManagerSchema = z.object({
  managerUserId: z.string().min(1),
  employeeId: z.string().min(1).nullable().optional(),
  departmentId: z.string().min(1).nullable().optional(),
  scope: z.enum(MANAGER_SCOPES).default('DIRECT_REPORT'),
  isPrimary: z.boolean().default(true),
});

export const listManagersQuerySchema = z.object({
  departmentId: z.string().min(1).optional(),
  employeeId: z.string().min(1).optional(),
  includeEnded: z.coerce.boolean().default(false),
});

export type ListEmployeesQuery = z.infer<typeof listEmployeesQuerySchema>;
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
export type AssignManagerInput = z.infer<typeof assignManagerSchema>;
export type ListManagersQuery = z.infer<typeof listManagersQuerySchema>;
