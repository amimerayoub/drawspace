import { useState } from 'react';
import { Lock, Pencil, XCircle } from 'lucide-react';
import type { Room } from '@/types';
import { useDb } from '@/hooks/useDb';
import { useToast } from '@/context/ToastContext';
import { roomService } from '@/services';
import { Badge, Button, ConfirmDialog, Field, Input, Modal, NativeSelect } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable';
import { AdminPage, useAdmin } from './shared';
import { UnavailableFeature } from './UnavailableFeature';

export default function Rooms() {
  return <UnavailableFeature title="Room management" explanation="Rooms currently exist only in process memory and are not exposed through an admin API. Demo room controls are disabled." />;
  const db = useDb();
  const { name, can } = useAdmin();
  const { toast } = useToast();
  const [closing, setClosing] = useState<Room | null>(null);
  const [editing, setEditing] = useState<Room | null>(null);
  const [form, setForm] = useState({ name: '', visibility: 'public' as Room['visibility'] });

  const columns: Column<Room>[] = [
    { key: 'code', header: 'Code', render: (r) => <span className="mono admin-room-code">{r.code}</span>, sortValue: (r) => r.code },
    {
      key: 'name', header: 'Room', width: '24%',
      render: (r) => (
        <span className="admin-user-name">
          {r.name} {r.hasPassword && <Lock size={12} className="faint" aria-label="password protected" />}
        </span>
      ),
      sortValue: (r) => r.name,
    },
    { key: 'host', header: 'Host', render: (r) => db.users.find((u) => u.id === r.hostId)?.username ?? r.hostId },
    { key: 'players', header: 'Players', align: 'end', render: (r) => <span className="mono">{r.players.length}/{r.settings.maxPlayers}</span>, sortValue: (r) => r.players.length },
    { key: 'settings', header: 'Settings', render: (r) => <span className="faint mono">{r.settings.rounds}r · {r.settings.roundSeconds}s · {r.settings.difficulty}</span> },
    { key: 'status', header: 'Status', render: (r) => <Badge tone={r.status === 'playing' ? 'accent' : 'neutral'}>{r.status}</Badge>, sortValue: (r) => r.status },
    {
      key: 'actions', header: '', align: 'end', width: '150px',
      render: (r) => (
        <span className="admin-row-actions">
          <Button size="sm" variant="ghost" icon={<Pencil size={13} />} onClick={() => { setForm({ name: r.name, visibility: r.visibility }); setEditing(r); }} aria-label={`Edit ${r.name}`} />
          {can('rooms.close') && (
            <Button size="sm" variant="ghost" icon={<XCircle size={14} />} onClick={() => setClosing(r)} aria-label={`Close ${r.name}`} />
          )}
        </span>
      ),
    },
  ];

  return (
    <AdminPage title="Room management" sub="Live and waiting rooms across the platform.">
      <div className="panel">
        <DataTable
          columns={columns} rows={db.rooms} rowKey={(r) => r.code}
          searchable searchPlaceholder="Search code, name, or host" searchLabel="Search rooms"
          searchValue={(r) => `${r.code} ${r.name} ${r.hostId} ${r.status}`}
          emptyTitle="No rooms" emptyBody="Rooms appear here when players create them."
        />
      </div>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={`Edit room ${editing?.code ?? ''}`}
        footer={<>
          <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
          <Button variant="primary" onClick={() => {
            if (!editing) return;
            roomService.update(editing.code, { name: form.name.trim() || editing.name, visibility: form.visibility }, name);
            toast('Room updated.', 'success');
            setEditing(null);
          }}>Save</Button>
        </>}>
        <Field label="Room name" htmlFor="r-name">
          <Input id="r-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={32} />
        </Field>
        <Field label="Visibility" htmlFor="r-vis">
          <NativeSelect id="r-vis" value={form.visibility} onChange={(e) => setForm({ ...form, visibility: e.target.value as Room['visibility'] })}>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </NativeSelect>
        </Field>
      </Modal>

      <ConfirmDialog
        open={Boolean(closing)} onClose={() => setClosing(null)}
        onConfirm={() => { if (closing) { roomService.close(closing.code, name); toast('Room closed.', 'success'); } }}
        title="Close room" body={`Close ${closing?.name} (${closing?.code})? Players inside will be returned to the lobby.`}
        confirmLabel="Close room"
      />
    </AdminPage>
  );
}
