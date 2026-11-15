import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, UserCog } from 'lucide-react';
import type { PermissionDef, PermissionMatrix, User } from '@/types';
import { useToast } from '@/context/ToastContext';
import { backendAdminService } from '@/services/backendAdmin.service';
import { Badge, Button, Field, Input, NativeSelect, Spinner } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable';
import { AdminPage, useAdmin } from './shared';

export default function Roles() {
  const { toast } = useToast();
  const { role: currentRole } = useAdmin();
  const canAssign = currentRole === 'superadmin';
  const [matrix, setMatrix] = useState<PermissionMatrix | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState('moderator');
  const [targetUser, setTargetUser] = useState('');
  const [targetRole, setTargetRole] = useState('moderator');
  const [reason, setReason] = useState('');
  const [assignError, setAssignError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [nextMatrix, nextUsers] = await Promise.all([
        backendAdminService.permissions(),
        backendAdminService.users({ limit: 100 }).catch(() => ({ users: [] as User[], total: 0 })),
      ]);
      setMatrix(nextMatrix); setUsers(nextUsers.users); setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Roles and permissions could not be loaded.');
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const selectedEntry = matrix?.roles.find((entry) => entry.role === selected) ?? matrix?.roles[0];
  const groups = useMemo(() => {
    if (!matrix || !selectedEntry) return [];
    const granted = new Set(selectedEntry.permissions);
    const byGroup = new Map<string, PermissionDef[]>();
    for (const permission of matrix.permissions) {
      if (!byGroup.has(permission.group)) byGroup.set(permission.group, []);
      byGroup.get(permission.group)!.push(permission);
    }
    return [...byGroup.entries()].map(([group, permissions]) => ({ group, permissions: permissions.map((permission) => ({ ...permission, on: granted.has(permission.id) })) }));
  }, [matrix, selectedEntry]);

  const staff = useMemo(() => users.filter((user) => matrix?.assignableRoles.includes(user.role)), [users, matrix]);

  const assign = async () => {
    if (!targetUser) { setAssignError('Select a user.'); return; }
    if (reason.trim().length < 3) { setAssignError('Give a reason of at least 3 characters.'); return; }
    setSaving(true); setAssignError('');
    try {
      const role = targetRole === 'none' ? null : targetRole;
      await backendAdminService.setUserRole(targetUser, role, reason.trim());
      toast(role ? 'Role assigned.' : 'Admin access revoked.', 'success');
      setTargetUser(''); setReason('');
      await load();
    } catch (e) {
      setAssignError(e instanceof Error ? e.message : 'The role could not be updated.');
    } finally {
      setSaving(false);
    }
  };

  const staffColumns: Column<User>[] = [
    { key: 'username', header: 'User', render: (user) => <span className="admin-user-name">{user.username}</span>, sortValue: (user) => user.username },
    { key: 'role', header: 'Role', render: (user) => <Badge tone="accent">{matrix?.roles.find((entry) => entry.role === user.role)?.label ?? user.role}</Badge>, sortValue: (user) => user.role },
    { key: 'status', header: 'Status', render: (user) => <Badge tone={user.status === 'active' ? 'neutral' : 'outline'}>{user.status}</Badge>, sortValue: (user) => user.status },
  ];

  return (
    <AdminPage title="Roles & permissions" sub="Server-defined permission matrix enforced by the API. Every role assignment is audited.">
      {error && <p role="alert" className="muted">{error}</p>}
      {!matrix && !error && <div className="page"><Spinner /></div>}

      {matrix && selectedEntry && (
        <>
          <div className="admin-roles-layout">
            <div className="panel admin-role-list">
              {matrix.roles.map((entry) => (
                <button key={entry.role} className={`admin-role-card ${selected === entry.role ? 'active' : ''}`} onClick={() => setSelected(entry.role)} aria-pressed={selected === entry.role}>
                  <span className="admin-role-name">{entry.label}</span>
                  <Badge tone="outline">{entry.permissions.length} permissions</Badge>
                </button>
              ))}
            </div>

            <div className="panel panel-pad">
              <div className="admin-panel-head">
                <h2 className="admin-panel-title">{selectedEntry.label}</h2>
                <Badge tone="accent">{selectedEntry.permissions.length} / {matrix.totalPermissions}</Badge>
              </div>
              <p className="faint admin-role-note">Defined in server code and enforced by the API. Changing the matrix requires a deploy.</p>
              {groups.map((group) => (
                <div key={group.group} className="admin-perm-group">
                  <p className="admin-perm-group-label">{group.group}</p>
                  {group.permissions.map((permission) => (
                    <div key={permission.id} className={`admin-perm-row ${permission.on ? 'on' : ''}`}>
                      <span className={`admin-perm-check ${permission.on ? 'on' : ''}`} aria-hidden>{permission.on && <Check size={12} />}</span>
                      <span className="admin-perm-label">{permission.label}</span>
                      <span className="faint mono admin-perm-id">{permission.id}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          <h2 className="admin-section-title">Role assignments</h2>
          {!canAssign && <p className="muted">Only super admins can assign or revoke roles. You can review the matrix above.</p>}
          {canAssign && (
            <div className="panel panel-pad">
              <div className="admin-grid-2">
                <Field label="User" htmlFor="role-user">
                  <NativeSelect id="role-user" value={targetUser} onChange={(e) => setTargetUser(e.target.value)}>
                    <option value="">Select a user…</option>
                    {users.map((user) => <option key={user.id} value={user.id}>{user.username} ({user.role})</option>)}
                  </NativeSelect>
                </Field>
                <Field label="New role" htmlFor="role-role">
                  <NativeSelect id="role-role" value={targetRole} onChange={(e) => setTargetRole(e.target.value)}>
                    {matrix.assignableRoles.map((role) => <option key={role} value={role}>{matrix.roles.find((entry) => entry.role === role)?.label ?? role}</option>)}
                    <option value="none">Revoke admin access</option>
                  </NativeSelect>
                </Field>
              </div>
              <Field label="Reason" htmlFor="role-reason" hint="Recorded in the audit log.">
                <Input id="role-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={255} placeholder="Why is this role changing?" />
              </Field>
              {assignError && <p role="alert" className="admin-form-error">{assignError}</p>}
              <div className="form-actions">
                <Button variant="primary" icon={<UserCog size={15} />} loading={saving} onClick={() => void assign()}>Apply role</Button>
              </div>
            </div>
          )}

          <div className="panel" style={{ marginTop: 16 }}>
            <DataTable columns={staffColumns} rows={staff} rowKey={(user) => user.id} pageSize={10} emptyTitle="No staff accounts yet" />
          </div>
        </>
      )}
    </AdminPage>
  );
}