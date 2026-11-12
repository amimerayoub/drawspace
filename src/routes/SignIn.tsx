import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, UserRound } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { useToast } from '@/context/ToastContext';
import { Button } from '@/components/ui';
import { SeoHead } from '@/components/SeoHead';
import { AuthPanel, AuthTextField, AuthPasswordField, AuthError, AuthGuestButton, AuthSwitch } from '@/components/AuthPanel';

export default function SignIn() {
  const { t, path } = useI18n();
  const { signIn } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [identity, setIdentity] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const errs = {
    identity: identity.trim().length === 0 ? t('auth.errIdentity') : '',
    password: password.length < 4 ? t('auth.errPassword4') : '',
  };
  const shown = (k: keyof typeof errs) => (touched[k] ? errs[k] : '');
  const blur = (k: string) => () => setTouched((s) => ({ ...s, [k]: true }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched({ identity: true, password: true });
    setError('');
    if (errs.identity || errs.password) return;
    setBusy(true);
    try {
      const user = await signIn(identity.trim(), password);
      toast(t('auth.welcome', { name: user.username }), 'success');
      const isAdmin = user.role === 'admin' || user.role === 'superadmin' || user.role === 'moderator' || user.role === 'support';
      navigate(isAdmin ? '/admin' : path('/play'));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SeoHead title={t('auth.signInTitle')} description={t('auth.signInSub')} />
      <AuthPanel
        mode="in"
        title={t('auth.signInTitle')}
        sub={t('auth.signInSub')}
        alt={<><AuthGuestButton /><AuthSwitch mode="in" /></>}
      >
        <form className="auth-form" onSubmit={submit} noValidate>
          <AuthTextField
            id="si-id" label={`${t('common.username')} / ${t('common.email')}`} icon={<UserRound size={15} />}
            error={shown('identity')}
            value={identity} onChange={(e) => setIdentity(e.target.value)} onBlur={blur('identity')}
            autoComplete="username" autoFocus
          />
          <AuthPasswordField
            id="si-pw" label={t('auth.password')} hint={t('auth.passwordHint4')} error={shown('password')}
            value={password} onChange={setPassword} onBlur={blur('password')}
            autoComplete="current-password"
          />
          <AuthError message={error} />
          <Button type="submit" variant="primary" size="lg" loading={busy} className="auth-submit">
            {t('auth.signInCta')}
          </Button>
          <p className="auth-demo">
            <KeyRound size={13} aria-hidden />
            <span>{t('auth.demoHint')}</span>
          </p>
        </form>
      </AuthPanel>
    </>
  );
}