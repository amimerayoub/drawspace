import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from '@/types';
import { authService } from '@/services';

export interface SessionUser {
  id: string;
  username: string;
  avatarId: string;
  role: User['role'];
  isGuest: boolean;
}

interface AuthCtx {
  user: SessionUser | null;
  ready: boolean;
  signIn: (identifier: string, password: string) => Promise<User>;
  signUp: (username: string, email: string, password: string) => Promise<User>;
  continueAsGuest: (username: string, avatarId: string) => Promise<SessionUser>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);
const LEGACY_SESSION_KEY = 'drawspace:session';
const toSession = (user: User): SessionUser => ({ id: user.id, username: user.username, avatarId: user.avatarId, role: user.role, isGuest: user.role === 'guest' });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    try { localStorage.removeItem(LEGACY_SESSION_KEY); } catch { /* private browsing */ }
    void authService.getCurrentSessionUser().then((session) => {
      if (active) { setUser(session ? toSession(session) : null); setReady(true); }
    }).catch(() => {
      if (active) { setUser(null); setReady(true); }
    });
    return () => { active = false; };
  }, []);

  const signIn = async (identifier: string, password: string) => {
    const full = await authService.signIn(identifier, password);
    setUser(toSession(full));
    return full;
  };

  const signUp = async (username: string, email: string, password: string) => {
    const full = await authService.signUp(username, email, password);
    setUser(toSession(full));
    return full;
  };

  const continueAsGuest = async (username: string, avatarId: string) => {
    const full = await authService.continueAsGuest(username, avatarId);
    const session = toSession(full);
    setUser(session);
    return session;
  };

  const signOut = async () => {
    await authService.signOut();
    setUser(null);
  };

  const refresh = async () => {
    const full = await authService.getCurrentSessionUser();
    setUser(full ? toSession(full) : null);
  };

  return <Ctx.Provider value={{ user, ready, signIn, signUp, continueAsGuest, signOut, refresh }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export function fullUser(id: string | undefined): User | undefined {
  if (!id) return undefined;
  return authService.localUser(id);
}
