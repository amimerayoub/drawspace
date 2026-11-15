import type { AdminRole } from '../repositories/adminRoleRepository';

// Single source of truth for admin authorization. The matrix is code-defined (no
// database table) and enforced server-side by requirePermission; the admin UI reads
// it through GET /api/admin/permissions so the displayed matrix matches enforcement.
export const PERMISSIONS = [
  { id: 'users.view', label: 'View users', group: 'Users' },
  { id: 'roles.manage', label: 'Manage roles', group: 'Users' },
  { id: 'moderation.handle', label: 'Handle reports', group: 'Community' },
  { id: 'crm.send', label: 'Send messages', group: 'Community' },
  { id: 'rooms.view', label: 'View rooms', group: 'Game' },
  { id: 'words.manage', label: 'Manage word bank', group: 'Game' },
  { id: 'config.game', label: 'Game configuration', group: 'Game' },
  { id: 'config.xp', label: 'XP configuration', group: 'Game' },
  { id: 'rewards.manage', label: 'Titles and achievements', group: 'Rewards' },
  { id: 'challenges.manage', label: 'Manage challenges', group: 'Rewards' },
  { id: 'content.blog', label: 'Manage blog', group: 'Content' },
  { id: 'content.seo', label: 'Manage SEO', group: 'Content' },
  { id: 'content.ads', label: 'Manage ads', group: 'Content' },
  { id: 'content.media', label: 'Manage media', group: 'Content' },
  { id: 'analytics.view', label: 'View analytics', group: 'Operations' },
  { id: 'matches.inspect', label: 'Inspect matches', group: 'Operations' },
  { id: 'audit.view', label: 'View audit logs', group: 'Operations' },
  { id: 'settings.manage', label: 'System settings', group: 'Operations' },
] as const;

export type Permission = (typeof PERMISSIONS)[number]['id'];
export const ALL_PERMISSIONS: Permission[] = PERMISSIONS.map((permission) => permission.id);

export const ROLE_PERMISSIONS: Record<AdminRole, readonly string[]> = {
  superadmin: ['*'],
  admin: ['*'],
  moderator: ['users.view', 'moderation.handle', 'rooms.view', 'audit.view'],
  content_manager: ['words.manage', 'content.blog', 'content.ads', 'content.media'],
  analyst: ['analytics.view', 'audit.view'],
  support: ['analytics.view', 'audit.view'],
};

export const ROLE_LABELS: Record<AdminRole, string> = {
  superadmin: 'Super Admin',
  admin: 'Admin',
  moderator: 'Moderator',
  content_manager: 'Content Manager',
  analyst: 'Analyst',
  support: 'Support Agent',
};

export const ASSIGNABLE_ROLES: AdminRole[] = ['superadmin', 'admin', 'moderator', 'content_manager', 'analyst', 'support'];

export function permissionsForRole(role: AdminRole): Permission[] {
  const granted = ROLE_PERMISSIONS[role] ?? [];
  if (granted.includes('*')) return [...ALL_PERMISSIONS];
  return ALL_PERMISSIONS.filter((permission) => granted.includes(permission));
}

export function hasPermission(role: AdminRole, permission: Permission): boolean {
  const granted = ROLE_PERMISSIONS[role] ?? [];
  return granted.includes('*') || granted.includes(permission);
}

export function hasAnyPermission(role: AdminRole, permissions: Permission[]): boolean {
  return permissions.some((permission) => hasPermission(role, permission));
}