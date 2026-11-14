import type { AppwriteDatabase } from '../database/appwrite';
import type { AuthenticatedIdentity } from '../types/identity';

export type JwtVerifier = (jwt: string) => Promise<AuthenticatedIdentity>;

export function createJwtVerifier(database: AppwriteDatabase): JwtVerifier {
  return async (jwt) => {
    const account = await database.accountForJwt(jwt).get();
    return {
      userId: account.$id,
      name: account.name || 'Player',
      email: account.email || null,
      emailVerified: Boolean(account.emailVerification),
      isGuest: !account.email,
    };
  };
}
