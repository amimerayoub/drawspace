import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Flag, Link2, LogOut, MessageCircle, Trophy, Users, Volume2, VolumeX } from 'lucide-react';
import type { ChatMessage, RoomPlayer, Stroke } from '@/types';
import { useI18n } from '@/i18n/I18nContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { socketClient } from '@/services/socketClient';
import { apiPost, ApiError } from '@/services/apiClient';
import { DrawingCanvas } from '@/game/DrawingCanvas';
import { ChatPanel } from '@/game/ChatPanel';
import { PlayerList } from '@/game/PlayerList';
import { useSoundToggle } from '@/hooks/useSound';
import { useKeyboardViewport } from '@/hooks/useKeyboardViewport';
import { SeoHead } from '@/components/SeoHead';
import { Button, Field, Modal, NativeSelect, Spinner, Textarea } from '@/components/ui';

interface RoomSnapshot {
  id: string; code: string; name: string; hostId: string;
  status: 'waiting' | 'choosing' | 'drawing' | 'round_end' | 'finished';
  settings: { visibility: string; maxPlayers: number; rounds: number; roundSeconds: number; difficulty: string; wordMode: string; hasPassword: boolean };
  players: Array<{ userId: string; username: string; avatarId: string; score: number; ready: boolean; connected: boolean; host: boolean; hasGuessed?: boolean }>;
  round: number; rounds: number; turnId: number; drawerUserId: string | null; deadline: number | null; strokes: Stroke[];
}
interface Choice { id: string; word: string; category: string }
interface Standing { place: number; userId: string; username: string; avatarId: string; score: number }
interface ProgressionAward { xp: number; totalXP?: number; duplicate?: boolean }

