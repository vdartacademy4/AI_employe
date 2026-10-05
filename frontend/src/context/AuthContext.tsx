import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authApi } from '@/lib/api';
import { setAuthFailureHandler, tokenStore } from '@/lib/api-client';
import type { AuthUser, Permission } from '@/types';

interface AuthState {
  user: AuthUser | null;
  permissions: Permission[];
  employeeId: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  can: (permission: Permission) => boolean;
  canAny: (...permissions: Permission[]) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();

  const clearSession = useCallback(() => {
    tokenStore.clear();
    setUser(null);
    setPermissions([]);
    setEmployeeId(null);
    // Cached domain data is scoped to the previous user; drop it on sign-out.
    queryClient.clear();
  }, [queryClient]);

  // A failed refresh inside the API client drops the session from anywhere.
  useEffect(() => {
    setAuthFailureHandler(clearSession);
    return () => setAuthFailureHandler(null);
  }, [clearSession]);

  // Restore the session on load: a stored access token is validated against
  // /auth/me before the app renders anything protected.
  useEffect(() => {
    let cancelled = false;

    async function restore() {
      if (!tokenStore.getAccess()) {
        setIsLoading(false);
        return;
      }
      try {
        const profile = await authApi.me();
        if (cancelled) return;
        setUser(profile.user);
        setPermissions(profile.permissions);
        setEmployeeId(profile.user.employeeId);
      } catch {
        if (!cancelled) clearSession();
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void restore();
    return () => {
      cancelled = true;
    };
  }, [clearSession]);

  const login = useCallback(async (email: string, password: string) => {
    const session = await authApi.login(email, password);
    tokenStore.set(session.accessToken, session.refreshToken);

    // The permission set is never cached client-side from the login response;
    // it is always read from the API so the UI cannot drift from the server.
    const profile = await authApi.me();
    setUser(profile.user);
    setPermissions(profile.permissions);
    setEmployeeId(profile.user.employeeId);
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = tokenStore.getRefresh();
    try {
      if (refreshToken) await authApi.logout(refreshToken);
    } catch {
      // A failed logout call must not trap the user in a signed-in UI.
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const refreshProfile = useCallback(async () => {
    const profile = await authApi.me();
    setUser(profile.user);
    setPermissions(profile.permissions);
    setEmployeeId(profile.user.employeeId);
  }, []);

  const can = useCallback(
    (permission: Permission) => permissions.includes(permission),
    [permissions],
  );
  const canAny = useCallback(
    (...required: Permission[]) => required.some((permission) => permissions.includes(permission)),
    [permissions],
  );

  const value = useMemo<AuthState>(
    () => ({
      user,
      permissions,
      employeeId,
      isLoading,
      isAuthenticated: Boolean(user),
      login,
      logout,
      refreshProfile,
      can,
      canAny,
    }),
    [user, permissions, employeeId, isLoading, login, logout, refreshProfile, can, canAny],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside an AuthProvider');
  }
  return context;
}
