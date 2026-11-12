import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { CalendarDays, Pencil, Trophy } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
import { useAuth, fullUser } from '@/context/AuthContext';
import { useDb } from '@/hooks/useDb';
import { useToast } from '@/context/ToastContext';
import { useTheme } from '@/theme/ThemeContext';
import { useSoundToggle } from '@/hooks/useSound';
import { authService, levelForXp, progressionService } from '@/services';
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
  const dbState = useDb();
  const [tab, setTab] = useState('overview');

  const full = user ? fullUser(user.id) : undefined;
  const [name, setName] = useState(full?.username ?? '');
  const [bio, setBio] = useState(full?.bio ?? '');
  const [avatarId, setAvatarId] = useState(full?.avatarId ?? 'av-01');
  const [nameError, setNameError] = useState('');

  if (!user || !full) return <Navigate to={path('/play')} replace />;

  const level = levelForXp(full.xp);
  const title = dbState.titles.find((ti) => ti.id === full.titleId);
  const matches = progressionService.matches(full.id);
  const rewards = progressionService.rewards(full.id).slice(0, 6);
  const achievements = progressionService.achievements();
  const unlocked = achievements.filter((a) => a.unlockedAt).length;
  const winRate = full.stats.matches > 0 ? Math.round((full.stats.wins / full.stats.matches) * 100) : 0;

  const saveProfile = () => {
    const clean = name.trim();
    if (clean.length < 3) { setNameError(t('play.nameError')); return; }
    if (dbState.users.some((u) => u.id !== full.id && u.username.toLowerCase() === clean.toLowerCase())) {
      setNameError('That username is taken.');
      return;
    }
    setNameError('');
    authService.updateUser(full.id, { username: clean, bio: bio.trim(), avatarId });
    refresh();
    toast(t('profile.saved'), 'success');
  };

  const stats: { label: string; value: string | number }[] = [
    { label: t('profile.matches'), value: formatNumber(full.stats.matches) },
    { label: t('profile.wins'), value: formatNumber(full.stats.wins) },
    { label: t('profile.winRate'), value: `${winRate}%` },
    { label: t('profile.correctGuesses'), value: formatNumber(full.stats.correctGuesses) },
    { label: t('profile.wordsDrawn'), value: formatNumber(full.stats.wordsDrawn) },
    { label: t('profile.bestScore'), value: formatNumber(full.stats.bestScore) },
  ];

  return (
    <div className="page">
      <SeoHead title={`${t('profile.title')} · DrawSpace`} />
      <div className="container container-narrow">
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
                <span className="faint mono">{formatNumber(level.into)} / {formatNumber(level.needed)} XP</span>
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
            {matches.length === 0 ? (
              <EmptyState title={t('profile.noMatches')} action={<Link to={path('/lobby')} className="btn btn-primary btn-sm">{t('common.playNow')}</Link>} />
            ) : (
              <div className="panel match-list">
                {matches.map((m) => (
                  <div key={m.id} className="match-row">
                    <span className={`match-place mono ${m.placement === 1 ? 'accent' : 'faint'}`}>#{m.placement}</span>
                    <span className="match-room">{m.roomName}</span>
                    <span className="faint match-meta">{m.players} {t('common.players')} · {m.rounds} {t('common.rounds')}</span>
                    <span className="faint match-date">{formatDate(m.playedAt)}</span>
                    <span className="mono match-score">{m.score}</span>
                    <span className="mono accent match-xp">+{m.xpEarned}</span>
                  </div>
                ))}
              </div>
            )}

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
              <Button variant="primary" onClick={saveProfile}>{t('common.save')}</Button>
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
