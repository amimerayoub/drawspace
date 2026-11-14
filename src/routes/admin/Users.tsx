import { useEffect, useState } from 'react';
import { useToast } from '@/context/ToastContext';
import { backendAdminService } from '@/services/backendAdmin.service';
import type { User } from '@/types';
import { Avatar } from '@/components/Avatar';
import { Badge, Button, Field, Input, NativeSelect, Textarea, Modal } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable';
import { AdminPage, useAdmin } from './shared';

export default function UsersAdmin() {
  const { role } = useAdmin();
  const { toast } = useToast();
  const [users, setUsers] = useState<User[]>([]); const [total, setTotal] = useState(0);
  const [search, setSearch] = useState(''); const [status, setStatus] = useState('');
  const [selected, setSelected] = useState<User | null>(null); const [reason, setReason] = useState('');
  const [form, setForm] = useState({ username: '', bio: '', avatarId: '' }); const [loading, setLoading] = useState(false);
  const refresh = async () => { setLoading(true); try { const result = await backendAdminService.users({ search, status, limit: 100 }); setUsers(result.users); setTotal(result.total); } catch (error) { toast(error instanceof Error ? error.message : 'Could not load users.', 'error'); } finally { setLoading(false); } };
  useEffect(() => { const timer = setTimeout(() => { void refresh(); }, 250); return () => clearTimeout(timer); }, [search, status]);
  const act = async (fn: () => Promise<unknown>, success: string) => { try { await fn(); toast(success, 'success'); setSelected(null); setReason(''); await refresh(); } catch (error) { toast(error instanceof Error ? error.message : 'Action failed.', 'error'); } };
  const columns: Column<User>[] = [
    { key: 'user', header: 'User', render: (u) => <span className="admin-user-cell"><Avatar avatarId={u.avatarId} size={30} /><span><span className="admin-user-name">{u.username}</span><span className="faint admin-user-email">{u.email || 'guest'}</span></span></span>, sortValue: (u) => u.username },
    { key: 'role', header: 'Role', render: (u) => <Badge tone="accent">{u.role}</Badge>, sortValue: (u) => u.role },
    { key: 'status', header: 'Status', render: (u) => <Badge tone={u.status === 'active' ? 'neutral' : 'outline'}>{u.status}</Badge>, sortValue: (u) => u.status },
    { key: 'level', header: 'Level', align: 'end', render: (u) => <span className="mono">{u.level}</span>, sortValue: (u) => u.level },
    { key: 'xp', header: 'XP', align: 'end', render: (u) => <span className="mono">{u.xp.toLocaleString()}</span>, sortValue: (u) => u.xp },
    { key: 'matches', header: 'Matches', align: 'end', render: (u) => <span className="mono">{u.stats.matches}</span>, sortValue: (u) => u.stats.matches },
    { key: 'actions', header: 'Actions', align: 'end', render: (u) => <span className="admin-row-actions"><Button size="sm" variant="ghost" onClick={async () => { try { setSelected(await backendAdminService.user(u.id)); setForm({ username: u.username, bio: u.bio, avatarId: u.avatarId }); } catch (e) { toast(e instanceof Error ? e.message : 'Could not load user.', 'error'); } }}>Details</Button>{u.status === 'active' ? <Button size="sm" variant="ghost" onClick={() => { setSelected(u); setReason(''); }}>Suspend</Button> : <Button size="sm" variant="ghost" onClick={() => void act(() => backendAdminService.setUserStatus(u.id, 'active', 'Account reinstated by administrator.'), 'Account reactivated.')}>Unban</Button>}</span> },
  ];
  return <AdminPage title="User management" sub={`${total} accounts from Appwrite Users.`}><div className="panel" style={{ padding: 16 }}><div style={{ display: 'flex', gap: 12, marginBottom: 16 }}><Input aria-label="Search users" placeholder="Search name or email" value={search} onChange={(e) => setSearch(e.target.value)} /><NativeSelect aria-label="Filter status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="banned">Banned</option></NativeSelect></div>{loading ? <p>Loading accounts…</p> : <DataTable columns={columns} rows={users} rowKey={(u) => u.id} emptyTitle="No users match" />}</div>
    <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title={`${selected?.username ?? ''} account`} footer={<Button variant="ghost" onClick={() => setSelected(null)}>Close</Button>}>
      {selected && <><p>{selected.email || 'Guest account'} · {selected.status} · Level {selected.level} · {selected.xp} XP</p><p>Matches {selected.stats.matches} · Wins {selected.stats.wins} · Correct guesses {selected.stats.correctGuesses}</p><Field label="Username"><Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></Field><Field label="Bio"><Textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} rows={3} /></Field><Field label="Avatar ID"><Input value={form.avatarId} onChange={(e) => setForm({ ...form, avatarId: e.target.value })} /></Field><Button onClick={() => void act(() => backendAdminService.updateUser(selected.id, form), 'Profile updated.')}>Save profile</Button>{role === 'superadmin' && <><Field label="Role"><NativeSelect value={selected.role} onChange={(e) => setSelected({ ...selected, role: e.target.value as User['role'] })}><option value="player">player</option><option value="support">support</option><option value="moderator">moderator</option><option value="content_manager">content manager</option><option value="analyst">analyst</option><option value="admin">admin</option><option value="superadmin">superadmin</option></NativeSelect></Field><Button onClick={() => void act(() => backendAdminService.setUserRole(selected.id, selected.role, 'Role updated from user management.'), 'Role updated.')}>Save role</Button></>}{selected.status === 'active' && <><Field label="Reason for suspension"><Input value={reason} onChange={(e) => setReason(e.target.value)} minLength={3} /></Field><Button variant="danger" disabled={reason.trim().length < 3} onClick={() => void act(() => backendAdminService.setUserStatus(selected.id, 'suspended', reason), 'Account suspended.')}>Suspend account</Button></>}</>}
    </Modal></AdminPage>;
}
