import { config } from '../../config/env';
import {
  ConflictError,
  ForbiddenError,
  InvalidCredentialsError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../../core/errors';
import { prisma } from '../../core/prisma';
import type { AuthenticatedUser } from '../../types/express';
import { assertPasswordStrength, hashPassword, verifyPassword } from './auth.password';
import {
  revokeAllForUser,
  revokeRefreshToken,
  rotateRefreshToken,
  toAuthenticatedUser,
  issueRefreshToken,
  type IssuedRefreshToken,
} from './auth.refresh-tokens';
import { signAccessToken } from './auth.tokens';
import { permissionsForRole } from './permissions';
import type {
  AdminCreateUserInput,
  AdminUpdateUserInput,
  ChangePasswordInput,
  ListUsersQuery,
  LoginInput,
  RegisterInput,
  UpdateProfileInput,
} from './auth.schemas';

export interface AuthResult {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    status: string;
    avatarUrl: string | null;
    employeeId: string | null;
  };
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

interface RequestContext {
  userAgent?: string;
  ipAddress?: string;
}

export class AuthService {
  /**
   * Credentials login. Public registration always produces an EMPLOYEE;
   * elevated roles are only assignable by an admin.
   */
  async login(input: LoginInput, context: RequestContext = {}): Promise<AuthResult> {
    const user = await prisma.user.findUnique({
      where: { email: input.email },
      include: { employee: { select: { id: true } } },
    });

    // Compare regardless of user existence to keep the response time uniform
    // and avoid disclosing which emails are registered.
    const passwordHash = user?.passwordHash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
    const passwordMatches = await verifyPassword(input.password, passwordHash);

    if (!user || !passwordMatches) {
      throw new InvalidCredentialsError();
    }
    if (!user.isActive || user.status !== 'ACTIVE') {
      throw new ForbiddenError('This account is not active');
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const principal = toAuthenticatedUser(user);
    const { token: refreshToken } = await this.issueSession(principal, context);

    return {
      user: this.toPublicUser(user),
      accessToken: signAccessToken(principal),
      refreshToken,
      expiresIn: this.accessTokenTtl(),
    };
  }

  /** Self-service registration. Always creates the lowest-privilege role. */
  async register(input: RegisterInput, context: RequestContext = {}): Promise<AuthResult> {
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw new ConflictError('An account with this email already exists');
    }

    const user = await prisma.user.create({
      data: {
        email: input.email,
        passwordHash: await hashPassword(input.password),
        firstName: input.firstName,
        lastName: input.lastName,
        role: 'EMPLOYEE',
        status: 'ACTIVE',
      },
    });

    const principal = toAuthenticatedUser(user);
    const { token: refreshToken } = await this.issueSession(principal, context);

    return {
      user: this.toPublicUser(user),
      accessToken: signAccessToken(principal),
      refreshToken,
      expiresIn: this.accessTokenTtl(),
    };
  }

  async refresh(refreshToken: string, context: RequestContext = {}): Promise<AuthResult> {
    const { userId, refreshToken: rotated } = await rotateRefreshToken(refreshToken, context);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { employee: { select: { id: true } } },
    });

    if (!user) {
      throw new UnauthorizedError('Account no longer exists');
    }
    if (!user.isActive || user.status !== 'ACTIVE') {
      await revokeAllForUser(user.id);
      throw new ForbiddenError('This account is not active');
    }

    const principal = toAuthenticatedUser(user);

    return {
      user: this.toPublicUser(user),
      accessToken: signAccessToken(principal),
      refreshToken: rotated.token,
      expiresIn: this.accessTokenTtl(),
    };
  }

  async logout(refreshToken: string): Promise<void> {
    await revokeRefreshToken(refreshToken);
  }

  async logoutAll(userId: string): Promise<void> {
    await revokeAllForUser(userId);
  }

  /** Resolves the caller's full profile plus the permission matrix for their role. */
  async me(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { employee: { select: { id: true, jobTitle: true, departmentId: true } } },
    });

    if (!user) throw new NotFoundError('User');
    if (!user.isActive) throw new ForbiddenError('This account is not active');

    return {
      user: this.toPublicUser(user),
      permissions: permissionsForRole(user.role),
      employee: user.employee,
    };
  }

  async updateProfile(userId: string, input: UpdateProfileInput) {
    const user = await prisma.user.update({
      where: { id: userId },
      data: input,
      include: { employee: { select: { id: true } } },
    });
    return this.toPublicUser(user);
  }

  async changePassword(userId: string, input: ChangePasswordInput): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User');

    if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
      throw new ValidationError('Current password is incorrect');
    }

    const problems = assertPasswordStrength(input.newPassword);
    if (problems.length > 0) {
      throw new ValidationError('New password does not meet the policy', problems);
    }

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(input.newPassword) },
    });

    // Changing a password invalidates every other session.
    await revokeAllForUser(userId);
  }

  // -------------------------------------------------------------------------
  // Administration
  // -------------------------------------------------------------------------

  async listUsers(query: ListUsersQuery) {
    const where = {
      ...(query.role ? { role: query.role } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { email: { contains: query.search } },
              { firstName: { contains: query.search } },
              { lastName: { contains: query.search } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          status: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
        },
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.user.count({ where }),
    ]);

    return {
      items,
      meta: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) },
    };
  }

  async createUser(input: AdminCreateUserInput) {
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new ConflictError('An account with this email already exists');

    const problems = assertPasswordStrength(input.password);
    if (problems.length > 0) {
      throw new ValidationError('Password does not meet the policy', problems);
    }

    const user = await prisma.user.create({
      data: {
        email: input.email,
        passwordHash: await hashPassword(input.password),
        firstName: input.firstName,
        lastName: input.lastName,
        role: input.role,
        status: input.status,
      },
    });

    return this.toPublicUser(user);
  }

  async updateUser(userId: string, input: AdminUpdateUserInput, actingUserId: string) {
    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) throw new NotFoundError('User');

    // Guard against an admin locking themselves out of the platform.
    if (actingUserId === userId && (input.role !== undefined || input.isActive === false)) {
      throw new ValidationError('You cannot change your own role or deactivate your own account');
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: input,
      include: { employee: { select: { id: true } } },
    });

    // A role change must not leave a stale elevated session behind.
    if (input.role !== undefined || input.isActive === false) {
      await revokeAllForUser(userId);
    }

    return this.toPublicUser(user);
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async issueSession(
    principal: AuthenticatedUser,
    context: RequestContext,
  ): Promise<IssuedRefreshToken> {
    return issueRefreshToken(principal.id, context);
  }

  private accessTokenTtl(): string {
    return config.jwt.accessTtl;
  }

  private toPublicUser(user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    status: string;
    avatarUrl: string | null;
    employee?: { id: string } | null;
  }) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      status: user.status,
      avatarUrl: user.avatarUrl,
      employeeId: user.employee?.id ?? null,
    };
  }
}

export const authService = new AuthService();
