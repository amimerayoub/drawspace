import type { ReactNode } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/services';

export const STAFF_ROLES = ['admin', 'superadmin', 'moderator', 'support'] as const;

export function useAdmin() {
  const { user } = useAuth();
  const role = user?.role ?? 'guest';
  const perms = db.rolePermissions[role] ?? [];
  return {
    name: user?.username ?? 'admin',
    role,
    isStaff: (STAFF_ROLES as readonly string[]).includes(role),
    can: (perm: string) => perms.includes(perm),
  };
}

export function AdminPage({ title, sub, actions, children }: { title: string; sub?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <h1 className="admin-title">{title}</h1>
          {sub && <p className="admin-sub">{sub}</p>}
        </div>
        {actions && <div className="admin-page-actions">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export function StatCard({ label, value, hint, icon }: { label: string; value: string | number; hint?: string; icon?: ReactNode }) {
  return (
    <div className="panel admin-stat">
      {icon && <span className="admin-stat-icon" aria-hidden>{icon}</span>}
      <span className="admin-stat-value mono">{value}</span>
      <span className="admin-stat-label">{label}</span>
      {hint && <span className="admin-stat-hint faint">{hint}</span>}
    </div>
  );
}

export function NoAccess() {
  return (
    <div className="admin-page">
      <div className="panel panel-pad admin-noaccess">
        <p className="admin-title">No access</p>
        <p className="muted">Your role does not include this section. Ask a super admin to update your permissions.</p>
      </div>
    </div>
  );
}

export function FieldRow({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="admin-field-row">
      <span className="admin-field-label">{label}</span>
      <div className="admin-field-control">
        {children}
        {hint && <span className="faint admin-field-hint">{hint}</span>}
      </div>
    </div>
  );
}
