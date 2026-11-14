import { useEffect, useState } from 'react';
import type { MatchDetail } from '@/services/matchHistory.service';
import { matchHistoryService } from '@/services/matchHistory.service';
import { DataTable, type Column } from '@/components/DataTable';
import { AdminPage } from './shared';

export default function Matches() {
  const [matches, setMatches] = useState<MatchDetail[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => { void matchHistoryService.admin(50).then(setMatches).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Match records could not be loaded.')).finally(() => setLoading(false)); }, []);
  const columns: Column<MatchDetail>[] = [
    { key: 'completedAt', header: 'Completed', render: (match) => new Date(match.completedAt).toLocaleString(), sortValue: (match) => match.completedAt },
    { key: 'matchId', header: 'Match ID', render: (match) => <span className="mono">{match.matchId}</span> },
    { key: 'roomName', header: 'Room', render: (match) => match.roomName },
    { key: 'players', header: 'Players', render: (match) => match.players.map((player) => `${player.placement}. ${player.username} (${player.score})`).join(', ') },
  ];
  return <AdminPage title="Match inspection" sub="Completed match records from the server history repository.">{loading && <p role="status">Loading matches…</p>}{error && <p role="alert">{error}</p>}<div className="panel"><DataTable columns={columns} rows={matches} rowKey={(match) => match.matchId} searchable searchPlaceholder="Search match ID, room, players" searchLabel="Search matches" searchValue={(match) => `${match.matchId} ${match.roomName} ${match.players.map((player) => player.username).join(' ')}`} emptyTitle={loading ? 'Loading matches' : 'No match records'} pageSize={20}/></div></AdminPage>;
}
