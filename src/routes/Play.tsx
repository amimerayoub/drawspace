import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, KeyRound, Plus, Users } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
import { useAuth } from '@/context/AuthContext';
import { SeoHead } from '@/components/SeoHead';
import { Avatar, AvatarPicker } from '@/components/Avatar';
import { Button, Field, Input } from '@/components/ui';

export default function Play() {
  const { t, path } = useI18n();
  const { user, continueAsGuest } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [avatarId, setAvatarId] = useState('av-01');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const start = async () => {
    if (name.trim().length < 3) {
      setError(t('play.nameError'));
      return;
    }
    setError('');
    setBusy(true);
    try { await continueAsGuest(name.trim(), avatarId); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };

  return (
    <div className="page">
      <SeoHead title={`${t('play.title')} · DrawSpace`} description={t('play.sub')} />
      <div className="container container-narrow">
        <div className="page-head">
          <h1 className="page-title">{t('play.title')}</h1>
          <p className="page-sub">{t('play.sub')}</p>
        </div>

        {user ? (
          <div className="panel panel-pad identity-row">
            <Avatar avatarId={user.avatarId} size={44} />
            <div className="identity-text">
              <p className="identity-name">{user.username}</p>
              <p className="faint identity-role">{user.isGuest ? t('common.guest') : t('common.player')}</p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => navigate(path('/profile'))}>{t('common.edit')}</Button>
          </div>
        ) : (
          <div className="panel panel-pad guest-form">
            <Field label={t('common.username')} error={error} htmlFor="guest-name">
              <Input
                id="guest-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('play.namePlaceholder')}
                maxLength={20}
                autoComplete="off"
                onKeyDown={(e) => e.key === 'Enter' && start()}
              />
            </Field>
            <Field label={t('common.chooseAvatar')}>
              <AvatarPicker value={avatarId} onChange={setAvatarId} label={t('common.chooseAvatar')} />
            </Field>
            <Button variant="primary" onClick={() => void start()} loading={busy} className="guest-continue">{t('common.continue')}</Button>
          </div>
        )}

        <div className="play-actions">
          <Link to={path('/create')} className={`mode play-action ${!user ? 'disabled' : ''}`} onClick={(e) => !user && e.preventDefault()} aria-disabled={!user}>
            <Plus size={20} className="mode-icon" aria-hidden />
            <div className="mode-text">
              <h2 className="mode-title">{t('play.createTitle')}</h2>
              <p className="muted">{t('play.createBody')}</p>
            </div>
            <ArrowRight size={16} className="mode-arrow" aria-hidden />
          </Link>
          <Link to={path('/lobby')} className={`mode play-action ${!user ? 'disabled' : ''}`} onClick={(e) => !user && e.preventDefault()} aria-disabled={!user}>
            <Users size={20} className="mode-icon" aria-hidden />
            <div className="mode-text">
              <h2 className="mode-title">{t('play.joinPublicTitle')}</h2>
              <p className="muted">{t('play.joinPublicBody')}</p>
            </div>
            <ArrowRight size={16} className="mode-arrow" aria-hidden />
          </Link>
          <div className={`mode play-action play-code ${!user ? 'disabled' : ''}`}>
            <KeyRound size={20} className="mode-icon" aria-hidden />
            <div className="mode-text">
              <h2 className="mode-title">{t('play.joinCodeTitle')}</h2>
              <p className="muted">{t('play.joinCodeBody')}</p>
            </div>
            <form
              className="play-code-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (user && code.trim()) navigate(path(`/join/${code.trim().toUpperCase()}`));
              }}
            >
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ABC123"
                maxLength={6}
                className="mono play-code-input"
                aria-label={t('join.code')}
                disabled={!user}
              />
              <Button variant="primary" size="sm" type="submit" disabled={!user || code.trim().length < 6}>{t('common.join')}</Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
