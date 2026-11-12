import { useState } from 'react';
import { Ban, PauseCircle, Pencil, PlayCircle, Trash2 } from 'lucide-react';
import type { Role, User } from '@/types';
import { useDb } from '@/hooks/useDb';
import { useToast } from '@/context/ToastContext';
import { adminService } from '@/services';
import { Avatar } from '@/components/Avatar';
import { Badge, Button, ConfirmDialog, Field, Input, Modal, NativeSelect, Textarea } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable';
import { AdminPage, useAdmin } from './shared';

const ROLES: Role[] = ['player', 'support', 'moderator', 'admin', 'superadmin'];

export default function UsersAdmin() {
  const db = useDb();
  const { name, can } = useAdmin();
  const { toast } = useToast();
  const [editing, setEditing] = useState<User | null>(null);
  const [viewing, setViewing] = useState<User | null>(null);
  const [deleting, setDeleting] = useState<User | null>(null);
  const [form, setForm] = useState({ username: '', bio: '', role: 'player' as Role });

  const openEdit = (u: User) => {
    setForm({ username: u.username, bio: u.bio, role: u.role });
    setEditing(u);
  };

  const save = () => {
    if (!editing) return;
    if (form.username.trim().length < 3) { toast('Username needs at least 3 characters.', 'error'); return; }
    adminService.saveUser({ ...editing, username: form.username.trim(), bio: form.bio, role: form.role }, name);
    toast('User updated.', 'success');
    setEditing(null);
  };

  const setStatus = (u: User, status: User['status']) => {
    adminService.setUserStatus(u.id, status, name);
    toast(`${u.username} is now ${status}.`, 'success');
  };

  const columns: Column<User>[] = [
    {
      key: 'user', header: 'User', width: '26%',
      render: (u) => (
        <span className="admin-user-cell">
          <Avatar avatarId={u.avatarId} size={30} />
          <span>
            <span className="admin-user-name">{u.username}</span>
            <span className="faint admin-user-email">{u.email ?? 'guest'}</span>
          </span>
        </span>
      ),
      sortValue: (u) => u.username,
    },
    { key: 'role', header: 'Role', render: (u) => <Badge tone={u.role === 'player' || u.role === 'guest' ? 'neutral' : 'accent'}>{u.role}</Badge>, sortValue: (u) => u.role },
    { key: 'status', header: 'Status', render: (u) => <Badge tone={u.status === 'active' ? 'neutral' : 'outline'}>{u.status}</Badge>, sortValue: (u) => u.status },
    { key: 'level', header: 'Level', align: 'end', render: (u) => <span className="mono">{u.level}</span>, sortValue: (u) => u.level },
    { key: 'xp', header: 'XP', align: 'end', render: (u) => <span className="mono">{u.xp.toLocaleString()}</span>, sortValue: (u) => u.xp },
    { key: 'matches', header: 'Matches', align: 'end', render: (u) => <span className="mono">{u.stats.matches}</span>, sortValue: (u) => u.stats.matches },
    {
      key: 'actions', header: '', align: 'end', width: '190px',
      render: (u) => (
        <span className="admin-row-actions">
          <Button size="sm" variant="ghost" onClick={() => setViewing(u)}>Stats</Button>
          {can('users.edit') && <Button size="sm" variant="ghost" icon={<Pencil size={13} />} onClick={() => openEdit(u)} aria-label={`Edit ${u.username}`} />}
          {can('users.suspend') && u.status === 'active' && (
            <Button size="sm" variant="ghost" icon={<PauseCircle size={14} />} onClick={() => setStatus(u, 'suspended')} aria-label={`Suspend ${u.username}`} />
          )}
          {can('users.suspend') && u.status === 'suspended' && (
            <Button size="sm" variant="ghost" icon={<PlayCircle size={14} />} onClick={() => setStatus(u, 'active')} aria-label={`Activate ${u.username}`} />
          )}
          {can('users.suspend') && u.status !== 'banned' && (
            <Button size="sm" variant="ghost" icon={<Ban size={14} />} onClick={() => setStatus(u, 'banned')} aria-label={`Ban ${u.username}`} />
          )}
          {can('users.edit') && (
            <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => setDeleting(u)} aria-label={`Delete ${u.username}`} />
          )}
        </span>
      ),
    },
  ];

  return (
    <AdminPage title="User management" sub={`${db.users.length} accounts, guests included.`}>
      <div className="panel">
        <DataTable
          columns={columns}
          rows={db.users}
          rowKey={(u) => u.id}
          searchable
          searchPlaceholder="Search username or email"
          searchLabel="Search users"
          searchValue={(u) => `${u.username} ${u.email ?? ''} ${u.role} ${u.status}`}
          emptyTitle="No users match"
        />
      </div>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={`Edit ${editing?.username ?? ''}`}
        footer={<>
          <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
          <Button variant="primary" onClick={save}>Save</Button>
        </>}>
        <Field label="Username" htmlFor="u-name">
          <Input id="u-name" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} maxLength={20} />
        </Field>
        <Field label="Role" htmlFor="u-role" hint="Role changes apply the matching permission set.">
          <NativeSelect id="u-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Bio" htmlFor="u-bio">
          <Textarea id="u-bio" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} rows={3} />
        </Field>
      </Modal>

      <Modal open={Boolean(viewing)} onClose={() => setViewing(null)} title={`${viewing?.username ?? ''} statistics`}>
        {viewing && (
          <div className="admin-stat-grid admin-stat-grid-3">
            {[
              ['Matches', viewing.stats.matches], ['Wins', viewing.stats.wins],
              ['Correct guesses', viewing.stats.correctGuesses], ['Words drawn', viewing.stats.wordsDrawn],
              ['Total score', viewing.stats.totalScore], ['Best score', viewing.stats.bestScore],
            ].map(([label, value]) => (
              <div key={label} className="panel admin-stat">
                <span className="admin-stat-value mono">{Number(value).toLocaleString()}</span>
                <span className="admin-stat-label">{label}</span>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)} onClose={() => setDeleting(null)}
        onConfirm={() => { if (deleting) { adminService.removeUser(deleting.id, name); toast('User deleted.', 'success'); } }}
        title="Delete user" body={`Delete ${deleting?.username}? This removes the account and its stats from the demo data.`}
        confirmLabel="Delete"
      />
    </AdminPage>
  );
}
