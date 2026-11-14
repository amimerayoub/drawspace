import { useState } from 'react';
import { Check } from 'lucide-react';
import { useDb } from '@/hooks/useDb';
import { useToast } from '@/context/ToastContext';
import { adminService, db } from '@/services';
import { commit } from '@/services/db';
import { PERMISSIONS } from '@/data/mock';
import { Badge, Button } from '@/components/ui';
import { AdminPage, useAdmin } from './shared';
import { UnavailableFeature } from './UnavailableFeature';

const ROLE_LABELS: Record<string, string> = {
  superadmin: 'Super Admin', admin: 'Admin', moderator: 'Moderator', support: 'Support Agent',
};
const ROLE_DESC: Record<string, string> = {
  superadmin: 'Full access, including roles and system settings.',
  admin: 'Everything except role management.',
  moderator: 'Rooms, reports, and player suspensions.',
  support: 'Player lookup, messaging, and reports.',
};

export default function Roles() {
  return <UnavailableFeature title="Roles & permissions" explanation="The production table stores assigned admin roles but has no permission matrix or safe role-management workflow. Server authorization remains active; this editor is disabled." />;
  useDb();
  const { name } = useAdmin();
  const { toast } = useToast();
  const [role, setRole] = useState('moderator');

  const perms = db.rolePermissions[role] ?? [];
  const groups = Array.from(new Set(PERMISSIONS.map((p) => p.group)));

  const togglePerm = (id: string) => {
    const next = perms.includes(id) ? perms.filter((p) => p !== id) : [...perms, id];
    db.rolePermissions[role] = next;
    adminService.audit(name, 'role.permissions', ROLE_LABELS[role], perms.join(', '), next.join(', '));
    commit();
    toast('Permissions updated.', 'success');
  };

  return (
    <AdminPage title="Roles & permissions" sub="Configure what each staff role can access. Changes apply immediately in this demo.">
      <div className="admin-roles-layout">
        <div className="panel admin-role-list">
          {Object.keys(ROLE_LABELS).map((r) => (
            <button key={r} className={`admin-role-card ${role === r ? 'active' : ''}`} onClick={() => setRole(r)} aria-pressed={role === r}>
              <span className="admin-role-name">{ROLE_LABELS[r]}</span>
              <span className="muted admin-role-desc">{ROLE_DESC[r]}</span>
              <Badge tone="outline">{(db.rolePermissions[r] ?? []).length} permissions</Badge>
            </button>
          ))}
        </div>

        <div className="panel panel-pad">
          <div className="admin-panel-head">
            <h2 className="admin-panel-title">{ROLE_LABELS[role]}</h2>
            <Badge tone="accent">{perms.length} / {PERMISSIONS.length}</Badge>
          </div>
          {role === 'superadmin' && <p className="faint admin-role-note">Super Admin always has every permission.</p>}
          {groups.map((g) => (
            <div key={g} className="admin-perm-group">
              <p className="admin-perm-group-label">{g}</p>
              {PERMISSIONS.filter((p) => p.group === g).map((p) => {
                const on = perms.includes(p.id);
                const locked = role === 'superadmin';
                return (
                  <button
                    key={p.id}
                    className={`admin-perm-row ${on ? 'on' : ''}`}
                    onClick={() => !locked && togglePerm(p.id)}
                    disabled={locked}
                    aria-pressed={on}
                  >
                    <span className={`admin-perm-check ${on ? 'on' : ''}`} aria-hidden>{on && <Check size={12} />}</span>
                    <span className="admin-perm-label">{p.label}</span>
                    <span className="faint mono admin-perm-id">{p.id}</span>
                  </button>
                );
              })}
            </div>
          ))}
          <div className="form-actions">
            <Button variant="ghost" onClick={() => {
              db.rolePermissions[role] = role === 'admin'
                ? PERMISSIONS.filter((p) => p.id !== 'roles.manage').map((p) => p.id)
                : role === 'superadmin' ? PERMISSIONS.map((p) => p.id) : [];
              adminService.audit(name, 'role.reset', ROLE_LABELS[role], '', 'reset');
              commit();
              toast('Role reset.', 'success');
            }}>
              Reset role
            </Button>
          </div>
        </div>
      </div>
    </AdminPage>
  );
}
