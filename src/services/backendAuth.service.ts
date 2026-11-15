import { ID } from 'appwrite';
import type { User } from '@/types';
import { appwriteAccount } from '@/lib/appwrite';
import { apiGet, apiPost, apiPatch } from './apiClient';
import { backendProgressionService } from './backendProgression.service';

interface ProfileDto { userId: string; username: string; displayName: string; bio: string; avatarId: string; createdAt: string; }
interface StatsDto { totalGames: number; gamesWon: number; correctGuesses: number; totalPoints: number; }
interface AdminDto { role: 'superadmin' | 'admin' | 'moderator' | 'content_manager' | 'analyst'; }

// Appwrite rejects a new session while one is active (e.g. a lingering guest session), so clear it first.
async function clearActiveSession(): Promise<void> {
  await appwriteAccount.deleteSession('current').catch(() => undefined);
}

async function toUser(profile: ProfileDto, email?: string): Promise<User> {
  const [stats, progression, admin] = await Promise.all([
    apiGet<StatsDto>('/api/statistics/me'),
    backendProgressionService.getMine(),
    apiGet<AdminDto>('/api/admin/me').catch((error: unknown) => {
      if (error instanceof Error && 'status' in error && error.status === 403) return null;
      throw error;
    }),
  ]);
  const role: User['role'] = admin?.role === 'superadmin' ? 'superadmin'
    : admin?.role === 'admin' ? 'admin'
      : admin?.role === 'moderator' ? 'moderator'
        : admin?.role === 'content_manager' ? 'content_manager'
          : admin?.role === 'analyst' ? 'analyst'
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
  let account;
  try { account = await appwriteAccount.get(); } catch { return null; }
  const profile = await apiGet<ProfileDto>('/api/profiles/me');
  return toUser(profile, account.email || undefined);
}

export const backendAuthService = {
  async signIn(identifier: string, password: string): Promise<User> {
    const email = identifier.trim();
    if (!email.includes('@')) throw new Error('Sign in with the email address on your Appwrite account.');
    await clearActiveSession();
    await appwriteAccount.createEmailPasswordSession(email, password);
    const account = await appwriteAccount.get();
    return toUser(await apiGet<ProfileDto>('/api/profiles/me'), account.email);
  },

  async signUp(username: string, email: string, password: string): Promise<User> {
    const name = username.trim();
    const account = await appwriteAccount.create(ID.unique(), email.trim().toLowerCase(), password, name);
    await clearActiveSession();
    await appwriteAccount.createEmailPasswordSession(account.email, password);
    const profile = await apiGet<ProfileDto>('/api/profiles/me');
    return toUser(profile, account.email);
  },

  async continueAsGuest(username: string, avatarId: string): Promise<User> {
    await clearActiveSession();
    await appwriteAccount.createAnonymousSession();
    const profile = await apiPost<ProfileDto>('/api/guest/session', { username: username.trim(), avatarId });
    return toUser(profile);
  },

  async signOut(): Promise<void> {
    await appwriteAccount.deleteSession('current').catch(() => undefined);
  },

  getCurrentSessionUser: currentUser,

  async updateProfile(userId: string, patch: Partial<Pick<User, 'username' | 'bio' | 'avatarId'>>): Promise<ProfileDto> {
    const account = await appwriteAccount.get();
    if (account.$id !== userId) throw new Error('You can only edit your own profile.');
    return apiPatch<ProfileDto>('/api/profiles/me', patch);
  },

  async getAuthJWT(): Promise<string | null> {
    try { return (await appwriteAccount.createJWT()).jwt; }
    catch { return null; }
  },
};
