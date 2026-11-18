import { ID } from 'appwrite';
import type { User } from '@/types';
import { appwriteAccount } from '@/lib/appwrite';
import { getJwt, invalidateJwt } from '@/lib/jwtCache';
import { apiGet, apiPost, apiPatch } from './apiClient';
import type { ProgressionSnapshot } from './backendProgression.service';

interface ProfileDto { userId: string; username: string; displayName: string; bio: string; avatarId: string; createdAt: string; adminRole?: string | null; }
interface StatsDto { totalGames: number; gamesWon: number; correctGuesses: number; totalPoints: number; }
interface BootstrapDto { profile: ProfileDto; statistics: StatsDto; progression: ProgressionSnapshot; }

// Appwrite rejects a new session while one is active (e.g. a lingering guest session), so clear it first.
async function clearActiveSession(): Promise<void> {
  invalidateJwt();
  sessionAccount = null;
  await appwriteAccount.deleteSession('current').catch(() => undefined);
}

// account.get runs once per app start / sign-in; later refreshes reuse it until sign-out.
let sessionAccount: { id: string; email: string | null } | null = null;

// One bootstrap call replaces the old profiles/me + statistics/me + progression/me trio.
const fetchBootstrap = () => apiGet<BootstrapDto>('/api/me/bootstrap');

function toUser({ profile, statistics: stats, progression }: BootstrapDto, email?: string): User {
  const role: User['role'] = profile.adminRole === 'superadmin' ? 'superadmin'
    : profile.adminRole === 'admin' ? 'admin'
      : profile.adminRole === 'moderator' ? 'moderator'
        : profile.adminRole === 'content_manager' ? 'content_manager'
          : profile.adminRole === 'analyst' ? 'analyst'
        : email ? 'player' : 'guest';
  return {
    id: profile.userId,
    username: profile.username || profile.displayName || 'Player',
    email,
    avatarId: profile.avatarId || 'av-01',
    bio: profile.bio || '',
    role,
    status: 'active',
    level: progression.progression.level,
    xp: progression.progression.totalXP,
    titleId: progression.progression.equippedTitleId,
    createdAt: profile.createdAt,
    lastSeenAt: new Date().toISOString(),
    stats: { matches: stats.totalGames, wins: stats.gamesWon, correctGuesses: stats.correctGuesses, wordsDrawn: 0, totalScore: stats.totalPoints, bestScore: 0 },
    locale: 'en-US',
  };
}

async function currentUser(): Promise<User | null> {
  if (!sessionAccount) {
    try {
      const account = await appwriteAccount.get();
      sessionAccount = { id: account.$id, email: account.email || null };
    } catch { return null; }
  }
  return toUser(await fetchBootstrap(), sessionAccount.email || undefined);
}

export const backendAuthService = {
  async signIn(identifier: string, password: string): Promise<User> {
    const email = identifier.trim();
    if (!email.includes('@')) throw new Error('Sign in with the email address on your Appwrite account.');
    await clearActiveSession();
    await appwriteAccount.createEmailPasswordSession(email, password);
    const account = await appwriteAccount.get();
    sessionAccount = { id: account.$id, email: account.email || null };
    return toUser(await fetchBootstrap(), account.email);
  },

  async signUp(username: string, email: string, password: string): Promise<User> {
    const name = username.trim();
    if (name.length < 3 || name.length > 20) throw new Error('Username must be 3 to 20 characters.');
    const account = await appwriteAccount.create(ID.unique(), email.trim().toLowerCase(), password, name);
    await clearActiveSession();
    await appwriteAccount.createEmailPasswordSession(account.email, password);
    sessionAccount = { id: account.$id, email: account.email || null };
    return toUser(await fetchBootstrap(), account.email);
  },

  async continueAsGuest(username: string, avatarId: string): Promise<User> {
    const name = username.trim();
    if (name.length < 3 || name.length > 20) throw new Error('Username must be 3 to 20 characters.');
    await clearActiveSession();
    await appwriteAccount.createAnonymousSession();
    await apiPost<ProfileDto>('/api/guest/session', { username: name, avatarId });
    const bootstrap = await fetchBootstrap();
    sessionAccount = { id: bootstrap.profile.userId, email: null };
    return toUser(bootstrap);
  },

  async signOut(): Promise<void> {
    invalidateJwt();
    sessionAccount = null;
    await appwriteAccount.deleteSession('current').catch(() => undefined);
  },

  getCurrentSessionUser: currentUser,

  async updateProfile(userId: string, patch: Partial<Pick<User, 'username' | 'bio' | 'avatarId'>>): Promise<ProfileDto> {
    // /api/profiles/me is identity-scoped server-side; the cached account replaces the old account.get probe.
    if (sessionAccount && sessionAccount.id !== userId) throw new Error('You can only edit your own profile.');
    return apiPatch<ProfileDto>('/api/profiles/me', patch);
  },

  async getAuthJWT(): Promise<string | null> {
    return getJwt();
  },
};