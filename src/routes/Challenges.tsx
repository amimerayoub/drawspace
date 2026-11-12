import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import type { ChallengePeriod } from '@/types';
import { useI18n } from '@/i18n/I18nContext';
import { useAuth } from '@/context/AuthContext';
import { useDb } from '@/hooks/useDb';
import { useToast } from '@/context/ToastContext';
import { progressionService } from '@/services';
import { Emblem } from '@/components/Emblems';
import { REWARD_IMAGES } from '@/data/assets';
import { Badge, Button, EmptyState, Progress, Tabs } from '@/components/ui';
import { SeoHead } from '@/components/SeoHead';

export default function Challenges() {
  const { t, path, formatDate } = useI18n();
  const { user, refresh } = useAuth();
  const { toast } = useToast();
  useDb();
  const [tab, setTab] = useState<ChallengePeriod>('daily');

  if (!user) return <Navigate to={path('/play')} replace />;

  const all = progressionService.challenges();
  const list = all.filter((c) => c.period === tab);

  const claim = (id: string) => {
    const xp = progressionService.claimChallenge(id, user.id);
    if (xp > 0) {
      refresh();
      toast(t('challenges.claimedToast', { xp }), 'success');
    }
  };

  return (
    <div className="page">
      <SeoHead title={`${t('challenges.title')} · DrawSpace`} />
      <div className="container container-narrow">
        <div className="page-head">
          <h1 className="page-title">{t('challenges.title')}</h1>
          <p className="page-sub">{t('challenges.sub')}</p>
        </div>

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
                      <Button variant="primary" size="sm" onClick={() => claim(c.id)}>{t('common.claim')}</Button>
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
