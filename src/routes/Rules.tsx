import { Link } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nContext';
import { SeoHead } from '@/components/SeoHead';

export default function Rules() {
  const { t, path } = useI18n();
  const rules = [
    { title: t('rules.r1Title'), body: t('rules.r1Body') },
    { title: t('rules.r2Title'), body: t('rules.r2Body') },
    { title: t('rules.r3Title'), body: t('rules.r3Body') },
    { title: t('rules.r4Title'), body: t('rules.r4Body') },
    { title: t('rules.r5Title'), body: t('rules.r5Body') },
  ];

  return (
    <div className="page">
      <SeoHead title={`${t('rules.title')} · DrawSpace`} description={t('rules.sub')} />
      <div className="container container-narrow">
        <div className="page-head">
          <h1 className="page-title">{t('rules.title')}</h1>
          <p className="page-sub">{t('rules.sub')}</p>
        </div>
        <div className="panel rules-list">
          {rules.map((r, i) => (
            <div key={r.title} className="rule-row">
              <span className="rule-num mono accent" aria-hidden>{String(i + 1).padStart(2, '0')}</span>
              <div>
                <h2 className="rule-title">{r.title}</h2>
                <p className="muted">{r.body}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="rules-cta">
          <Link to={path('/play')} className="btn btn-primary btn-lg">{t('common.playNow')}</Link>
        </div>
      </div>
    </div>
  );
}
