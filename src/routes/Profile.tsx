import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { CalendarDays, Pencil, Trophy } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
import { useAuth, fullUser } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useTheme } from '@/theme/ThemeContext';
import { useSoundToggle } from '@/hooks/useSound';
import { authService } from '@/services';
import { useProgression } from '@/hooks/useQueries';
import { matchHistoryService, type MatchHistoryItem, type MatchDetail } from '@/services/matchHistory.service';
import { LOCALES } from '@/i18n/I18nContext';
import { Avatar, AvatarPicker } from '@/components/Avatar';
import { AchievementIcon, TitleIcon } from '@/components/Emblems';
import { Badge, Button, EmptyState, Field, GlassSelect, Input, Progress, Switch, Tabs, Textarea } from '@/components/ui';
import { SeoHead } from '@/components/SeoHead';

export default function Profile() {
  const { t, path, locale, formatDate, formatNumber } = useI18n();
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const [soundOn, setSoundOn] = useSoundToggle();
  const [tab, setTab] = useState('overview');
  const { data: progression, error: progressionLoadError } = useProgression(user?.id);
  const progressionError = progressionLoadError instanceof Error ? progressionLoadError.message : progressionLoadError ? 'Profile progression could not be loaded.' : '';
  const [matches, setMatches] = useState<MatchHistoryItem[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(true);
  const [matchesError, setMatchesError] = useState('');
  const [selectedMatch, setSelectedMatch] = useState<MatchDetail | null>(null);
  const [matchDetailError, setMatchDetailError] = useState('');
  useEffect(() => { if (!user) return; setMatchesLoading(true); void matchHistoryService.mine().then(setMatches).catch((e: unknown) => setMatchesError(e instanceof Error ? e.message : 'Match history could not be loaded.')).finally(() => setMatchesLoading(false)); }, [user?.id]);

  const full = user ? fullUser(user.id) : undefined;
  const [name, setName] = useState(full?.username ?? '');
  const [bio, setBio] = useState(full?.bio ?? '');
  const [avatarId, setAvatarId] = useState(full?.avatarId ?? 'av-01');
  const [nameError, setNameError] = useState('');
  const [saving, setSaving] = useState(false);

  if (!user || !full) return <Navigate to={path('/play')} replace />;

  const level = progression?.progression || { level: full.level, totalXP: full.xp, into: 0, needed: 100, equippedTitleId: full.titleId };
  const title = progression?.titles.find((ti) => ti.id === progression?.progression.equippedTitleId);
  const rewards = progression?.rewards.slice(0, 6) || [];
  const achievements = progression?.achievements || [];
  const unlocked = achievements.filter((a) => a.unlockedAt).length;
  const totalGames = progression?.statistics.totalGames ?? full.stats.matches;
  const wins = progression?.statistics.gamesWon ?? full.stats.wins;
  const correctGuesses = progression?.statistics.correctGuesses ?? full.stats.correctGuesses;
  const totalPoints = progression?.statistics.totalPoints ?? full.stats.totalScore;
  const winRate = progression?.statistics.winRate ?? (totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0);

  const saveProfile = async () => {
    const clean = name.trim();
    if (clean.length < 3) { setNameError(t('play.nameError')); return; }
    setNameError('');
    setSaving(true);
    try {
      await authService.updateProfile(full.id, { username: clean, bio: bio.trim(), avatarId });
      await refresh();
      toast(t('profile.saved'), 'success');
    } catch (error) {
      setNameError(error instanceof Error ? error.message : 'Profile could not be saved.');
    } finally { setSaving(false); }
  };

  const stats: { label: string; value: string | number }[] = [
    { label: t('profile.matches'), value: formatNumber(totalGames) },
    { label: t('profile.wins'), value: formatNumber(wins) },
    { label: t('profile.winRate'), value: `${winRate}%` },
    { label: t('profile.correctGuesses'), value: formatNumber(correctGuesses) },
    { label: t('profile.wordsDrawn'), value: '—' },
    { label: t('profile.bestScore'), value: '—' },
  ];

  return (
    <div className="page">
      <SeoHead title={`${t('profile.title')} · DrawSpace`} description={t('seo.profile')} noindex />
      <div className="container container-narrow">
        {progressionError && <p role="alert" className="muted">{progressionError}</p>}
        <div className="panel panel-pad profile-card">
          <Avatar avatarId={full.avatarId} size={72} />
          <div className="profile-id">
            <div className="profile-name-row">
              <h1 className="profile-name">{full.username}</h1>
              {title && <Badge tone="accent"><TitleIcon title={title} size={16} />{title.name}</Badge>}
              {user.isGuest && <Badge>{t('common.guest')}</Badge>}
            </div>
            <p className="faint profile-since">
              <CalendarDays size={12} aria-hidden /> {t('profile.memberSince', { date: formatDate(full.createdAt) })}
            </p>
            {full.bio && <p className="muted profile-bio">{full.bio}</p>}
            <div className="profile-level">
              <div className="profile-level-meta">
                <span className="profile-level-badge mono">{t('common.level')} {level.level}</span>
                <span className="faint mono">{formatNumber(level.into)} / {formatNumber(level.needed)} XP · {formatNumber(level.totalXP)} XP total</span>
              </div>
              <Progress value={level.into} max={level.needed} label={t('common.xp')} />
            </div>
          </div>
          <div className="profile-side">
            <Button size="sm" icon={<Pencil size={13} />} onClick={() => setTab('edit')}>{t('profile.editProfile')}</Button>
            <Link to={path('/achievements')} className="profile-ach-link faint">
              <Trophy size={13} aria-hidden /> {unlocked} {t('common.achievements').toLowerCase()}
            </Link>
          </div>
        </div>

        {user.isGuest && (
          <p className="profile-guest-note">
            {t('profile.guestNotice')} <Link to={path('/sign-up')}>{t('auth.signUpCta')}</Link>
          </p>
        )}

        <Tabs
          label={t('profile.title')}
          active={tab}
          onChange={setTab}
          tabs={[
            { id: 'overview', label: t('common.statistics') },
            { id: 'edit', label: t('profile.editProfile') },
            { id: 'prefs', label: t('common.preferences') },
          ]}
        />

        {tab === 'overview' && (
          <div className="profile-section">
            <div className="stat-grid">
              {stats.map((s) => (
                <div key={s.label} className="stat-cell">
                  <span className="stat-value mono">{s.value}</span>
                  <span className="stat-label faint">{s.label}</span>
                </div>
              ))}
            </div>

            <div className="profile-ach-strip">
              <div className="profile-ach-head">
                <h2 className="section-title">{t('common.achievements')}</h2>
                <Link to={path('/achievements')} className="text-link mono">{unlocked} / {achievements.length}</Link>
              </div>
              <div className="profile-ach-row">
                {achievements.map((a) => (
                  <Link key={a.id} to={path('/achievements')} className="profile-ach-item" title={a.name} aria-label={a.name}>
                    <AchievementIcon achievement={a} size={40} unlocked={Boolean(a.unlockedAt)} />
                  </Link>
                ))}
              </div>
            </div>

            <h2 className="section-title">{t('common.matchHistory')}</h2>
            {matchesLoading ? <p className="faint" role="status">Loading match history…</p> : matchesError ? <div className="panel" role="alert"><p>{matchesError}</p><Button onClick={() => { setMatchesError(''); setMatchesLoading(true); void matchHistoryService.mine().then(setMatches).catch((e: unknown) => setMatchesError(e instanceof Error ? e.message : 'Match history could not be loaded.')).finally(() => setMatchesLoading(false)); }}>Retry</Button></div> : matches.length === 0 ? <EmptyState title="No completed matches yet" body="Your completed matches will appear here." action={<Link to={path('/lobby')} className="btn btn-primary btn-sm">{t('common.playNow')}</Link>} /> : <div className="panel reward-list">{matches.map((match) => <button key={match.matchId} type="button" className="reward-row" onClick={() => { setMatchDetailError(''); void matchHistoryService.detail(match.matchId).then(setSelectedMatch).catch((e: unknown) => setMatchDetailError(e instanceof Error ? e.message : 'Match details could not be loaded.')); }}><span className="reward-label">{match.roomName} · {match.isWinner ? 'Winner' : `#${match.placement}`}</span><span className="faint reward-date">{formatDate(match.completedAt)}</span><span className="mono accent">{formatNumber(match.score)}</span></button>)}</div>}
            {matchDetailError && <p role="alert" className="faint">{matchDetailError}</p>}
            {selectedMatch && <div className="panel" style={{ padding: 16, marginTop: 12 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><h3>{selectedMatch.roomName}</h3><Button onClick={() => setSelectedMatch(null)}>Close</Button></div><p className="faint">{formatDate(selectedMatch.completedAt)} · {Math.floor(selectedMatch.durationSeconds / 60)} min · {selectedMatch.players.length} players</p>{selectedMatch.players.map((player) => <p key={`${player.username}-${player.placement}`}>{player.placement}. {player.username} — {formatNumber(player.score)}{player.isWinner ? ' · Winner' : ''}</p>)}</div>}

            <h2 className="section-title">{t('common.rewardHistory')}</h2>
            {rewards.length === 0 ? (
              <p className="faint">{t('profile.noRewards')}</p>
            ) : (
              <div className="panel reward-list">
                {rewards.map((r) => (
                  <div key={r.id} className="reward-row">
                    <span className="reward-label">{r.label}</span>
                    <span className="faint reward-date">{formatDate(r.at)}</span>
                    <span className="mono accent">+{r.xp} XP</span>
                  </div>
                ))}
              </div>
            )}
            <p className="profile-more">
              <Link to={path('/challenges')}>{t('common.challenges')}</Link>
              <Link to={path('/achievements')}>{t('common.achievements')}</Link>
              <Link to={path('/leaderboard')}>{t('nav.leaderboard')}</Link>
            </p>
          </div>
        )}

        {tab === 'edit' && (
          <div className="panel panel-pad profile-section">
            <Field label={t('common.username')} htmlFor="pf-name" error={nameError}>
              <Input id="pf-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={20} />
            </Field>
            <Field label={t('common.bio')} htmlFor="pf-bio" hint={`${bio.length}/140`}>
              <Textarea id="pf-bio" value={bio} onChange={(e) => setBio(e.target.value.slice(0, 140))} rows={3} />
            </Field>
            <Field label={t('common.chooseAvatar')}>
              <AvatarPicker value={avatarId} onChange={setAvatarId} label={t('common.chooseAvatar')} />
            </Field>
            <div className="form-actions">
              <Button variant="primary" onClick={() => void saveProfile()} loading={saving}>{t('common.save')}</Button>
            </div>
          </div>
        )}

        {tab === 'prefs' && (
          <div className="panel panel-pad profile-section">
            <h2 className="prefs-title">{t('profile.interface')}</h2>
            <div className="prefs-row">
              <span className="switch-label">{t('profile.theme')}</span>
              <GlassSelect
                label={t('profile.theme')}
                value={theme}
                onChange={(v) => setTheme(v as 'dark' | 'light')}
                options={[
                  { value: 'dark', label: t('common.darkMode') },
                  { value: 'light', label: t('common.lightMode') },
                ]}
                compact
              />
            </div>
            <div className="prefs-row">
              <span className="switch-label">{t('profile.language')}</span>
              <GlassSelect
                label={t('profile.language')}
                value={locale}
                onChange={(v) => navigate(`/${v}/profile`)}
                options={LOCALES.map((l) => ({ value: l.code, label: l.label }))}
                compact
              />
            </div>
            <Switch checked={soundOn} onChange={setSoundOn} label={t('profile.sound')} description={t('profile.soundDesc')} />
            <div className="prefs-note">
              <span className="switch-label">{t('profile.reducedMotion')}</span>
              <span className="faint">{t('profile.reducedMotionDesc')}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
