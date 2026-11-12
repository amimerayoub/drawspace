import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nContext';
import { useAuth } from '@/context/AuthContext';
import { roomService } from '@/services';
import { SeoHead } from '@/components/SeoHead';
import { Button, Field, Input } from '@/components/ui';

export default function JoinRoom() {
  const { t, path } = useI18n();
  const { user } = useAuth();
  const { code: codeParam } = useParams();
  const navigate = useNavigate();
  const [code, setCode] = useState(codeParam?.toUpperCase() ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [needsPassword, setNeedsPassword] = useState(false);

  useEffect(() => {
    if (code.trim().length === 6) {
      const room = roomService.get(code.trim());
      setNeedsPassword(Boolean(room?.hasPassword));
    } else {
      setNeedsPassword(false);
    }
  }, [code]);

  if (!user) return <Navigate to={path('/play')} replace />;

  const submit = () => {
    setError('');
    try {
      const room = roomService.join(code.trim(), password, user);
      navigate(path(`/room/${room.code}`));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="page">
      <SeoHead title={`${t('join.title')} · DrawSpace`} />
      <div className="container container-tiny">
        <div className="page-head">
          <h1 className="page-title">{t('join.title')}</h1>
          <p className="page-sub">{t('join.sub')}</p>
        </div>
        <div className="panel panel-pad">
          <form
            className="join-form"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
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
            {needsPassword && (
              <Field label={t('common.password')} hint={t('join.passwordRequired')} error={error || undefined} htmlFor="join-password">
                <Input id="join-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
              </Field>
            )}
            <Button variant="primary" type="submit" disabled={code.trim().length < 6} className="join-submit">
              {t('common.joinRoom')}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}