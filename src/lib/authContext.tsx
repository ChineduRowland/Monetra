import React, { createContext, useCallback, useContext, useState } from 'react';
import { apiRequest, type RuntimeConfig } from './api.ts';
import type { Profile, Workspace } from '../shared/types.ts';

export interface MonetraAuthContextValue {
  config: RuntimeConfig;
  profile: Profile | null;
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  loading: boolean;
  authMode: 'clerk' | 'preview';
  setActiveWorkspaceId: (id: string) => void;
  refreshMe: (overrideToken?: string | null) => Promise<{ profile: Profile; workspaces: Workspace[] } | null>;
  getAuthToken: () => Promise<string | null>;
  signInPreview: (email: string, password: string) => Promise<void>;
  registerPreview: (email: string, password: string, displayName: string) => Promise<void>;
  signInDemo: () => Promise<void>;
  signOut: () => Promise<void>;
  setProfileAndWorkspaces: (profile: Profile, workspaces: Workspace[]) => void;
}

const AuthContext = createContext<MonetraAuthContextValue | null>(null);

export function PreviewAuthProvider({
  config,
  children,
}: {
  config: RuntimeConfig;
  children: React.ReactNode;
}) {
  // Token kept strictly in React memory per security guidelines (never localStorage)
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const getAuthToken = useCallback(async () => token, [token]);

  const setProfileAndWorkspaces = useCallback((nextProfile: Profile, nextWorkspaces: Workspace[]) => {
    setProfile(nextProfile);
    setWorkspaces(nextWorkspaces);
    setActiveWorkspaceId((prev) =>
      prev && nextWorkspaces.some((w) => w.id === prev) ? prev : (nextWorkspaces[0]?.id ?? null)
    );
  }, []);

  const refreshMe = useCallback(
    async (overrideToken?: string | null) => {
      const effectiveToken = overrideToken ?? token;
      if (!effectiveToken) return null;
      setLoading(true);
      try {
        const res = await apiRequest<{ profile: Profile; workspaces: Workspace[] }>('/api/me', {
          token: effectiveToken,
        });
        setProfileAndWorkspaces(res.profile, res.workspaces);
        return res;
      } finally {
        setLoading(false);
      }
    },
    [setProfileAndWorkspaces, token]
  );

  const signInPreview = useCallback(
    async (email: string, password: string) => {
      setLoading(true);
      try {
        const res = await apiRequest<{ profile: Profile; token: string }>('/api/auth/login', {
          method: 'POST',
          body: { email, password },
        });
        setToken(res.token);
        await refreshMe(res.token);
      } finally {
        setLoading(false);
      }
    },
    [refreshMe]
  );

  const registerPreview = useCallback(
    async (email: string, password: string, displayName: string) => {
      setLoading(true);
      try {
        const res = await apiRequest<{ profile: Profile; token: string }>('/api/auth/register', {
          method: 'POST',
          body: { email, password, display_name: displayName },
        });
        setToken(res.token);
        setProfileAndWorkspaces(res.profile, []);
      } finally {
        setLoading(false);
      }
    },
    [setProfileAndWorkspaces]
  );

  const signInDemo = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ profile: Profile; token: string }>('/api/auth/demo', {
        method: 'POST',
      });
      setToken(res.token);
      await refreshMe(res.token);
    } finally {
      setLoading(false);
    }
  }, [refreshMe]);

  const signOut = useCallback(async () => {
    setToken(null);
    setProfile(null);
    setWorkspaces([]);
    setActiveWorkspaceId(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        config,
        profile,
        workspaces,
        activeWorkspaceId,
        loading,
        authMode: 'preview',
        setActiveWorkspaceId,
        refreshMe,
        getAuthToken,
        signInPreview,
        registerPreview,
        signInDemo,
        signOut,
        setProfileAndWorkspaces,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function ClerkBridgeContextProvider({
  value,
  children,
}: {
  value: MonetraAuthContextValue;
  children: React.ReactNode;
}) {
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useMonetraAuth(): MonetraAuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useMonetraAuth must be used inside AuthProvider');
  return ctx;
}
