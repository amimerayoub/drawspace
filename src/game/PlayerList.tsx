import { Check, Crown, PenLine } from 'lucide-react';
import type { RoomPlayer } from '@/types';
import { useI18n } from '@/i18n/I18nContext';
import { useDb } from '@/hooks/useDb';
import { Avatar } from '@/components/Avatar';
import { TitleIcon } from '@/components/Emblems';

interface Props {
  players: RoomPlayer[];
  scores: Record<string, number>;
  guessedIds: string[];
  drawerId: string;
  myId: string;
  hostId: string;
}

export function PlayerList({ players, scores, guessedIds, drawerId, myId, hostId }: Props) {
  const { t } = useI18n();
  const dbState = useDb();
  const sorted = [...players].sort((a, b) => (scores[b.id] ?? 0) - (scores[a.id] ?? 0));
  const titleFor = (p: RoomPlayer) => {
    if (p.isBot) return undefined;
    const titleId = dbState.users.find((u) => u.id === p.id)?.titleId;
    return titleId ? dbState.titles.find((ti) => ti.id === titleId) : undefined;
  };

  return (
    <div className="player-panel">
      <div className="player-head">{t('game.players')}</div>
      <ul className="player-list">
        {sorted.map((p, i) => {
          const isDrawer = p.id === drawerId;
          const guessed = guessedIds.includes(p.id);
          const title = titleFor(p);
          return (
            <li key={p.id} className={`player-row ${isDrawer ? 'drawing' : ''} ${guessed ? 'guessed' : ''} ${p.id === myId ? 'me' : ''}`}>
              <span className="player-rank mono faint">{i + 1}</span>
              <Avatar avatarId={p.avatarId} size={30} />
              <span className="player-info">
                <span className="player-name">
                  <span className="player-name-text">{p.username}</span>
                  {title && <TitleIcon title={title} size={14} className="player-title" />}
                  {p.id === hostId && <Crown size={11} className="accent" aria-label="host" />}
                  {p.isBot && <span className="player-bot faint">bot</span>}
                </span>
                <span className="player-score mono">{scores[p.id] ?? 0}</span>
              </span>
              <span className="player-state" aria-hidden>
                {guessed && <Check size={14} className="accent" />}
                {isDrawer && !guessed && <PenLine size={13} className="muted" />}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
