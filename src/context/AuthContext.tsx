import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from '@/types';
import { authService, db } from '@/services';
import { commit } from '@/services/db';

export interface SessionUser {
  id: string;
  username: string;
  avatarId: string;
  role: User['role'];
  isGuest: boolean;
}

interface AuthCtx {
  user: SessionUser | null;
  signIn: (identifier: string, password: string) => Promise<User>;
  signUp: (username: string, email: string, password: string) => Promise<User>;
  continueAsGuest: (username: string, avatarId: string) => SessionUser;
  signOut: () => void;
  refresh: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);
const KEY = 'drawspace:session';

function toSession(u: User, isGuest: boolean): SessionUser {
  return { id: u.id, username: u.username, avatarId: u.avatarId, role: u.role, isGuest };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(() => {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as SessionUser) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    try {
      if (user) localStorage.setItem(KEY, JSON.stringify(user));
      else localStorage.removeItem(KEY);
    } catch {
      /* private mode */
    }
  }, [user]);

  const persist = (u: User, isGuest: boolean) => {
    const session = toSession(u, isGuest);
    setUser(session);
    return session;
  };

  const signIn = async (identifier: string, password: string) => {
    const u = await authService.signIn(identifier, password);
    persist(u, false);
    return u;
  };

  const signUp = async (username: string, email: string, password: string) => {
    const u = await authService.signUp(username, email, password);
    persist(u, false);
    return u;
  };

  const continueAsGuest = (username: string, avatarId: string) => {
    let guest = db.users.find((u) => u.id === 'u-guest-local' && u.username === username);
    if (!guest) {
      guest = {
        id: 'u-guest-local', username, email: undefined, avatarId, bio: '', role: 'guest', status: 'active',
        level: 1, xp: 0, titleId: null, createdAt: new Date().toISOString(), lastSeenAt: new Date().toISOString(),
        stats: { matches: 0, wins: 0, correctGuesses: 0, wordsDrawn: 0, totalScore: 0, bestScore: 0 },
        locale: 'en-US',
      };
      db.users.push(guest);
    } else {
      guest.avatarId = avatarId;
    }
    commit();
    return persist(guest, true);
  };

  const signOut = () => setUser(null);

  const refresh = () => {
    if (!user) return;
    const full = db.users.find((u) => u.id === user.id);
    if (full) setUser(toSession(full, user.isGuest));
  };

  return <Ctx.Provider value={{ user, signIn, signUp, continueAsGuest, signOut, refresh }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export function fullUser(id: string | undefined): User | undefined {
  return db.users.find((u) => u.id === id);
}