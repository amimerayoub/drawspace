import { useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Flag, LogOut, MessageCircle, RefreshCw, Users, Volume2, VolumeX } from 'lucide-react';
import type { Room, Word } from '@/types';
import { useI18n } from '@/i18n/I18nContext';
import { useAuth, fullUser, type SessionUser } from '@/context/AuthContext';
import { useDb } from '@/hooks/useDb';
import { useToast } from '@/context/ToastContext';
import { useSoundToggle } from '@/hooks/useSound';
import { useKeyboardViewport } from '@/hooks/useKeyboardViewport';
import { authService, progressionService, reportService, roomService } from '@/services';
import { useGameEngine, type MatchResults } from '@/game/useGameEngine';
import { DrawingCanvas } from '@/game/DrawingCanvas';
import { ChatPanel } from '@/game/ChatPanel';
import { PlayerList } from '@/game/PlayerList';
import { Avatar } from '@/components/Avatar';
import { Badge, Button, ConfirmDialog, EmptyState, Field, IconButton, Modal, NativeSelect, Spinner, Textarea } from '@/components/ui';
import { SeoHead } from '@/components/SeoHead';

function WordDisplay({ word, hintIndices, showWord }: { word: Word | null; hintIndices: number[]; showWord: boolean }) {
  if (!word) return <span className="word-display faint">···</span>;
  if (showWord) return <span className="word-display word-known mono">{word.text}</span>;
  return (
    <span className="word-display mono" aria-label={`${word.text.length} letters`}>
      {word.text.split('').map((ch, i) => (
        <span key={i} className={hintIndices.includes(i) ? 'word-letter revealed' : 'word-letter'}>
          {ch === ' ' ? ' ' : hintIndices.includes(i) ? ch : '_'}
        </span>
      ))}
    </span>
  );
}

export default function GameRoom() {
  const { t, path } = useI18n();
  const { user } = useAuth();
  const { code } = useParams();
  const dbState = useDb();
  const room = dbState.rooms.find((r) => r.code === code?.toUpperCase());

  if (!user) return <Navigate to={path('/play')} replace />;
  if (!room) {
    return (
      <div className="page container container-narrow">
        <EmptyState title={t('join.notFound')} action={<Link to={path('/lobby')} className="btn btn-primary btn-sm">{t('results.backToLobby')}</Link>} />
      </div>
    );
  }
  if (room.status === 'waiting') return <Navigate to={path(`/room/${room.code}`)} replace />;
  if (!room.players.some((p) => p.id === user.id)) return <Navigate to={path(`/join/${room.code}`)} replace />;

  return <GameSession room={room} user={user} />;
}

