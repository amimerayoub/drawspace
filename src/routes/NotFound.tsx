import { Link } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nContext';
import { SeoHead } from '@/components/SeoHead';

export default function NotFound() {
  const { t, path } = useI18n();
  return (
    <div className="page container container-narrow">
      <SeoHead title={`${t('notFound.title')} · DrawSpace`} />
      <div className="notfound">
        <p className="notfound-code mono accent">404</p>
        <h1 className="page-title">{t('notFound.title')}</h1>
        <p className="muted">{t('notFound.sub')}</p>
        <Link to={path('/')} className="btn btn-primary">{t('notFound.home')}</Link>
      </div>
    </div>
  );
}
