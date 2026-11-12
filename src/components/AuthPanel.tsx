import { useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { AlertCircle, Eye, EyeOff, History, Lock, Sparkles, Trophy, UserRound } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
import { BRAND } from '@/data/assets';
import { Field, Input } from './ui';

export function AuthPanel({ mode, title, sub, children, alt }: {
  mode: 'in' | 'up';
  title: string;
  sub: string;
  children: ReactNode;
  alt: ReactNode;
}) {
  const { t, path } = useI18n();
  return (
    <div className="auth-page">
      <section className="auth-dialog" aria-label={title}>
        <div className="auth-dialog-head">
          <span className="auth-mark" aria-hidden>
            <img src={BRAND.icon} alt="" width={30} height={30} />
          </span>
          <div className="auth-head-text">
            <h1 className="auth-title">{title}</h1>
            <p className="auth-sub">{sub}</p>
          </div>
        </div>

        <div className="auth-modes" role="group" aria-label={t('auth.modeLabel')}>
          <NavLink to={path('/sign-in')} className={({ isActive }) => `auth-mode ${isActive ? 'active' : ''}`}>
            {t('auth.signInCta')}
          </NavLink>
          <NavLink to={path('/sign-up')} className={({ isActive }) => `auth-mode ${isActive ? 'active' : ''}`}>
            {t('auth.signUpCta')}
          </NavLink>
        </div>

        {mode === 'up' && (
          <ul className="auth-perks">
            <li><Sparkles size={13} aria-hidden /> {t('auth.perkXp')}</li>
            <li><Trophy size={13} aria-hidden /> {t('auth.perkTitles')}</li>
            <li><History size={13} aria-hidden /> {t('auth.perkHistory')}</li>
          </ul>
        )}

        {children}

        <div className="auth-alt">
          <span className="auth-or" aria-hidden><span>{t('auth.or')}</span></span>
          {alt}
        </div>
      </section>
    </div>
  );
}

export function AuthError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p className="auth-error" role="alert">
      <AlertCircle size={15} aria-hidden />
      <span>{message}</span>
    </p>
  );
}

interface AuthTextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
  icon: ReactNode;
}

export function AuthTextField({ label, hint, error, icon, id, ...rest }: AuthTextFieldProps) {
  return (
    <Field label={label} htmlFor={id} hint={hint} error={error} required>
      <span className="auth-input">
        <span className="auth-input-icon" aria-hidden>{icon}</span>
        <Input id={id} className="auth-input-control" aria-invalid={error ? true : undefined} {...rest} />
      </span>
    </Field>
  );
}

function strengthScore(pw: string): number {
  if (pw.length < 8) return pw.length === 0 ? 0 : 1;
  let s = 1;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(4, s);
}

export function AuthPasswordField({ id, label, hint, error, value, onChange, onBlur, autoComplete, meter }: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  autoComplete: string;
  meter?: boolean;
}) {
  const { t } = useI18n();
  const [show, setShow] = useState(false);
  const score = strengthScore(value);
  const level = score <= 2 ? t('auth.strengthWeak') : score === 3 ? t('auth.strengthFair') : t('auth.strengthStrong');
  return (
    <Field label={label} htmlFor={id} hint={hint} error={error} required>
      <span className="auth-input">
        <span className="auth-input-icon" aria-hidden><Lock size={15} /></span>
        <Input
          id={id}
          className="auth-input-control auth-input-pw"
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          autoComplete={autoComplete}
          aria-invalid={error ? true : undefined}
        />
        <button
          type="button"
          className="auth-pw-toggle"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? t('auth.hidePassword') : t('auth.showPassword')}
          aria-pressed={show}
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </span>
      {meter && value.length > 0 && (
        <span className="pw-meter">
          <span className="pw-meter-bars" aria-hidden>
            {[1, 2, 3, 4].map((i) => <span key={i} className={`pw-meter-bar ${i <= score ? 'on' : ''}`} />)}
          </span>
          <span className="pw-meter-label" aria-live="polite">{t('auth.strength')}: {level}</span>
        </span>
      )}
    </Field>
  );
}

export function AuthGuestButton() {
  const { t, path } = useI18n();
  return (
    <Link to={path('/play')} className="btn btn-secondary btn-lg auth-guest">
      <UserRound size={16} aria-hidden />
      {t('auth.guestButton')}
    </Link>
  );
}

export function AuthSwitch({ mode }: { mode: 'in' | 'up' }) {
  const { t, path } = useI18n();
  return (
    <p className="auth-switch muted">
      {mode === 'up' ? t('auth.haveAccount') : t('auth.noAccount')}{' '}
      <Link to={path(mode === 'up' ? '/sign-in' : '/sign-up')}>
        {mode === 'up' ? t('auth.signInCta') : t('auth.signUpCta')}
      </Link>
    </p>
  );
}