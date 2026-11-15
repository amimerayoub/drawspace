import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nContext';
import { useAuth } from '@/context/AuthContext';
import { ApiError } from '@/services/apiClient';
import { socketClient } from '@/services/socketClient';
import { SeoHead } from '@/components/SeoHead';
import { AvatarPicker } from '@/components/Avatar';
import { Button, Field, Input, Spinner } from '@/components/ui';

export default function JoinRoom() {
  const { t, path } = useI18n();
  const { user, ready, continueAsGuest } = useAuth();
  const { code: codeParam } = useParams();
  const navigate = useNavigate();
  const [code, setCode] = useState(codeParam?.toUpperCase() ?? '');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [avatarId, setAvatarId] = useState('av-01');
  const [error, setError] = useState('');
  const [needsPassword, setNeedsPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const autoTried = useRef(false);

  const join = async (joinCode: string) => {
    const result = await socketClient.request<{ room: { code: string } }>('room:join', { code: joinCode.trim().toUpperCase(), password: password || undefined });
    navigate(path(`/room/${result.room.code}`));
  };

  useEffect(() => {
    if (!ready || !user || !codeParam || autoTried.current) return;
    autoTried.current = true;
    setBusy(true);
    void join(codeParam)
      .catch((e) => {
        if (e instanceof ApiError && e.code === 'INVALID_PASSWORD') setNeedsPassword(true);
        setError((e as Error).message);
      })
      .finally(() => setBusy(false));
  }, [ready, user?.id, codeParam]);

  if (!ready) return <div className="page"><Spinner /></div>;

  const submit = async () => {
    setError('');
    if (!user && name.trim().length < 3) { setError(t('play.nameError')); return; }
    setBusy(true);
    try {
      if (!user) await continueAsGuest(name.trim(), avatarId);
      await join(code);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'INVALID_PASSWORD') setNeedsPassword(true);
      setError((e as Error).message);
    } finally { setBusy(false); }
  };

  const signInLink = `${path('/sign-in')}${code.trim() ? `?next=${encodeURIComponent(`/join/${code.trim().toUpperCase()}`)}` : ''}`;

  return (
    <div className="page">
      <SeoHead title={`${t('join.title')} · DrawSpace`} />
      <div className="container container-tiny">
        <div className="page-head">
          <h1 className="page-title">{t('join.title')}</h1>
          <p className="page-sub">{codeParam ? t('join.guestSub', { code: codeParam.toUpperCase() }) : t('join.sub')}</p>
        </div>
        <div className="panel panel-pad">
          <form
            className="join-form"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            {codeParam ? (
              <Field label={t('join.code')} htmlFor="join-code">
                <p id="join-code" className="waiting-code-value mono join-code-display">{codeParam.toUpperCase()}</p>
              </Field>
            ) : (
              <Field label={t('join.code')} error={error && !needsPassword ? error : undefined} htmlFor="join-code">
                <Input
                  id="join-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                  placeholder="ABC123"
                  maxLength={6}
                  className="mono join-code-input"
                  autoComplete="off"
                  autoFocus
                />
              </Field>
            )}
            {!user && (
              <>
                <Field label={t('common.username')} error={error && !needsPassword ? error : undefined} htmlFor="join-guest-name">
                  <Input
                    id="join-guest-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t('play.namePlaceholder')}
                    maxLength={16}
                    autoComplete="off"
                  />
                </Field>
                <Field label={t('common.chooseAvatar')}>
                  <AvatarPicker value={avatarId} onChange={setAvatarId} label={t('common.chooseAvatar')} />
                </Field>
              </>
            )}
            {needsPassword && (
              <Field label={t('common.password')} hint={t('join.passwordRequired')} error={error || undefined} htmlFor="join-password">
                <Input id="join-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
              </Field>
            )}
            <Button variant="primary" type="submit" disabled={code.trim().length < 6 || (!user && name.trim().length < 3)} loading={busy} className="join-submit">
              {user ? t('common.joinRoom') : t('common.continueAsGuest')}
            </Button>
            {!user && <p className="faint join-signin"><Link to={signInLink}>{t('join.haveAccount')}</Link></p>}
          </form>
        </div>
      </div>
    </div>
  );
}