import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Check, Copy, Crown, Link2, LogOut, Play } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { socketClient } from '@/services/socketClient';
import { ApiError } from '@/services/apiClient';
import { SeoHead } from '@/components/SeoHead';
import { Avatar } from '@/components/Avatar';
import { Badge, Button, EmptyState, Spinner } from '@/components/ui';

interface WaitingRoomData {
  code: string; name: string; hostId: string; status: string;
  settings: { rounds: number; roundSeconds: number; difficulty: string; visibility: 'public' | 'private'; maxPlayers: number; hasPassword: boolean };
  players: Array<{ userId: string; username: string; avatarId: string; score: number; ready: boolean; connected: boolean; host: boolean; hasGuessed?: boolean }>;
}

export default function WaitingRoom() {
  const { t, path } = useI18n();
  const { user } = useAuth();
  const { code } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const cleanCode = (code || '').toUpperCase();
  const [room, setRoom] = useState<WaitingRoomData | null>(null);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    if (!cleanCode) return;
    let active = true;
    let offUpdate = () => {};
    let offRound = () => {};
    let offChoices = () => {};
    let offClosed = () => {};
    let offKicked = () => {};
    void socketClient.connect().then(async () => {
      offUpdate = socketClient.on<WaitingRoomData>('room:update', (updated) => {
        if (!active || updated.code !== cleanCode) return;
        setRoom(updated);
        if (updated.status !== 'waiting') navigate(path(`/game/${cleanCode}`), { replace: true });
      });
      offRound = socketClient.on('game:round-start', () => navigate(path(`/game/${cleanCode}`), { replace: true }));
      offChoices = socketClient.on('game:word-choices', () => navigate(path(`/game/${cleanCode}`), { replace: true }));
      offClosed = socketClient.on<{ code: string; reason: string }>('room:closed', (item) => { if (active && item.code === cleanCode) { toast(item.reason, 'error'); navigate(path('/lobby'), { replace: true }); } });
      offKicked = socketClient.on<{ code: string; reason: string }>('room:kicked', (item) => { if (active && item.code === cleanCode) { toast(item.reason, 'error'); navigate(path('/lobby'), { replace: true }); } });
      const joined = await socketClient.request<{ room: WaitingRoomData }>('room:join', { code: cleanCode });
      if (active) {
        setRoom(joined.room);
        if (joined.room.status !== 'waiting') navigate(path(`/game/${cleanCode}`), { replace: true });
      }
    }).catch((error: unknown) => {
      if (active) setLoadError(error instanceof Error ? error.message : 'Could not load this room.');
    });
    return () => { active = false; offUpdate(); offRound(); offChoices(); offClosed(); offKicked(); };
  }, [cleanCode, navigate, path]);

  const currentPlayer = useMemo(() => room?.players.find((player) => player.userId === user?.id), [room, user?.id]);
  if (!user) return <Navigate to={path('/play')} replace />;
  if (!room) {
    return <div className="page"><div className="container container-tiny">
      {loadError ? <EmptyState title={loadError} action={<Link to={path('/lobby')} className="btn btn-primary btn-sm">{t('results.backToLobby')}</Link>} /> : <Spinner label="Joining room…" />}
    </div></div>;
  }

  const isHost = room.hostId === user.id;
  const allReady = room.players.every((player) => player.host || player.ready);
  const canStart = room.players.filter((player) => player.connected).length >= 2 && allReady;

  const copy = async (value: string, setCopied: (value: boolean) => void, message: string) => {
    try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1800); toast(message, 'success'); }
    catch { toast(value); }
  };
  const leave = async () => {
    await socketClient.request('room:leave', { code: cleanCode }).catch(() => undefined);
    navigate(path('/lobby'));
  };
  const setReady = async () => {
    if (!currentPlayer) return;
    setBusy(true);
    try { await socketClient.request('room:ready', { code: cleanCode, ready: !currentPlayer.ready }); }
    catch (error) { toast(error instanceof Error ? error.message : 'Could not update ready state.', 'error'); }
    finally { setBusy(false); }
  };
  const startGame = async () => {
    setBusy(true);
    try { await socketClient.request('room:start', { code: cleanCode }); }
    catch (error) { toast(error instanceof ApiError ? error.message : String(error), 'error'); }
    finally { setBusy(false); }
  };
  const invite = `${window.location.origin}/join/${cleanCode}`;

  return (
    <div className="page">
      <SeoHead title={`${room.name} · DrawSpace`} description={t('seo.room')} noindex />
      <div className="container container-narrow">
        <div className="page-head"><h1 className="page-title">{room.name}</h1><p className="page-sub">{t('waiting.title')}</p></div>
        <div className="panel panel-pad waiting-code">
          <div><p className="faint waiting-code-label">{t('waiting.share')}</p><p className="waiting-code-value mono">{cleanCode}</p></div>
          <div className="waiting-code-actions">
            <Button size="sm" icon={copiedCode ? <Check size={14} className="accent" /> : <Copy size={14} />} onClick={() => void copy(cleanCode, setCopiedCode, t('toast.codeCopied'))}>{copiedCode ? 'Copied!' : t('common.copy')}</Button>
            <Button size="sm" variant="ghost" icon={copiedLink ? <Check size={14} className="accent" /> : <Link2 size={14} />} onClick={() => void copy(invite, setCopiedLink, t('toast.linkCopied'))}>{copiedLink ? 'Link copied!' : `${t('common.copy')} link`}</Button>
          </div>
        </div>
        <div className="panel waiting-players">
          {room.players.map((player) => <div key={player.userId} className="waiting-player">
            <Avatar avatarId={player.avatarId} size={36} /><span className="waiting-player-name">{player.username}</span>
            {player.host && <Badge tone="accent"><Crown size={11} /> host</Badge>}
            {!player.host && <Badge tone={player.ready ? 'accent' : 'neutral'}>{player.ready ? 'ready' : 'not ready'}</Badge>}
            {!player.connected && <span className="faint">disconnected</span>}
            {player.userId === user.id && <span className="faint waiting-you">({t('leaderboard.you')})</span>}
          </div>)}
          {room.players.length < room.settings.maxPlayers && <div className="waiting-player waiting-empty"><span className="waiting-empty-dot" aria-hidden /><span className="faint">{t('common.waiting')}…</span></div>}
        </div>
        <div className="waiting-settings mono faint">
          <span>{room.settings.rounds} {t('common.rounds')}</span><span>{room.settings.roundSeconds}s / {t('common.round').toLowerCase()}</span>
          <span>{t(`common.${room.settings.difficulty}` as 'common.easy')}</span><span>{room.settings.visibility === 'public' ? t('common.public') : t('common.private')}</span>
          <span>{room.players.length}/{room.settings.maxPlayers} {t('common.players')}</span>
        </div>
        <p className="faint waiting-note">{t('waiting.needPlayers')}</p>
        <div className="waiting-actions">
          <Button variant="ghost" icon={<LogOut size={15} />} onClick={() => void leave()}>{t('waiting.leave')}</Button>
          {isHost
            ? <Button variant="primary" size="lg" icon={<Play size={16} />} disabled={!canStart} loading={busy} onClick={() => void startGame()}>{t('waiting.startGame')}</Button>
            : <Button variant={currentPlayer?.ready ? 'secondary' : 'primary'} disabled={busy} loading={busy} onClick={() => void setReady()}>{currentPlayer?.ready ? 'Ready' : 'Mark ready'}</Button>}
        </div>
        {isHost && !canStart && <p className="faint waiting-need">{t('waiting.needPlayers')}</p>}
      </div>
    </div>
  );
}
