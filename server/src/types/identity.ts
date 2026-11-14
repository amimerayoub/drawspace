export interface AuthenticatedIdentity {
  userId: string;
  name: string;
  email: string | null;
  emailVerified: boolean;
  isGuest: boolean;
}

export interface PublicPlayer {
  userId: string;
  username: string;
  avatarId: string;
  score: number;
  ready: boolean;
  connected: boolean;
  host: boolean;
  hasGuessed?: boolean;
}
