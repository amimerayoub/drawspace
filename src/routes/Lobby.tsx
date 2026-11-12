import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Lock, Plus, RefreshCw, Users } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
import { useAuth } from '@/context/AuthContext';
import { useDb } from '@/hooks/useDb';
import { useToast } from '@/context/ToastContext';
import { roomService } from '@/services';
import { SeoHead } from '@/components/SeoHead';
import { Avatar } from '@/components/Avatar';
import { Badge, Button, EmptyState, SearchInput, Segmented } from '@/components/ui';
import type { Room } from '@/types';

export default function Lobby() {
  const { t, path } = useI18n();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const dbState = useDb();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'waiting' | 'playing'>('all');
  const [, setRefresh] = useState(0);

  const rooms = useMemo(() => {
    return dbState.rooms
      .filter((r) => r.visibility === 'public')
      .filter((r) => (filter === 'all' ? true : r.status === filter))
      .filter((r) => r.name.toLowerCase().includes(query.toLowerCase()));
  }, [dbState.rooms, query, filter]);

  if (!user) return <Navigate to={path('/play')} replace />;

  const join = (room: Room) => {
    try {
      if (room.hasPassword) {
        navigate(path(`/join/${room.code}`));
        return;
      }
      roomService.join(room.code, '', user);
      navigate(path(`/room/${room.code}`));
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  return (
    <div className="page">
      <SeoHead title={`${t('lobby.title')} · DrawSpace`} description={t('lobby.sub')} />
      <div className="container">
        <div className="page-head page-head-row">
          <div>
            <h1 className="page-title">{t('lobby.title')}</h1>
            <p className="page-sub">{t('lobby.sub')}</p>
          </div>
          <Link to={path('/create')} className="btn btn-primary">
            <Plus size={16} /> {t('common.createRoom')}
          </Link>
        </div>

        <div className="lobby-controls">
          <SearchInput value={query} onChange={setQuery} placeholder={t('lobby.searchRooms')} label={t('lobby.searchRooms')} />
          <Segmented
            label={t('common.status')}
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: t('common.all') },
              { value: 'waiting', label: t('common.waiting') },
              { value: 'playing', label: t('common.playing') },
            ]}
          />
          <Button variant="ghost" size="sm" icon={<RefreshCw size={14} />} onClick={() => { setRefresh((n) => n + 1); toast(t('common.refresh')); }}>
            {t('common.refresh')}
          </Button>
        </div>

        {rooms.length === 0 ? (
          <EmptyState
            icon={<Users size={28} />}
            title={t('lobby.noRooms')}
            action={<Link to={path('/create')} className="btn btn-primary btn-sm">{t('lobby.createFirst')}</Link>}
          />
        ) : (
          <div className="panel room-list">
            {rooms.map((room) => {
              const host = room.players.find((p) => p.isHost);
              const full = room.players.length >= room.settings.maxPlayers;
              const playing = room.status === 'playing';
              return (
                <div key={room.code} className="room-row">
                  <Avatar avatarId={host?.avatarId ?? 'av-01'} size={38} />
                  <div className="room-info">
                    <p className="room-name">
                      {room.name}
                      {room.hasPassword && <Lock size={13} className="room-lock" aria-label={t('common.password')} />}
                    </p>
                    <p className="faint room-meta mono">
                      {room.players.length}/{room.settings.maxPlayers} {t('common.players')} · {room.settings.rounds} {t('common.rounds')} · {room.settings.roundSeconds}s · {t(`common.${room.settings.difficulty}` as 'common.easy')}
                    </p>
                  </div>
                  <Badge tone={playing ? 'outline' : 'accent'}>{playing ? t('common.playing') : full ? t('common.full') : t('common.waiting')}</Badge>
                  <Button size="sm" variant={playing || full ? 'ghost' : 'primary'} disabled={playing || full} onClick={() => join(room)}>
                    {t('common.join')}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}