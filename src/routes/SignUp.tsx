import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, UserRound } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { useToast } from '@/context/ToastContext';
import { usePlatformConfig } from '@/context/PlatformConfigContext';
import { Button } from '@/components/ui';
import { SeoHead } from '@/components/SeoHead';
import { AuthPanel, AuthTextField, AuthPasswordField, AuthError, AuthGuestButton, AuthSwitch } from '@/components/AuthPanel';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function SignUp() {
  const { t, path } = useI18n();
  const { signUp } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { config } = usePlatformConfig();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const errs = {
    username: username.trim().length < 3 ? t('auth.errUsername') : '',
    email: !EMAIL_RE.test(email.trim()) ? t('auth.errEmail') : '',
    password: password.length < 8 ? t('auth.errPassword') : '',
  };
  const shown = (k: keyof typeof errs) => (touched[k] ? errs[k] : '');
  const blur = (k: string) => () => setTouched((s) => ({ ...s, [k]: true }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!config.registrationOpen) return;
    setTouched({ username: true, email: true, password: true });
    setError('');
    if (errs.username || errs.email || errs.password) return;
    setBusy(true);
    try {
      const user = await signUp(username.trim(), email.trim(), password);
      toast(t('auth.created', { name: user.username }), 'success');
      navigate(path('/play'));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SeoHead title={t('auth.signUpTitle')} description={t('auth.signUpSub')} />
      <AuthPanel
        mode="up"
        title={t('auth.signUpTitle')}
        sub={t('auth.signUpSub')}
        alt={<><AuthGuestButton /><AuthSwitch mode="up" /></>}
      >
        {config.registrationOpen ? (
        <form className="auth-form" onSubmit={submit} noValidate>
          <AuthTextField
            id="su-name" label={t('common.username')} icon={<UserRound size={15} />}
            hint={t('auth.usernameHint')} error={shown('username')}
            value={username} onChange={(e) => setUsername(e.target.value)} onBlur={blur('username')}
            autoComplete="username" maxLength={20} autoFocus
          />
          <AuthTextField
            id="su-email" label={t('common.email')} icon={<Mail size={15} />}
            error={shown('email')} type="email"
            value={email} onChange={(e) => setEmail(e.target.value)} onBlur={blur('email')}
            autoComplete="email"
          />
          <AuthPasswordField
            id="su-pw" label={t('auth.password')} hint={t('auth.passwordHint')} error={shown('password')}
            value={password} onChange={setPassword} onBlur={blur('password')}
            autoComplete="new-password" meter
          />
          <AuthError message={error} />
          <Button type="submit" variant="primary" size="lg" loading={busy} className="auth-submit">
            {t('auth.signUpCta')}
          </Button>
        </form>
        ) : (
          <p className="muted" role="status">Registration is currently closed. Please check back later.</p>
        )}
      </AuthPanel>
    </>
  );
}