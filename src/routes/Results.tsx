import { useMemo } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, RotateCcw } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
import { useAuth, fullUser } from '@/context/AuthContext';
import { useDb } from '@/hooks/useDb';
import { useToast } from '@/context/ToastContext';
import { levelForXp, roomService } from '@/services';
import type { MatchResults } from '@/game/useGameEngine';
import { Avatar } from '@/components/Avatar';
import { AchievementIcon, Emblem } from '@/components/Emblems';
import { REWARD_IMAGES } from '@/data/assets';
import { Badge, Button, EmptyState, Progress } from '@/components/ui';
import { SeoHead } from '@/components/SeoHead';

export default function Results() {
  const { t, path, formatDate } = useI18n();
  const { user } = useAuth();
  const { code } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const dbState = useDb();

  const results = useMemo<MatchResults | null>(() => {
    try {
      const raw = sessionStorage.getItem(`drawspace:results:${code?.toUpperCase()}`);
      return raw ? (JSON.parse(raw) as MatchResults) : null;
    } catch {
      return null;
    }
  }, [code]);

  if (!user) return <Navigate to={path('/play')} replace />;
  if (!results) {
    return (
      <div className="page container container-narrow">
        <EmptyState
          title={t('common.results')}
          body={t('join.notFound')}
          action={<Link to={path('/lobby')} className="btn btn-primary btn-sm">{t('results.backToLobby')}</Link>}
        />
      </div>
    );
  }

  const winner = results.standings[0];
  const full = fullUser(user.id);
  const level = full ? levelForXp(full.xp) : null;
  const room = dbState.rooms.find((r) => r.code === results.code);
  const winEmblem = dbState.achievements.find((a) => a.id === 'a-win1');

  const playAgain = () => {
    if (!room) { navigate(path('/lobby')); return; }
    const fresh = roomService.create({ ...room.settings, name: room.name }, user);
    toast(t('create.created'), 'success');
    navigate(path(`/room/${fresh.code}`));
  };

  return (
    <div className="page">
      <SeoHead title={`${t('results.title')} · DrawSpace`} />
      <div className="container container-narrow">
        <div className="page-head results-head">
          <h1 className="page-title">{t('results.title')}</h1>
          <p className="page-sub">{results.roomName} · {formatDate(new Date().toISOString())}</p>
        </div>

        <div className="panel panel-pad results-winner">
          {winEmblem && <AchievementIcon achievement={winEmblem} size={44} className="results-winner-emblem" />}
          <div>
            <p className="results-winner-name">{t('results.winner', { name: winner.username })}</p>
            <p className="faint">{winner.score} {t('common.score').toLowerCase()} · {results.rounds} {t('common.rounds')}</p>
          </div>
          <Avatar avatarId={winner.avatarId} size={44} />
        </div>

        <div className="panel results-standings">
          {results.standings.map((p) => (
            <div key={p.id} className={`results-row ${p.id === user.id ? 'me' : ''} ${p.place === 1 ? 'first' : ''}`}>
              <span className={`results-place mono ${p.place <= 3 ? 'top' : 'faint'}`}>{p.place}</span>
              <Avatar avatarId={p.avatarId} size={32} />
              <span className="results-name">
                {p.username}
                {p.id === user.id && <span className="faint"> ({t('leaderboard.you')})</span>}
                {p.isBot && <span className="faint"> bot</span>}
              </span>
              <span className="mono results-score">{p.score}</span>
            </div>
          ))}
        </div>

        <div className="panel panel-pad results-xp">
          <div className="results-xp-head">
            <Emblem src={REWARD_IMAGES.xp} size={28} className="results-xp-emblem" />
            <span className="results-xp-value accent">+{results.xpEarned} XP</span>
            <span className="muted">{t('results.xpEarned')}</span>
          </div>
          {full && level && (
            <>
              <div className="results-xp-meta faint">
                <span>{t('common.level')} {level.level}</span>
                <span className="mono">{level.into} / {level.needed} XP</span>
              </div>
              <Progress value={level.into} max={level.needed} label={t('common.xp')} />
            </>
          )}
          <p className="faint results-xp-detail">
            {results.correctCount} {t('profile.correctGuesses').toLowerCase()} · {results.turnsDrawn} {t('profile.wordsDrawn').toLowerCase()}
          </p>
        </div>

        {user.isGuest && (
          <div className="panel panel-pad results-invite">
            <p className="results-invite-title">{t('results.inviteTitle')}</p>
            <p className="muted">{t('results.inviteBody')}</p>
            <div className="results-invite-actions">
              <Button variant="primary" onClick={() => navigate(path('/sign-up'))}>{t('auth.signUpCta')}</Button>
              <Button onClick={() => navigate(path('/sign-in'))}>{t('auth.signInCta')}</Button>
              <Button variant="ghost" onClick={() => navigate(path('/lobby'))}>{t('common.continueAsGuest')}</Button>
            </div>
          </div>
        )}

        <div className="section">
          <h2 className="section-title">{t('results.wordsFromMatch')}</h2>
          <div className="panel results-words">
            {results.words.map((w) => (
              <div key={w.id} className="results-word">
                <div className="results-word-head">
                  <span className="results-word-text mono">{w.text}</span>
                  <Badge tone="outline">{t(`common.${w.difficulty}` as 'common.easy')}</Badge>
                </div>
                {w.definition && <p className="muted results-word-def">{w.definition}</p>}
              </div>
            ))}
          </div>
        </div>

        <div className="results-actions">
          <Button variant="primary" size="lg" icon={<RotateCcw size={16} />} onClick={playAgain}>{t('results.playAgain')}</Button>
          <Button variant="ghost" size="lg" icon={<ArrowRight size={16} />} onClick={() => navigate(path('/lobby'))}>
            {t('results.backToLobby')}
          </Button>
        </div>
      </div>
    </div>
  );
}
