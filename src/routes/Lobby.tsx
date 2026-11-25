import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Lock, Plus, RefreshCw, Users } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { apiGet } from '@/services/apiClient';
import { socketClient } from '@/services/socketClient';
import { SeoHead } from '@/components/SeoHead';
import { Avatar } from '@/components/Avatar';
import { Badge, Button, EmptyState, SearchInput, Segmented, Spinner } from '@/components/ui';

interface RoomDto {
  code: string; name: string; status: 'waiting' | 'choosing' | 'drawing' | 'round_end' | 'finished';
  settings: { visibility: 'public' | 'private'; hasPassword: boolean; maxPlayers: number; rounds: number; roundSeconds: number; difficulty: string };
  players: Array<{ username: string; avatarId: string; connected: boolean; host: boolean }>;
}

export default function Lobby() {
  const { t, path } = useI18n();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'waiting' | 'playing'>('all');
  const [rooms, setRooms] = useState<RoomDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [joining, setJoining] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try { setRooms(await apiGet<RoomDto[]>('/api/rooms', { auth: 'none' })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Rooms could not be loaded.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  const visibleRooms = useMemo(() => rooms
    .filter((room) => filter === 'all' || room.status === filter)
    .filter((room) => room.name.toLowerCase().includes(query.toLowerCase())), [rooms, query, filter]);

  if (!user) return <Navigate to={path('/play')} replace />;

  const join = async (room: RoomDto) => {
    if (room.settings.hasPassword) { navigate(path(`/join/${room.code}`)); return; }
    setJoining(room.code);
    try {
      await socketClient.request('room:join', { code: room.code });
      navigate(path(`/room/${room.code}`));
    } catch (cause) { toast(cause instanceof Error ? cause.message : 'Could not join this room.', 'error'); }
    finally { setJoining(null); }
  };

  return (
    <div className="page">
      <SeoHead title={`${t('lobby.title')} · DrawSpace`} description={t('seo.lobby')} noindex />
      <div className="container">
        <div className="page-head page-head-row">
          <div><h1 className="page-title">{t('lobby.title')}</h1><p className="page-sub">{t('lobby.sub')}</p></div>
          <Link to={path('/create')} className="btn btn-primary"><Plus size={16} /> {t('common.createRoom')}</Link>
        </div>
        <div className="lobby-controls">
          <SearchInput value={query} onChange={setQuery} placeholder={t('lobby.searchRooms')} label={t('lobby.searchRooms')} />
          <Segmented label={t('common.status')} value={filter} onChange={setFilter} options={[
            { value: 'all', label: t('common.all') }, { value: 'waiting', label: t('common.waiting') }, { value: 'playing', label: t('common.playing') },
          ]} />
          <Button variant="ghost" size="sm" icon={<RefreshCw size={14} />} loading={loading} onClick={() => void refresh()}>{t('common.refresh')}</Button>
        </div>
        {loading ? <Spinner label="Loading rooms…" /> : error ? <EmptyState icon={<Users size={28} />} title={error} action={<Button variant="primary" size="sm" onClick={() => void refresh()}>{t('common.refresh')}</Button>} /> : visibleRooms.length === 0 ? (
          <EmptyState icon={<Users size={28} />} title={t('lobby.noRooms')} action={<Link to={path('/create')} className="btn btn-primary btn-sm">{t('lobby.createFirst')}</Link>} />
        ) : (
          <div className="panel room-list">
            {visibleRooms.map((room) => {
              const host = room.players.find((player) => player.host);
              const full = room.players.length >= room.settings.maxPlayers;
              return <div key={room.code} className="room-row">
                <Avatar avatarId={host?.avatarId ?? 'av-01'} size={38} />
                <div className="room-info">
                  <p className="room-name">{room.name}{room.settings.hasPassword && <Lock size={13} className="room-lock" aria-label={t('common.password')} />}</p>
                  <p className="faint room-meta mono">{room.players.length}/{room.settings.maxPlayers} {t('common.players')} · {room.settings.rounds} {t('common.rounds')} · {room.settings.roundSeconds}s · {room.settings.difficulty}</p>
                </div>
                <Badge tone={full ? 'outline' : 'accent'}>{full ? t('common.full') : t('common.waiting')}</Badge>
                <Button size="sm" variant={full ? 'ghost' : 'primary'} disabled={full || joining !== null} loading={joining === room.code} onClick={() => void join(room)}>{t('common.join')}</Button>
              </div>;
            })}
          </div>
        )}
      </div>
    </div>
  );
}
