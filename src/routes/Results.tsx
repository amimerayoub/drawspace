import { Link, Navigate, useParams } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nContext';
import { useAuth } from '@/context/AuthContext';
import { EmptyState } from '@/components/ui';
import { SeoHead } from '@/components/SeoHead';

export default function Results() {
  const { t, path } = useI18n();
  const { user } = useAuth();
  const { code } = useParams();
  if (!user) return <Navigate to={path('/play')} replace />;
  return (
    <div className="page container container-narrow">
      <SeoHead title={`${t('results.title')} · DrawSpace`} description={t('seo.results')} noindex />
      <EmptyState
        title={t('results.title')}
        body={`Results for ${code?.toUpperCase() || 'this match'} are shown in the game room. Open your profile to review saved match history.`}
        action={<><Link to={path('/profile')} className="btn btn-primary btn-sm">{t('common.matchHistory')}</Link> <Link to={path('/lobby')} className="btn btn-secondary btn-sm">{t('results.backToLobby')}</Link></>}
      />
    </div>
  );
}
