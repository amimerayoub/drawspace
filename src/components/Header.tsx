import { useEffect, useId, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Globe, Menu, Moon, Sun, X, LogOut, User as UserIcon, Trophy, Target, Shield, ChevronDown, Check } from 'lucide-react';
import { useI18n, LOCALES } from '@/i18n/I18nContext';
import { useTheme } from '@/theme/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { usePlatformConfig } from '@/context/PlatformConfigContext';
import { Avatar } from './Avatar';
import { ResponsiveImage } from './ResponsiveImage';
import { BRAND } from '@/data/assets';
import type { Locale } from '@/types';

/* One live lockup for both themes. The transparent icon carries its own
   black/white contrast so it reads on light and dark surfaces, and the
   wordmark follows the theme text color instead of a baked-in raster. */
export function Logo({ size = 26 }: { size?: number }) {
  const { config } = usePlatformConfig();
  return (
    <span className="logo">
      <ResponsiveImage className="logo-mark" src={config.logoUrl || BRAND.icon} alt="" width={size} height={size} eager />
      <span className="logo-sep" aria-hidden />
      <span className="logo-word">{config.siteName}</span>
    </span>
  );
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const { t } = useI18n();
  return (
    <button className="icon-btn" onClick={toggle} aria-label={theme === 'dark' ? t('common.lightMode') : t('common.darkMode')} title={theme === 'dark' ? t('common.lightMode') : t('common.darkMode')}>
      {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}

export function LanguageSelect({ compact = true }: { compact?: boolean }) {
  const { locale, t } = useI18n();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const current = LOCALES.find((l) => l.code === locale) ?? LOCALES[0];

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => {
    if (open) {
      setActive(Math.max(0, LOCALES.findIndex((l) => l.code === locale)));
      listRef.current?.focus();
    }
  }, [open, locale]);

  const commit = (code: Locale) => {
    setOpen(false);
    const rest = pathname.replace(/^\/[^/]+/, '') || '/';
    navigate(`/${code}${rest === '/' ? '' : rest}`);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, LOCALES.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); commit(LOCALES[active].code); }
    if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    if (e.key === 'End') { e.preventDefault(); setActive(LOCALES.length - 1); }
  };

  return (
    <div className={`lang-select ${compact ? 'lang-compact' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="lang-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={t('common.language')}
        onClick={() => setOpen((o) => !o)}
      >
        <Globe size={15} aria-hidden className="lang-icon" />
        <span className="lang-value">{current.label}</span>
        <ChevronDown size={14} aria-hidden className={`lang-chevron ${open ? 'open' : ''}`} />
      </button>
      {open && (
        <ul
          id={listId}
          className="lang-menu"
          role="listbox"
          aria-label={t('common.language')}
          tabIndex={-1}
          ref={listRef}
          onKeyDown={onKey}
        >
          {LOCALES.map((l, i) => (
            <li key={l.code} role="option" aria-selected={l.code === locale}>
              <button
                type="button"
                className={`lang-option ${i === active ? 'active' : ''} ${l.code === locale ? 'selected' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => commit(l.code)}
              >
                <span className="lang-option-label">{l.label}</span>
                <span className="lang-code">{l.code.split('-')[0].toUpperCase()}</span>
                <span className="lang-check">{l.code === locale && <Check size={14} className="accent" aria-hidden />}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Header() {
  const { t, path } = useI18n();
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const userRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const burgerRef = useRef<HTMLButtonElement>(null);
  const isAdmin = user && ['admin', 'superadmin', 'moderator', 'support'].includes(user.role);

  useEffect(() => {
    setMobileOpen(false);
    setUserMenu(false);
  }, [pathname]);

  useEffect(() => {
    if (!userMenu) return;
    const onDoc = (e: MouseEvent) => {
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserMenu(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [userMenu]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileOpen(false);
        burgerRef.current?.focus();
      }
    };
    const onDoc = (e: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) setMobileOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDoc);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDoc);
    };
  }, [mobileOpen]);

  const links = [
    { to: path('/'), label: t('nav.home'), end: true },
    { to: path('/play'), label: t('nav.play'), end: false },
    { to: path('/leaderboard'), label: t('nav.leaderboard'), end: false },
    { to: path('/blog'), label: t('nav.blog'), end: false },
    { to: path('/rules'), label: t('nav.how'), end: false },
  ];

  const signOutAndClose = () => {
    signOut();
    setMobileOpen(false);
    setUserMenu(false);
    toast(t('auth.signOutDone'));
    navigate(path('/'));
  };

  return (
    <header className="site-header" ref={headerRef}>
      <div className="header-float">
        <div className="header-pill">
          <Link to={path('/')} className="header-logo" aria-label="DrawSpace home">
            <Logo />
          </Link>

          <nav className="header-nav" aria-label="Primary">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => `header-link ${isActive ? 'active' : ''}`}>
                {l.label}
              </NavLink>
            ))}
          </nav>

          <span className="header-divider" aria-hidden />

          <div className="header-actions">
            <span className="header-theme"><ThemeToggle /></span>
            <div className="header-lang"><LanguageSelect /></div>
            {user ? (
              <div className="user-menu" ref={userRef}>
                <button className="user-trigger" onClick={() => setUserMenu((o) => !o)} aria-expanded={userMenu} aria-haspopup="menu" aria-label={user.username}>
                  <Avatar avatarId={user.avatarId} size={30} />
                  <span className="user-name">{user.username}</span>
                  <ChevronDown size={14} aria-hidden className="user-chevron" />
                </button>
                {userMenu && (
                  <div className="glass-menu user-dropdown" role="menu">
                    <Link role="menuitem" to={path('/profile')} className="glass-menu-item" onClick={() => setUserMenu(false)}>
                      <UserIcon size={15} /> {t('nav.profile')}
                    </Link>
                    <Link role="menuitem" to={path('/achievements')} className="glass-menu-item" onClick={() => setUserMenu(false)}>
                      <Trophy size={15} /> {t('nav.achievements')}
                    </Link>
                    <Link role="menuitem" to={path('/challenges')} className="glass-menu-item" onClick={() => setUserMenu(false)}>
                      <Target size={15} /> {t('nav.challenges')}
                    </Link>
                    {isAdmin && (
                      <Link role="menuitem" to="/admin" className="glass-menu-item" onClick={() => setUserMenu(false)}>
                        <Shield size={15} /> {t('nav.admin')}
                      </Link>
                    )}
                    <div className="menu-divider" />
                    <button role="menuitem" className="glass-menu-item" onClick={signOutAndClose}>
                      <LogOut size={15} /> {t('nav.signOut')}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <Link to={path('/sign-in')} className="header-link header-signin">{t('nav.signIn')}</Link>
                <Link to={path('/play')} className="btn btn-primary btn-sm header-cta">{t('common.playNow')}</Link>
              </>
            )}
            <button
              ref={burgerRef}
              className="icon-btn header-burger"
              onClick={() => setMobileOpen((o) => !o)}
              aria-label={mobileOpen ? t('nav.close') : t('nav.menu')}
              aria-expanded={mobileOpen}
              aria-controls="mobile-nav"
            >
              {mobileOpen ? <X size={19} /> : <Menu size={19} />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="mobile-menu" id="mobile-nav">
            <nav className="mobile-nav" aria-label="Mobile">
              {links.map((l) => (
                <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => `mobile-link ${isActive ? 'active' : ''}`}>
                  {l.label}
                </NavLink>
              ))}
              {user ? (
                <>
                  <Link to={path('/profile')} className="mobile-link">{t('nav.profile')}</Link>
                  <Link to={path('/achievements')} className="mobile-link">{t('nav.achievements')}</Link>
                  <Link to={path('/challenges')} className="mobile-link">{t('nav.challenges')}</Link>
                  {isAdmin && <Link to="/admin" className="mobile-link">{t('nav.admin')}</Link>}
                  <button className="mobile-link" onClick={signOutAndClose}>
                    {t('nav.signOut')}
                  </button>
                </>
              ) : (
                <Link to={path('/sign-in')} className="mobile-link">{t('nav.signIn')}</Link>
              )}
            </nav>
            <div className="mobile-menu-foot">
              <LanguageSelect compact={false} />
              <ThemeToggle />
            </div>
          </div>
        )}
      </div>
    </header>
  );
}