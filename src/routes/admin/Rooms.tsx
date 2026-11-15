import { useCallback, useEffect, useState } from 'react';
import { Eye, Lock, RotateCw, UserMinus, XCircle } from 'lucide-react';
import type { AdminRoom, AdminRoomPlayer } from '@/types';
import { useToast } from '@/context/ToastContext';
import { backendAdminService } from '@/services/backendAdmin.service';
import { Badge, Button, Field, Input, Modal, Spinner } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable';
import { AdminPage, NoAccess, useAdmin } from './shared';

const statusTone = (status: AdminRoom['status']) => (status === 'drawing' || status === 'choosing' ? 'accent' : status === 'waiting' ? 'neutral' : 'outline');
const hostName = (room: AdminRoom) => room.players.find((player) => player.userId === room.hostId)?.username ?? room.hostId;

export default function Rooms() {
  const { can } = useAdmin();
  const { toast } = useToast();
  const canView = can('rooms.view');
  const canModerate = can('moderation.handle');

  const [rooms, setRooms] = useState<AdminRoom[]>([]);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<AdminRoom | null>(null);
  const [closing, setClosing] = useState<AdminRoom | null>(null);
  const [kicking, setKicking] = useState<{ room: AdminRoom; player: AdminRoomPlayer } | null>(null);
  const [reason, setReason] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await backendAdminService.rooms();
      setRooms(data);
      setError('');
      setSelected((current) => (current ? data.find((room) => room.code === current.code) ?? null : null));
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rooms could not be loaded.');
      return null;
    } finally {
      setRefreshing(false);
    }
  }, []);
  useEffect(() => { if (canView) void load(); }, [canView, load]);

  const openModal = (room: AdminRoom | null, kind: 'close' | 'kick', player?: AdminRoomPlayer) => {
    setReason(''); setActionError('');
    if (kind === 'close') setClosing(room);
    else if (room && player) setKicking({ room, player });
  };

  const closeRoom = async () => {
    if (!closing) return;
    if (reason.trim().length < 3) { setActionError('Enter a reason of at least 3 characters.'); return; }
    setBusy(true); setActionError('');
    try {
      await backendAdminService.closeRoom(closing.code, reason.trim());
      toast('Room closed. Players were returned to the lobby.', 'success');
      setClosing(null); setReason('');
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Room could not be closed.');
    } finally { setBusy(false); }
  };

  const kickPlayer = async () => {
    if (!kicking) return;
    if (reason.trim().length < 3) { setActionError('Enter a reason of at least 3 characters.'); return; }
    setBusy(true); setActionError('');
    try {
      await backendAdminService.kickPlayer(kicking.room.code, kicking.player.userId, reason.trim());
      toast(`${kicking.player.username} was removed from the room.`, 'success');
      setKicking(null); setReason('');
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Player could not be removed.');
    } finally { setBusy(false); }
  };

  if (!canView) return <NoAccess />;

  const columns: Column<AdminRoom>[] = [
    { key: 'code', header: 'Code', render: (room) => <span className="mono admin-room-code">{room.code}</span>, sortValue: (room) => room.code },
    { key: 'name', header: 'Room', width: '22%', render: (room) => <span className="admin-user-name">{room.name} {room.hasPassword && <Lock size={12} className="faint" aria-label="password protected" />}</span>, sortValue: (room) => room.name },
    { key: 'host', header: 'Host', render: (room) => <span className="muted">{hostName(room)}</span>, sortValue: (room) => hostName(room) },
    { key: 'players', header: 'Players', align: 'end', render: (room) => <span className="mono">{room.connectedCount}/{room.playerCount} <span className="faint">of {room.settings.maxPlayers}</span></span>, sortValue: (room) => room.playerCount },
    { key: 'settings', header: 'Settings', render: (room) => <span className="faint mono">{room.settings.rounds}r · {room.settings.roundSeconds}s · {room.settings.difficulty}</span> },
    { key: 'status', header: 'Status', render: (room) => <Badge tone={statusTone(room.status)}>{room.status.replace('_', ' ')}</Badge>, sortValue: (room) => room.status },
    {
      key: 'actions', header: '', align: 'end', width: '120px',
      render: (room) => (
        <span className="admin-row-actions">
          <Button size="sm" variant="ghost" icon={<Eye size={14} />} onClick={() => setSelected(room)} aria-label={`View ${room.name}`} />
          {canModerate && room.status !== 'finished' && <Button size="sm" variant="ghost" icon={<XCircle size={14} />} onClick={() => openModal(room, 'close')} aria-label={`Close ${room.name}`} />}
        </span>
      ),
    },
  ];

  const playerColumns: Column<AdminRoomPlayer>[] = [
    { key: 'username', header: 'Player', render: (player) => <span className="admin-user-name">{player.username} {player.isGuest && <Badge tone="outline">guest</Badge>} {player.host && <Badge tone="accent">host</Badge>}</span>, sortValue: (player) => player.username },
    { key: 'connected', header: 'Connection', render: (player) => <Badge tone={player.connected ? 'neutral' : 'outline'}>{player.connected ? 'online' : 'offline'}</Badge>, sortValue: (player) => String(player.connected) },
    { key: 'score', header: 'Score', align: 'end', render: (player) => <span className="mono">{player.score}</span>, sortValue: (player) => player.score },
    {
      key: 'actions', header: '', align: 'end', width: '90px',
      render: (player) => canModerate && selected && selected.status !== 'finished'
        ? <Button size="sm" variant="ghost" icon={<UserMinus size={14} />} onClick={() => openModal(selected, 'kick', player)} aria-label={`Remove ${player.username}`} />
        : null,
    },
  ];

  return (
    <AdminPage
      title="Room management"
      sub="Live and waiting rooms from the game server. Closing a room returns its players to the lobby."
      actions={<Button variant="secondary" icon={<RotateCw size={15} />} loading={refreshing} onClick={() => void load()}>Refresh</Button>}
    >
      {error && <p role="alert" className="muted">{error}</p>}
      {!rooms.length && !error && refreshing && <div className="page"><Spinner /></div>}
      <div className="panel">
        <DataTable
          columns={columns} rows={rooms} rowKey={(room) => room.code}
          searchable searchPlaceholder="Search code, name, or host" searchLabel="Search rooms"
          searchValue={(room) => `${room.code} ${room.name} ${hostName(room)} ${room.status}`}
          emptyTitle="No active rooms" emptyBody="Rooms appear here when players create them."
        />
      </div>

      <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title={selected ? `Room ${selected.code}` : ''} wide
        footer={<Button variant="ghost" onClick={() => setSelected(null)}>Close</Button>}>
        {selected && (
          <>
            <div className="admin-grid-2" style={{ marginBottom: 16 }}>
              <Field label="Name">{selected.name}</Field>
              <Field label="Host">{hostName(selected)}</Field>
              <Field label="Status"><Badge tone={statusTone(selected.status)}>{selected.status.replace('_', ' ')}</Badge></Field>
              <Field label="Visibility">{selected.visibility}{selected.hasPassword ? ' · password' : ''}</Field>
              <Field label="Round">{selected.round} of {selected.rounds}</Field>
              <Field label="Players">{selected.connectedCount} online / {selected.playerCount} joined</Field>
            </div>
            <DataTable columns={playerColumns} rows={selected.players} rowKey={(player) => player.userId} emptyTitle="No players" />
          </>
        )}
      </Modal>

      <Modal open={Boolean(closing)} onClose={() => setClosing(null)} title={`Close room ${closing?.code ?? ''}`}
        footer={<>
          <Button variant="ghost" onClick={() => setClosing(null)} disabled={busy}>Cancel</Button>
          <Button variant="danger" loading={busy} onClick={() => void closeRoom()}>Close room</Button>
        </>}>
        <p className="muted">Close {closing?.name} ({closing?.code})? Every player inside is returned to the lobby and the game ends immediately.</p>
        <Field label="Reason" htmlFor="close-reason" hint="Recorded in the audit log.">
          <Input id="close-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={255} placeholder="e.g. Inappropriate room name" />
        </Field>
        {actionError && <p role="alert" className="admin-form-error">{actionError}</p>}
      </Modal>

      <Modal open={Boolean(kicking)} onClose={() => setKicking(null)} title={`Remove ${kicking?.player.username ?? ''}`}
        footer={<>
          <Button variant="ghost" onClick={() => setKicking(null)} disabled={busy}>Cancel</Button>
          <Button variant="danger" loading={busy} onClick={() => void kickPlayer()}>Remove player</Button>
        </>}>
        <p className="muted">Remove {kicking?.player.username} from room {kicking?.room.code}? They are returned to the lobby. The room stays open for everyone else.</p>
        <Field label="Reason" htmlFor="kick-reason" hint="Recorded in the audit log.">
          <Input id="kick-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={255} placeholder="e.g. Harassing other players" />
        </Field>
        {actionError && <p role="alert" className="admin-form-error">{actionError}</p>}
      </Modal>
    </AdminPage>
  );
}