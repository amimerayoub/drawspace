import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nContext';
import { useAuth, fullUser } from '@/context/AuthContext';
import { useDb } from '@/hooks/useDb';
import { useToast } from '@/context/ToastContext';
import { progressionService } from '@/services';
import { AchievementIcon, TitleIcon } from '@/components/Emblems';
import { Badge, Button, EmptyState, Progress, Tabs } from '@/components/ui';
import { SeoHead } from '@/components/SeoHead';

export default function Achievements() {
  const { t, path, formatDate } = useI18n();
  const { user, refresh } = useAuth();
  const { toast } = useToast();
  useDb();
  const [tab, setTab] = useState('achievements');

  if (!user) return <Navigate to={path('/play')} replace />;
  const full = fullUser(user.id);

  const achievements = progressionService.achievements();
  const titles = progressionService.titles();
  const rewards = progressionService.rewards(user.id);
  const unlockedCount = achievements.filter((a) => a.unlockedAt).length;

  const equip = (titleId: string | null) => {
    progressionService.equipTitle(user.id, titleId);
    refresh();
    toast(t('toast.saved'), 'success');
  };

  return (
    <div className="page">
      <SeoHead title={`${t('achievements.title')} · DrawSpace`} />
      <div className="container">
        <div className="page-head">
          <h1 className="page-title">{t('achievements.title')}</h1>
          <p className="page-sub">{t('achievements.sub')}</p>
        </div>

        <Tabs
          label={t('achievements.title')}
          active={tab}
          onChange={setTab}
          tabs={[
            { id: 'achievements', label: t('common.achievements'), count: achievements.length },
            { id: 'titles', label: t('common.titles'), count: titles.length },
            { id: 'rewards', label: t('common.rewardHistory'), count: rewards.length },
          ]}
        />

        {tab === 'achievements' && (
          <>
            <p className="muted ach-count">{t('achievements.unlockedCount', { done: unlockedCount, total: achievements.length })}</p>
            <div className="ach-grid">
              {achievements.map((a) => {
                const unlocked = Boolean(a.unlockedAt);
                return (
                  <div key={a.id} className={`panel ach-card ${unlocked ? 'unlocked' : ''}`}>
                    <AchievementIcon achievement={a} size={44} unlocked={unlocked} className="ach-icon" />
                    <div className="ach-body">
                      <div className="ach-head">
                        <span className="ach-name">{a.name}</span>
                        <span className="mono ach-xp accent">+{a.xpReward}</span>
                      </div>
                      <p className="muted ach-desc">{a.description}</p>
                      {unlocked ? (
                        <p className="ach-status unlocked-label">
                          <Badge tone="accent">{t('common.unlocked')}</Badge>
                          <span className="faint">{formatDate(a.unlockedAt!)}</span>
                        </p>
                      ) : (
                        <div className="ach-progress">
                          <Progress value={a.progress ?? 0} max={a.goal ?? 1} label={a.name} />
                          <span className="faint mono">{a.progress ?? 0} / {a.goal ?? 1}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {tab === 'titles' && (
          <>
            <p className="muted ach-count">{t('titles.sub')}</p>
            <div className="panel title-list">
              {titles.map((ti) => {
                const equipped = full?.titleId === ti.id;
                return (
                  <div key={ti.id} className={`title-row ${ti.unlocked ? '' : 'locked'}`}>
                    <div className="title-info">
                      <span className="title-name">
                        <TitleIcon title={ti} size={22} />
                        {ti.name}
                        {equipped && <Badge tone="accent">{t('common.equipped')}</Badge>}
                        {!ti.unlocked && <Badge>{t('common.locked')}</Badge>}
                      </span>
                      <span className="muted title-desc">{ti.description}</span>
                      <span className="faint title-condition">{ti.condition}{ti.xpReward > 0 ? ` · +${ti.xpReward} XP` : ''}</span>
                    </div>
                    {ti.unlocked && (
                      equipped ? (
                        <Button size="sm" variant="ghost" onClick={() => equip(null)}>{t('common.cancel')}</Button>
                      ) : (
                        <Button size="sm" onClick={() => equip(ti.id)}>{t('common.equip')}</Button>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {tab === 'rewards' && (
          rewards.length === 0 ? (
            <EmptyState title={t('profile.noRewards')} />
          ) : (
            <>
              <p className="muted ach-count">{t('rewards.sub')}</p>
              <div className="panel reward-list">
                {rewards.map((r) => (
                  <div key={r.id} className="reward-row">
                    <Badge tone="outline">{r.kind}</Badge>
                    <span className="reward-label">{r.label}</span>
                    <span className="faint reward-date">{formatDate(r.at)}</span>
                    <span className="mono accent">+{r.xp} XP</span>
                  </div>
                ))}
              </div>
            </>
          )
        )}
      </div>
    </div>
  );
}
