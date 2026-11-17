import { useState } from 'react';
import { Crown } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
import { useAuth } from '@/context/AuthContext';
import { useLeaderboard } from '@/hooks/useQueries';
import { Avatar } from '@/components/Avatar';
import { TitleIcon } from '@/components/Emblems';
import { Badge, EmptyState, SearchInput } from '@/components/ui';
import { SeoHead } from '@/components/SeoHead';

export default function Leaderboard() {
  const { t, formatNumber } = useI18n();
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const { data, error: loadError } = useLeaderboard();
  const entries = data ?? [];
  const error = loadError instanceof Error ? loadError.message : loadError ? 'Leaderboard could not be loaded.' : '';

  const filtered = query
    ? entries.filter((e) => e.username.toLowerCase().includes(query.toLowerCase()))
    : entries;

  return (
    <div className="page">
      <SeoHead title={`${t('leaderboard.title')} · DrawSpace`} description={t('leaderboard.sub')} />
      <div className="container container-narrow">
        <div className="page-head">
          <h1 className="page-title">{t('leaderboard.title')}</h1>
          <p className="page-sub">{t('leaderboard.sub')}</p>
        </div>

        <div className="leaderboard-tools">
          <SearchInput value={query} onChange={setQuery} placeholder={t('common.search')} label={t('leaderboard.title')} />
        </div>
        {error && <p role="alert" className="muted">{error}</p>}

        {filtered.length === 0 ? (
          <EmptyState title={t('lobby.noRooms')} />
        ) : (
          <div className="panel leaderboard-list">
            {filtered.map((e) => {
              const isMe = Boolean(user && e.isMe);
              return (
                <div key={e.rank} className={`lb-row ${e.rank <= 3 ? 'top' : ''} ${isMe ? 'me' : ''}`}>
                  <span className={`lb-rank mono ${e.rank <= 3 ? 'accent' : 'faint'}`}>
                    {e.rank === 1 ? <Crown size={15} aria-label="1" /> : e.rank}
                  </span>
                  <Avatar avatarId={e.avatarId} size={36} />
                  <span className="lb-info">
                    <span className="lb-name">
                      {e.username}
                      {isMe && <span className="faint"> ({t('leaderboard.you')})</span>}
                    </span>
                    {e.titleName && <Badge tone="outline">{e.titleName}</Badge>}
                  </span>
                  <span className="lb-level faint mono">{t('common.level')} {e.level}</span>
                  <span className="lb-wins faint">{formatNumber(e.wins)} {t('common.wins').toLowerCase()}</span>
                  <span className="lb-xp mono">{formatNumber(e.xp)} XP</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
