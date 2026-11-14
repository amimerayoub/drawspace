import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import type { ChallengePeriod } from '@/types';
import { useI18n } from '@/i18n/I18nContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { backendProgressionService, type ProgressionSnapshot } from '@/services/backendProgression.service';
import { Emblem } from '@/components/Emblems';
import { REWARD_IMAGES } from '@/data/assets';
import { Badge, Button, EmptyState, Progress, Tabs } from '@/components/ui';
import { SeoHead } from '@/components/SeoHead';

export default function Challenges() {
  const { t, path, formatDate } = useI18n();
  const { user, refresh } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState<ChallengePeriod>('daily');
  const [snapshot, setSnapshot] = useState<ProgressionSnapshot | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { if (user) void backendProgressionService.getMine().then(setSnapshot).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Challenges could not be loaded.')); }, [user?.id]);

  if (!user) return <Navigate to={path('/play')} replace />;

  const all = snapshot?.challenges || [];
  const list = all.filter((c) => c.period === tab);

  const claim = async (id: string) => {
    try { const { xp } = await backendProgressionService.claimChallenge(id); setSnapshot(await backendProgressionService.getMine()); await refresh(); toast(t('challenges.claimedToast', { xp }), 'success'); }
    catch (e) { toast(e instanceof Error ? e.message : 'Challenge could not be claimed.', 'error'); }
  };

  return (
    <div className="page">
      <SeoHead title={`${t('challenges.title')} · DrawSpace`} />
      <div className="container container-narrow">
        <div className="page-head">
          <h1 className="page-title">{t('challenges.title')}</h1>
          <p className="page-sub">{t('challenges.sub')}</p>
        </div>
        {error && <p role="alert" className="muted">{error}</p>}

        <Tabs
          label={t('challenges.title')}
          active={tab}
          onChange={(id) => setTab(id as ChallengePeriod)}
          tabs={[
            { id: 'daily', label: t('common.daily'), count: all.filter((c) => c.period === 'daily').length },
            { id: 'weekly', label: t('common.weekly'), count: all.filter((c) => c.period === 'weekly').length },
            { id: 'special', label: t('common.special'), count: all.filter((c) => c.period === 'special').length },
          ]}
        />

        {list.length === 0 ? (
          <EmptyState title={t('challenges.none')} />
        ) : (
          <div className="challenge-list">
            {list.map((c) => {
              const done = c.progress >= c.objective;
              return (
                <div key={c.id} className={`panel panel-pad challenge-card ${c.claimed ? 'claimed' : ''}`}>
                  <div className="challenge-main">
                    <div className="challenge-head">
                      <Emblem src={REWARD_IMAGES.xp} size={30} className="challenge-emblem" />
                      <span className="challenge-name">{c.name}</span>
                      <span className="mono accent challenge-xp">+{c.xpReward} XP</span>
                    </div>
                    <p className="muted challenge-desc">{c.description}</p>
                    <div className="challenge-progress">
                      <Progress value={c.progress} max={c.objective} label={c.name} />
                      <span className="faint mono">{Math.min(c.progress, c.objective)} / {c.objective}</span>
                    </div>
                    <p className="faint challenge-ends">{t('challenges.endsIn', { date: formatDate(c.endsAt) })}</p>
                  </div>
                  <div className="challenge-action">
                    {c.claimed ? (
                      <Badge tone="accent"><Check size={11} /> {t('common.claimed')}</Badge>
                    ) : done ? (
                      <Button variant="primary" size="sm" onClick={() => void claim(c.id)}>{t('common.claim')}</Button>
                    ) : (
                      <span className="faint challenge-pct mono">{Math.round((c.progress / c.objective) * 100)}%</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
