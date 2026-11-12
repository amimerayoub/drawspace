import { useEffect } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Copy, Crown, Link2, LogOut, Play } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
import { useAuth } from '@/context/AuthContext';
import { useDb } from '@/hooks/useDb';
import { useToast } from '@/context/ToastContext';
import { useInterval } from '@/hooks/useSound';
import { roomService } from '@/services';
import { playSound } from '@/hooks/useSound';
import { SeoHead } from '@/components/SeoHead';
import { Avatar } from '@/components/Avatar';
import { Badge, Button, EmptyState } from '@/components/ui';

export default function WaitingRoom() {
  const { t, path } = useI18n();
  const { user } = useAuth();
  const { code } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const dbState = useDb();
  const room = dbState.rooms.find((r) => r.code === code?.toUpperCase());

  useEffect(() => {
    if (room?.status === 'playing') navigate(path(`/game/${room.code}`), { replace: true });
  }, [room?.status, room?.code, navigate, path]);

  useInterval(() => {
    if (!room || room.status !== 'waiting') return;
    const botCount = room.players.filter((p) => p.isBot).length;
    if (botCount < 3 && room.players.length < room.settings.maxPlayers) {
      const bot = roomService.addBot(room.code);
      if (bot) {
        playSound('join');
        toast(t('waiting.playerJoined', { name: bot.username }));
      }
    }
  }, room && room.status === 'waiting' && room.players.filter((p) => p.isBot).length < 3 ? 2600 : null);

  if (!user) return <Navigate to={path('/play')} replace />;
  if (!room) {
    return (
      <div className="page">
        <div className="container container-tiny">
          <EmptyState
            title={t('join.notFound')}
            action={<Link to={path('/lobby')} className="btn btn-primary btn-sm">{t('results.backToLobby')}</Link>}
          />
        </div>
      </div>
    );
  }

  const isHost = room.hostId === user.id;
  const canStart = room.players.length >= 2;

  const copy = async (text: string, message: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(message, 'success');
    } catch {
      toast(text);
    }
  };

  const leave = () => {
    roomService.removePlayer(room.code, user.id);
    navigate(path('/lobby'));
  };

  return (
    <div className="page">
      <SeoHead title={`${room.name} · DrawSpace`} />
      <div className="container container-narrow">
        <div className="page-head">
          <h1 className="page-title">{room.name}</h1>
          <p className="page-sub">{t('waiting.title')}</p>
        </div>

        <div className="panel panel-pad waiting-code">
          <div>
            <p className="faint waiting-code-label">{t('waiting.share')}</p>
            <p className="waiting-code-value mono">{room.code}</p>
          </div>
          <div className="waiting-code-actions">
            <Button size="sm" icon={<Copy size={14} />} onClick={() => copy(room.code, t('toast.codeCopied'))}>{t('common.copy')}</Button>
            <Button size="sm" variant="ghost" icon={<Link2 size={14} />} onClick={() => copy(`${window.location.origin}${path(`/join/${room.code}`)}`, t('toast.linkCopied'))}>
              {t('common.copy')} link
            </Button>
          </div>
        </div>

        <div className="panel waiting-players">
          {room.players.map((p) => (
            <div key={p.id} className="waiting-player">
              <Avatar avatarId={p.avatarId} size={36} />
              <span className="waiting-player-name">{p.username}</span>
              {p.isHost && <Badge tone="accent"><Crown size={11} /> host</Badge>}
              {p.isBot && <Badge>bot</Badge>}
              {p.id === user.id && <span className="faint waiting-you">({t('leaderboard.you')})</span>}
            </div>
          ))}
          {room.players.length < room.settings.maxPlayers && (
            <div className="waiting-player waiting-empty">
              <span className="waiting-empty-dot" aria-hidden />
              <span className="faint">{t('common.waiting')}…</span>
            </div>
          )}
        </div>

        <div className="waiting-settings mono faint">
          <span>{room.settings.rounds} {t('common.rounds')}</span>
          <span>{room.settings.roundSeconds}s / {t('common.round').toLowerCase()}</span>
          <span>{t(`common.${room.settings.difficulty}` as 'common.easy')}</span>
          <span>{room.visibility === 'public' ? t('common.public') : t('common.private')}</span>
          <span>{room.players.length}/{room.settings.maxPlayers} {t('common.players')}</span>
        </div>

        <p className="faint waiting-note">{t('waiting.botsNote')}</p>

        <div className="waiting-actions">
          <Button variant="ghost" icon={<LogOut size={15} />} onClick={leave}>{t('waiting.leave')}</Button>
          {isHost ? (
            <Button
              variant="primary"
              size="lg"
              icon={<Play size={16} />}
              disabled={!canStart}
              onClick={() => {
                roomService.start(room.code);
                navigate(path(`/game/${room.code}`));
              }}
            >
              {t('waiting.startGame')}
            </Button>
          ) : (
            <p className="muted waiting-host-note">{t('waiting.hostOnly')}</p>
          )}
        </div>
        {isHost && !canStart && <p className="faint waiting-need">{t('waiting.needPlayers')}</p>}
      </div>
    </div>
  );
}