import { Link } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nContext';
import { usePlatformConfig } from '@/context/PlatformConfigContext';
import { Logo, LanguageSelect } from './Header';

export function Footer() {
  const { t, path } = useI18n();
  const { config } = usePlatformConfig();
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand">
            <Logo size={26} />
            <p className="muted footer-tagline">{t('landing.footerTagline')}</p>
          </div>
          <nav className="footer-col" aria-label={t('landing.footerProduct')}>
            <p className="footer-head">{t('landing.footerProduct')}</p>
            <Link to={path('/play')}>{t('nav.play')}</Link>
            <Link to={path('/leaderboard')}>{t('nav.leaderboard')}</Link>
            <Link to={path('/challenges')}>{t('nav.challenges')}</Link>
            <Link to={path('/achievements')}>{t('nav.achievements')}</Link>
          </nav>
          <nav className="footer-col" aria-label={t('landing.footerResources')}>
            <p className="footer-head">{t('landing.footerResources')}</p>
            <Link to={path('/blog')}>{t('nav.blog')}</Link>
            <Link to={path('/rules')}>{t('nav.how')}</Link>
            <Link to={path('/sign-up')}>{t('nav.signUp')}</Link>
          </nav>
          <nav className="footer-col" aria-label={t('landing.footerLegal')}>
            <p className="footer-head">{t('landing.footerLegal')}</p>
            <Link to={path('/terms')}>{t('landing.terms')}</Link>
            <Link to={path('/privacy')}>{t('landing.privacy')}</Link>
            <a href={`mailto:${config.contactEmail}`}>{t('landing.contact')}</a>
          </nav>
        </div>
        <div className="footer-base">
          <span className="faint">© {year} {config.siteName}. {t('landing.rights')}</span>
          <div className="footer-lang"><LanguageSelect compact={false} /></div>
        </div>
      </div>
    </footer>
  );
}