export default function GameRoom() {
  const { t, path } = useI18n();
  const { user } = useAuth();
  const { code: routeCode } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [soundOn, toggleSound] = useSoundToggle();
  const chatInputRef = useRef<HTMLInputElement>(null);
  const reportFormRef = useRef<HTMLFormElement>(null);
  const turnIdRef = useRef(0);
  const code = (routeCode || '').toUpperCase();
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [phase, setPhase] = useState<'choosing' | 'drawing' | 'reveal' | 'finished'>('choosing');
  const [choices, setChoices] = useState<Choice[]>([]);
  const [choosingBusy, setChoosingBusy] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [wordLength, setWordLength] = useState(0);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [turnId, setTurnId] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [progressionAward, setProgressionAward] = useState<ProgressionAward | null>(null);
  const [loadingError, setLoadingError] = useState('');
  const [reportOpen, setReportOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState('');
  const [reportType, setReportType] = useState<'drawing' | 'chat' | 'harassment' | 'cheating' | 'other'>('other');
  const [reportDescription, setReportDescription] = useState('');
  const [reporting, setReporting] = useState(false);
  const [sideTab, setSideTab] = useState<'chat' | 'players'>('chat');
  const [chatUnread, setChatUnread] = useState(0);
  useKeyboardViewport();

  useEffect(() => {
    if (!user || !code) return;
    let active = true;
    const disposers: Array<() => void> = [];
    const addMessage = (message: Omit<ChatMessage, 'id'>) => setMessages((current) => [...current.slice(-99), { ...message, id: Date.now() + Math.random() }]);
    const applyTurnId = (id: number) => { turnIdRef.current = id; setTurnId(id); };
    const syncRoom = (next: RoomSnapshot) => {
      setRoom(next); setStrokes(next.strokes || []);
      if (typeof next.turnId === 'number') applyTurnId(next.turnId);
      setDeadline(next.deadline);
      if (next.status === 'waiting') navigate(path(`/room/${code}`), { replace: true });
      else if (next.status === 'finished') setPhase('finished');
      else if (next.status === 'drawing') setPhase('drawing');
      else if (next.status === 'round_end') setPhase('reveal');
      else setPhase('choosing');
    };
    const joinRoom = async () => {
      const joined = await socketClient.request<{ room: RoomSnapshot }>('room:join', { code });
      if (active) syncRoom(joined.room);
    };
    void socketClient.connect().then(async () => {
      if (!active) return;
      disposers.push(socketClient.on<RoomSnapshot>('room:update', (next) => { if (active && next.code === code) syncRoom(next); }));
      disposers.push(socketClient.on<Choice[]>('game:word-choices', (items) => { if (active) { setChoices(items); setChoosingBusy(false); setPhase('choosing'); } }));
      disposers.push(socketClient.on<{ word: string }>('game:your-word', (item) => { if (active) setAnswer(item.word); }));
      disposers.push(socketClient.on<{ round: number; turnId: number; drawerUserId: string; deadline: number; wordLength: number }>('game:round-start', (item) => {
        if (active) { applyTurnId(item.turnId); setPhase('drawing'); setAnswer(null); setChoices([]); setChoosingBusy(false); setWordLength(item.wordLength); setDeadline(item.deadline); setRemaining(Math.max(0, Math.ceil((item.deadline - Date.now()) / 1000))); setStrokes([]); }
      }));
      disposers.push(socketClient.on<{ remainingSeconds: number; deadline: number }>('game:timer', (item) => { if (active) { setRemaining(item.remainingSeconds); setDeadline(item.deadline); } }));
      disposers.push(socketClient.on<{ stroke: Stroke; turnId: number }>('game:stroke', (item) => { if (active && item.turnId === turnIdRef.current) setStrokes((current) => [...current, item.stroke]); }));
      disposers.push(socketClient.on<{ strokes: Stroke[]; turnId: number }>('game:drawing-state', (state) => { if (active && state.turnId === turnIdRef.current) setStrokes(state.strokes); }));
      disposers.push(socketClient.on<{ userId: string; username: string; text: string; at: number }>('game:chat', (message) => { if (active) addMessage({ playerId: message.userId, username: message.username, text: message.text, at: message.at, kind: 'guess' }); }));
      disposers.push(socketClient.on<{ userId: string; username: string; points: number }>('game:correct-guess', (message) => { if (active) addMessage({ playerId: message.userId, username: message.username, text: `guessed correctly (+${message.points})`, at: Date.now(), kind: 'correct' }); }));
      disposers.push(socketClient.on<{ round: number; turnId: number; word: string; scores: Array<{ userId: string; score: number }> }>('game:round-end', (item) => { if (active) { setPhase('reveal'); setAnswer(item.word); setStrokes([]); setChoices([]); setChoosingBusy(false); } }));
      disposers.push(socketClient.on<{ roomCode: string; standings: Standing[] }>('game:match-end', (item) => { if (active) { setStandings(item.standings); setStrokes([]); setChoices([]); setPhase('finished'); } }));
      disposers.push(socketClient.on<ProgressionAward>('game:progression-earned', (item) => { if (active && !item.duplicate) setProgressionAward(item); }));
      disposers.push(socketClient.on<{ code: string; reason: string }>('room:closed', (item) => { if (active && item.code === code) { toast(item.reason, 'error'); navigate(path('/lobby'), { replace: true }); } }));
      disposers.push(socketClient.on<{ code: string; reason: string }>('room:kicked', (item) => { if (active && item.code === code) { toast(item.reason, 'error'); navigate(path('/lobby'), { replace: true }); } }));
      disposers.push(socketClient.onReconnect(() => { if (active) void joinRoom().catch(() => undefined); }));
      try {
        await joinRoom();
      } catch (error) { if (active) setLoadingError(error instanceof Error ? error.message : 'Could not join this game.'); }
    }).catch((error: unknown) => { if (active) setLoadingError(error instanceof Error ? error.message : 'Could not connect to the game server.'); });
    return () => { active = false; disposers.forEach((dispose) => dispose()); };
  }, [user?.id, code, navigate, path]);

  useEffect(() => {
    if (!deadline || phase !== 'drawing') return;
    const update = () => setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    update(); const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [deadline, phase]);

  const scores = useMemo(() => Object.fromEntries((room?.players || []).map((player) => [player.userId, player.score])), [room]);
  const players = useMemo<RoomPlayer[]>(() => (room?.players || []).map((player) => ({
    id: player.userId, username: player.username, avatarId: player.avatarId, score: player.score,
    isHost: player.host, isBot: false, guessed: Boolean(player.hasGuessed),
  })), [room]);
  const drawer = room?.players.find((player) => player.userId === room.drawerUserId);
  const isDrawer = room?.drawerUserId === user?.id;
  const guessedIds = room?.players.filter((player) => player.hasGuessed).map((player) => player.userId) || [];

  if (!user) return <Navigate to={path('/play')} replace />;
  if (!room) return <div className="page container container-narrow">{loadingError ? <p role="alert">{loadingError} <Link to={path('/lobby')}>Back to lobby</Link></p> : <Spinner label="Connecting to game…" />}</div>;

  const sendGuess = (text: string) => {
    void socketClient.request('game:guess', { code, text, turnId: turnIdRef.current }).catch((error) => {
      if (error instanceof ApiError && ['STALE_TURN', 'ROUND_EXPIRED', 'ROUND_NOT_ACTIVE'].includes(error.code ?? '')) return;
      toast(error instanceof Error ? error.message : 'Guess could not be sent.', 'error');
    });
    return 'chat' as const;
  };
  const leave = async () => {
    await socketClient.request('room:leave', { code }).catch(() => undefined);
    navigate(path('/lobby'));
  };
  const choose = async (item: Choice) => {
    if (choosingBusy) return;
    setChoosingBusy(true);
    try { await socketClient.request('game:choose-word', { code, id: item.id }); setChoices([]); }
    catch (error) { setChoosingBusy(false); toast(error instanceof Error ? error.message : 'Word choice failed.', 'error'); }
  };
  const copyInvite = async () => {
    const invite = `${window.location.origin}/join/${code}`;
    try { await navigator.clipboard.writeText(invite); toast(t('toast.linkCopied'), 'success'); }
    catch { toast(invite); }
  };
  const sendStroke = (stroke: Stroke) => {
    void socketClient.request('game:stroke', { code, stroke, turnId: turnIdRef.current }).catch((error) => {
      if (error instanceof ApiError && error.code === 'STALE_TURN') return;
      toast(error instanceof Error ? error.message : 'Drawing could not be synchronized.', 'error');
    });
  };
  const sendDrawingAction = (action: 'undo' | 'redo' | 'clear') => {
    void socketClient.request(action === 'clear' ? 'game:clear' : `game:${action}`, { code }).catch((error) => toast(error instanceof Error ? error.message : 'Drawing action failed.', 'error'));
  };
  const submitReport = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reportTarget || reporting) return;
    setReporting(true);
    try {
      await apiPost('/api/reports', { roomCode: code, reportedUserId: reportTarget, reportType, description: reportDescription });
      setReportOpen(false);
      setReportDescription('');
      toast('Report sent to moderators.', 'success');
    } catch (error) { toast(error instanceof Error ? error.message : 'Report could not be sent.', 'error'); }
    finally { setReporting(false); }
  };
  const pct = Math.max(0, Math.min(100, room.settings.roundSeconds ? (remaining / room.settings.roundSeconds) * 100 : 0));

  return (
    <div className={`game-shell ${phase === 'finished' ? 'finished' : ''}`}>
      <SeoHead title={`${room.name} · DrawSpace`} description={t('seo.game')} noindex />
      <header className="game-topbar">
        <div className="game-top-left"><Link to={path('/')} className="game-brand" aria-label="DrawSpace">✦</Link><div className="game-room-meta"><span className="game-room-name">{room.name}</span><span className="game-round faint">{t('game.roundOf', { current: room.round, total: room.rounds })}</span></div></div>
        <div className="game-word-area">
          {phase === 'finished'
            ? <span className="faint game-choosing-note">{t('game.matchOver')}</span>
            : phase === 'choosing' && isDrawer
              ? <span className="faint game-choosing-note">{t('game.chooseWord')}</span>
              : phase === 'choosing'
                ? <span className="faint game-choosing-note">{t('game.drawer', { name: drawer?.username ?? '' })}</span>
                : answer
                  ? <span className="word-display word-known mono">{answer}</span>
                  : <span className="word-display mono" aria-label={`${wordLength} letters`}>{Array.from({ length: wordLength }, (_, index) => <span key={index} className="word-letter">_</span>)}</span>}
        </div>
        <div className="game-top-right"><div className={`game-timer ${remaining <= 5 && phase === 'drawing' ? 'urgent' : ''}`} role="timer"><span className="mono game-timer-value">{phase === 'drawing' ? remaining : 0}</span><span className="faint game-timer-unit">s</span></div><button className="icon-button" onClick={toggleSound} aria-label={soundOn ? t('common.soundOn') : t('common.soundOff')}>{soundOn ? <Volume2 size={17} /> : <VolumeX size={17} />}</button><Button variant="ghost" size="sm" icon={<Flag size={15} />} onClick={() => setReportOpen(true)}>Report</Button><Button variant="ghost" size="sm" icon={<LogOut size={15} />} onClick={() => void leave()}>{t('common.leave')}</Button></div>
      </header>
      <div className="game-timer-bar" aria-hidden><div className="game-timer-fill" style={{ width: `${pct}%` }} /></div>
      <main className="game-main">
        <section className="game-canvas-col">
          {phase === 'finished' ? (
            <div className="game-results">
              <div className="panel panel-pad results-head">
                <h2 className="results-title"><Trophy size={18} aria-hidden /> {t('results.title')}</h2>
                {standings[0] && <p className="results-winner-name">{t('results.winner', { name: standings[0].username })}</p>}
              </div>
              <ol className="panel results-standings">
                {standings.map((entry) => (
                  <li key={entry.userId} className={`results-row ${entry.userId === user.id ? 'me' : ''} ${entry.place === 1 ? 'first' : ''}`}>
                    <span className={`results-place mono ${entry.place <= 3 ? 'top' : ''}`}>{entry.place}</span>
                    <span className="results-name">{entry.username}</span>
                    <span className="results-score mono">{entry.score}</span>
                  </li>
                ))}
              </ol>
              {progressionAward && <p className="accent results-xp-note">+{progressionAward.xp} XP · {progressionAward.totalXP} XP</p>}
              <div className="results-actions">
                <Button variant="primary" size="lg" onClick={() => void leave()}>{t('results.backToLobby')}</Button>
                <Button variant="secondary" icon={<Link2 size={15} />} onClick={() => void copyInvite()}>{t('results.copyInvite')}</Button>
              </div>
            </div>
          ) : (
            <div className="game-canvas-frame">
              {phase === 'reveal' ? (
                <div className="canvas-overlay">
                  <div className="glass-overlay reveal-card">
                    <p className="faint reveal-label">{t('game.roundComplete')}</p>
                    <p className="reveal-word">{answer}</p>
                    <p className="faint reveal-next">{t('game.nextSoon')}</p>
                  </div>
                </div>
              ) : (
                <DrawingCanvas interactive={Boolean(isDrawer && phase === 'drawing')} replayStrokes={strokes} resetKey={turnId} onStroke={sendStroke} onUndo={() => sendDrawingAction('undo')} onRedo={() => sendDrawingAction('redo')} onClear={() => sendDrawingAction('clear')} />
              )}
              {phase === 'choosing' && isDrawer && choices.length > 0 && (
                <div className="canvas-overlay">
                  <div className="glass-overlay word-choice" role="dialog" aria-modal="true" aria-label={t('game.chooseWord')}>
                    <p className="word-choice-title">{t('game.chooseWord')}</p>
                    <div className="word-choice-grid">
                      {choices.map((item) => (
                        <button key={item.id} type="button" className="word-choice-card" disabled={choosingBusy} onClick={() => void choose(item)}>
                          <span className="word-choice-word">{item.word}</span>
                          <span className="word-choice-meta faint">{item.category}</span>
                        </button>
                      ))}
                    </div>
                    <p className="faint word-choice-foot">{t('game.chooseAuto')}</p>
                  </div>
                </div>
              )}
              {phase === 'choosing' && (!isDrawer || choices.length === 0) && (
                <div className="canvas-overlay">
                  <div className="glass-overlay word-waiting">
                    <Spinner label={isDrawer ? t('game.chooseWord') : t('game.drawer', { name: drawer?.username ?? '' })} />
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
        <div className="game-side-stack">
          <div className="game-tabs" role="group" aria-label={t('game.panelTabs')}>
            <button type="button" className={`game-tab ${sideTab === 'chat' ? 'active' : ''}`} aria-pressed={sideTab === 'chat'} aria-controls="game-panel-chat" onClick={() => setSideTab('chat')}>
              <MessageCircle size={15} aria-hidden /><span>{t('game.chat')}</span>{chatUnread > 0 && sideTab !== 'chat' && <span className="game-tab-badge mono">{chatUnread > 99 ? '99+' : chatUnread}</span>}
            </button>
            <button type="button" className={`game-tab ${sideTab === 'players' ? 'active' : ''}`} aria-pressed={sideTab === 'players'} aria-controls="game-panel-players" onClick={() => setSideTab('players')}>
              <Users size={15} aria-hidden /><span>{t('game.players')}</span><span className="game-tab-count mono faint">{room.players.length}</span>
            </button>
          </div>
          <aside id="game-panel-players" className={`game-side game-side-players ${sideTab === 'players' ? '' : 'tab-hidden'}`}>
            <PlayerList players={players} scores={scores} guessedIds={guessedIds} drawerId={room.drawerUserId || ''} myId={user.id} hostId={room.hostId} />
          </aside>
          <aside id="game-panel-chat" className={`game-side game-side-chat ${sideTab === 'chat' ? '' : 'tab-hidden'}`}>
            <ChatPanel messages={messages} onSend={sendGuess} disabled={phase !== 'drawing' || isDrawer || guessedIds.includes(user.id)} inputRef={chatInputRef} active={sideTab === 'chat'} onUnreadChange={setChatUnread} />
          </aside>
        </div>
      </main>
      <Modal open={reportOpen} onClose={() => setReportOpen(false)} title={t('report.title')} footer={<><Button variant="ghost" onClick={() => setReportOpen(false)}>{t('common.cancel')}</Button><Button variant="primary" onClick={() => reportFormRef.current?.requestSubmit()} disabled={reporting || !reportTarget}>{reporting ? 'Sending…' : t('report.submit')}</Button></>}>
        <form ref={reportFormRef} onSubmit={(event) => void submitReport(event)} className="form-stack">
          <Field label="Player" htmlFor="report-target"><NativeSelect id="report-target" value={reportTarget} onChange={(event) => setReportTarget(event.target.value)}><option value="">Choose a player</option>{room.players.filter((player) => player.userId !== user.id).map((player) => <option key={player.userId} value={player.userId}>{player.username}</option>)}</NativeSelect></Field>
          <Field label={t('report.reason')} htmlFor="report-type"><NativeSelect id="report-type" value={reportType} onChange={(event) => setReportType(event.target.value as typeof reportType)}><option value="drawing">Drawing</option><option value="chat">Chat</option><option value="harassment">Harassment</option><option value="cheating">Cheating</option><option value="other">Other</option></NativeSelect></Field>
          <Field label={t('report.details')} htmlFor="report-details"><Textarea id="report-details" required minLength={5} maxLength={500} value={reportDescription} onChange={(event) => setReportDescription(event.target.value)} placeholder={t('report.placeholder')} /></Field>
        </form>
      </Modal>
    </div>
  );
}