function GameSession({ room, user }: { room: Room; user: SessionUser }) {
  const { t, path } = useI18n();
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [soundOn, toggleSound] = useSoundToggle();
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('drawing');
  const [reportDetail, setReportDetail] = useState('');
  const [sideTab, setSideTab] = useState<'chat' | 'players'>('chat');
  const [chatUnread, setChatUnread] = useState(0);
  const chatInputRef = useRef<HTMLInputElement>(null);
  useKeyboardViewport();

  const handleFinish = (results: MatchResults) => {
    progressionService.recordMatch(user.id, {
      roomName: room.name, playedAt: new Date().toISOString(), players: room.players.length,
      placement: results.myPlace, score: results.myScore, xpEarned: results.xpEarned, rounds: room.settings.rounds,
    });
    const full = fullUser(user.id);
    if (full) {
      authService.updateUser(user.id, {
        stats: {
          ...full.stats,
          correctGuesses: full.stats.correctGuesses + results.correctCount,
          wordsDrawn: full.stats.wordsDrawn + results.turnsDrawn,
        },
      });
    }
    roomService.finish(room.code);
    refresh();
    try {
      sessionStorage.setItem(`drawspace:results:${room.code}`, JSON.stringify(results));
    } catch { /* private mode */ }
    navigate(path(`/results/${room.code}`), { replace: true });
  };

  const engine = useGameEngine(room, user.id, t, handleFinish);
  const { state } = engine;
  const drawer = room.players.find((p) => p.id === state.drawerId);
  const seconds = Math.ceil(state.timeLeft);
  const pct = Math.max(0, Math.min(100, (state.timeLeft / state.timeTotal) * 100));

  const leave = () => {
    roomService.removePlayer(room.code, user.id);
    navigate(path('/lobby'));
  };

  const sendReport = () => {
    reportService.create({
      type: reportReason as 'drawing', target: `${room.code} / ${drawer?.username ?? ''}`,
      reporter: user.username, reason: reportReason, detail: reportDetail.trim() || reportReason,
    });
    setReportOpen(false);
    setReportDetail('');
    toast(t('toast.reported'), 'success');
  };

  return (
    <div className="game-shell">
      <SeoHead title={`${room.name} · DrawSpace`} />
      <header className="game-topbar">
        <div className="game-top-left">
          <Link to={path('/')} className="game-brand" aria-label="DrawSpace">
            <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden><rect width="32" height="32" rx="7" fill="var(--accent)" /><path d="M9 20c4-8 9-11 14-11-2 5-6 10-11 12l-3 1z" fill="#062a30" /><circle cx="21.5" cy="11.5" r="1.6" fill="#062a30" /></svg>
          </Link>
          <div className="game-room-meta">
            <span className="game-room-name">{room.name}</span>
            <span className="game-round faint">{t('game.roundOf', { current: state.round, total: state.totalRounds })}</span>
          </div>
        </div>

        <div className="game-word-area">
          {state.phase === 'choosing' ? (
            <span className="faint game-choosing-note">
              {engine.isMyTurn ? t('game.chooseWord') : t('game.drawer', { name: drawer?.username ?? '' })}
            </span>
          ) : (
            <>
              <WordDisplay word={state.word} hintIndices={state.hintIndices} showWord={engine.isMyTurn || state.phase !== 'drawing'} />
              {state.word && !engine.isMyTurn && state.phase === 'drawing' && (
                <span className="faint game-letter-count">{t('game.letters', { count: state.word.text.length })}</span>
              )}
            </>
          )}
        </div>

        <div className="game-top-right">
          <div className={`game-timer ${seconds <= 5 && state.phase === 'drawing' ? 'urgent' : ''}`} role="timer" aria-label={`${seconds}s`}>
            <span className="mono game-timer-value">{state.phase === 'finished' ? 0 : seconds}</span>
            <span className="faint game-timer-unit">s</span>
          </div>
          <IconButton label={soundOn ? t('common.soundOn') : t('common.soundOff')} onClick={toggleSound} aria-pressed={soundOn}>
            {soundOn ? <Volume2 size={17} /> : <VolumeX size={17} />}
          </IconButton>
          <IconButton label={t('report.title')} onClick={() => setReportOpen(true)}>
            <Flag size={16} />
          </IconButton>
          <IconButton label={t('common.leave')} onClick={() => setLeaveOpen(true)}>
            <LogOut size={16} />
          </IconButton>
        </div>
      </header>
      <div className="game-timer-bar" aria-hidden>
        <div className="game-timer-fill" style={{ width: `${pct}%` }} />
      </div>

      <main className="game-main">
        <section className="game-canvas-col">
          <div className="game-canvas-frame">
            <DrawingCanvas
              key={state.turnIndex}
              interactive={engine.isMyTurn && state.phase === 'drawing'}
              replayStrokes={state.replayStrokes}
            />

            {state.phase === 'choosing' && (
              <div className="canvas-overlay">
                {engine.isMyTurn ? (
                  <div className="word-choice glass-overlay">
                    <p className="word-choice-title">{t('game.chooseWord')}</p>
                    <div className="word-choice-grid">
                      {state.choices.map((w) => (
                        <button key={w.id} className="word-choice-card" onClick={() => engine.chooseWord(w)}>
                          <span className="word-choice-word">{w.text}</span>
                          <span className="word-choice-meta faint">{w.category} · {t(`common.${w.difficulty}` as 'common.easy')}</span>
                        </button>
                      ))}
                    </div>
                    <div className="word-choice-foot">
                      <span className="mono faint">{seconds}s</span>
                      <Button size="sm" variant="ghost" icon={<RefreshCw size={13} />} onClick={engine.rerollChoices}>
                        {t('game.skipWord')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="word-waiting glass-overlay">
                    <Avatar avatarId={drawer?.avatarId ?? 'av-01'} size={40} />
                    <p className="muted">{t('game.drawer', { name: drawer?.username ?? '' })}</p>
                    <Spinner label={t('common.loading')} />
                  </div>
                )}
              </div>
            )}

            {state.phase === 'reveal' && state.word && (
              <div className="canvas-overlay reveal-overlay">
                <div className="reveal-card glass-overlay">
                  <p className="faint reveal-label">{t('common.word')}</p>
                  <p className="reveal-word">{state.word.text}</p>
                  {state.word.definition && <p className="muted reveal-def">{state.word.definition}</p>}
                  <p className="faint reveal-next mono">{t('game.nextRound')} · {seconds}s</p>
                </div>
              </div>
            )}

            {state.phase === 'drawing' && engine.myGuessed && (
              <div className="guessed-banner" role="status">
                <Badge tone="accent">{t('game.guessedIt')}</Badge>
                <span className="faint">{t('game.waitNext')}</span>
              </div>
            )}
          </div>
        </section>

        <div className="game-side-stack">
          <div className="game-tabs" role="group" aria-label={t('game.panelTabs')}>
            <button
              type="button"
              className={`game-tab ${sideTab === 'chat' ? 'active' : ''}`}
              aria-pressed={sideTab === 'chat'}
              aria-controls="game-panel-chat"
              onClick={() => setSideTab('chat')}
            >
              <MessageCircle size={15} aria-hidden />
              <span>{t('game.chat')}</span>
              {chatUnread > 0 && sideTab !== 'chat' && (
                <span className="game-tab-badge mono">{chatUnread > 99 ? '99+' : chatUnread}</span>
              )}
            </button>
            <button
              type="button"
              className={`game-tab ${sideTab === 'players' ? 'active' : ''}`}
              aria-pressed={sideTab === 'players'}
              aria-controls="game-panel-players"
              onClick={() => setSideTab('players')}
            >
              <Users size={15} aria-hidden />
              <span>{t('game.players')}</span>
              <span className="game-tab-count mono faint">{room.players.length}</span>
            </button>
          </div>

          <aside id="game-panel-players" className={`game-side game-side-players ${sideTab === 'players' ? '' : 'tab-hidden'}`}>
            <PlayerList
              players={room.players} scores={state.scores} guessedIds={state.guessedIds}
              drawerId={state.drawerId} myId={user.id} hostId={room.hostId}
            />
          </aside>

          <aside id="game-panel-chat" className={`game-side game-side-chat ${sideTab === 'chat' ? '' : 'tab-hidden'}`}>
            <ChatPanel
              messages={state.messages}
              onSend={engine.submitGuess}
              disabled={state.phase === 'finished'}
              inputRef={chatInputRef}
              active={sideTab === 'chat'}
              onUnreadChange={setChatUnread}
            />
          </aside>
        </div>
      </main>

      <ConfirmDialog
        open={leaveOpen} onClose={() => setLeaveOpen(false)} onConfirm={leave}
        title={t('common.leave')} body={`${t('common.leave')} ${room.name}?`}
        confirmLabel={t('common.leave')} cancelLabel={t('common.cancel')}
      />

      <Modal open={reportOpen} onClose={() => setReportOpen(false)} title={t('report.title')}
        footer={<>
          <Button variant="ghost" onClick={() => setReportOpen(false)}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={sendReport}>{t('report.submit')}</Button>
        </>}>
        <Field label={t('report.reason')} htmlFor="report-reason">
          <NativeSelect id="report-reason" value={reportReason} onChange={(e) => setReportReason(e.target.value)}>
            <option value="drawing">Drawing</option>
            <option value="chat">Chat</option>
            <option value="username">Username</option>
            <option value="room">Room</option>
          </NativeSelect>
        </Field>
        <Field label={t('report.details')} htmlFor="report-detail">
          <Textarea id="report-detail" value={reportDetail} onChange={(e) => setReportDetail(e.target.value)} placeholder={t('report.placeholder')} />
        </Field>
      </Modal>
    </div>
  );
}
