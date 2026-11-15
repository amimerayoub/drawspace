import { useCallback, useEffect, useState } from 'react';
import { Gamepad2, Hash, RotateCw, Trophy, UserCheck, Users, Zap } from 'lucide-react';
import type { AnalyticsTopPlayer, PlatformAnalytics } from '@/types';
import { Badge, Button, NativeSelect, Spinner } from '@/components/ui';
import { BarChart, Donut, LineChart } from '@/components/charts';
import { DataTable, type Column } from '@/components/DataTable';
import { backendAdminService } from '@/services/backendAdmin.service';
import { AdminPage, NoAccess, StatCard, useAdmin } from './shared';

const fmt = (value: number | null) => (value === null ? '—' : value.toLocaleString());
const RANGES = [7, 14, 30, 90];

export default function Analytics() {
  const { can } = useAdmin();
  const [data, setData] = useState<PlatformAnalytics | null>(null);
  const [days, setDays] = useState(14);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (range: number) => {
    setRefreshing(true);
    try { setData(await backendAdminService.analytics(range)); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Analytics could not be loaded.'); }
    finally { setRefreshing(false); }
  }, []);
  useEffect(() => { void load(days); }, [days, load]);

  if (!can('analytics.view')) return <NoAccess />;

  const playerColumns: Column<AnalyticsTopPlayer>[] = [
    { key: 'username', header: 'Player', render: (p) => <span className="admin-user-name">{p.username}</span>, sortValue: (p) => p.username },
    { key: 'level', header: 'Level', align: 'end', render: (p) => <Badge tone="neutral">{p.level}</Badge>, sortValue: (p) => p.level },
    { key: 'xp', header: 'XP', align: 'end', render: (p) => <span className="mono">{p.xp.toLocaleString()}</span>, sortValue: (p) => p.xp },
    { key: 'wins', header: 'Wins', align: 'end', render: (p) => <span className="mono">{p.wins.toLocaleString()}</span>, sortValue: (p) => p.wins },
  ];

  const weekLabels = data ? data.series.labels.slice(-7) : [];
  const weekMatches = data ? data.series.matches.slice(-7).map((value, i) => ({ label: weekLabels[i], value })) : [];

  return (
    <AdminPage
      title="Analytics"
      sub="Aggregated from production profiles, progression, statistics, and match records. No demo data."
      actions={
        <>
          <NativeSelect aria-label="Date range" value={String(days)} onChange={(e) => setDays(Number(e.target.value))}>
            {RANGES.map((range) => <option key={range} value={range}>Last {range} days</option>)}
          </NativeSelect>
          <Button variant="secondary" icon={<RotateCw size={15} />} loading={refreshing} onClick={() => void load(days)}>Refresh</Button>
        </>
      }
    >
      {error && <p role="alert" className="muted">{error}</p>}
      {!data && !error && <div className="page"><Spinner /></div>}

      {data && (
        <>
          <p className="faint" style={{ marginBottom: 16 }}>Last {data.range.days} days · updated {new Date(data.generatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
          <div className="admin-stat-grid">
            <StatCard label="Total users" value={fmt(data.totals.users)} icon={<Users size={17} />} />
            <StatCard label="Active users" value={fmt(data.totals.activeUsers)} hint="Enabled accounts" icon={<UserCheck size={17} />} />
            <StatCard label="Matches played" value={fmt(data.totals.matches)} hint={data.matchesAvailable ? 'Completed matches' : 'Connects after match_history migration'} icon={<Trophy size={17} />} />
            <StatCard label="Words guessed" value={data.totals.wordsGuessed.toLocaleString()} hint="Correct guesses, all time" icon={<Hash size={17} />} />
            <StatCard label="XP awarded" value={data.totals.xpAwarded.toLocaleString()} hint="All reward transactions" icon={<Zap size={17} />} />
          </div>

          <div className="admin-grid-2">
            <div className="panel panel-pad">
              <h2 className="admin-panel-title">New signups</h2>
              <LineChart data={data.series.signups} labels={data.series.labels} label={`New signups over ${data.range.days} days`} />
            </div>
            <div className="panel panel-pad">
              <h2 className="admin-panel-title">XP awarded per day</h2>
              <LineChart data={data.series.xp} labels={data.series.labels} label={`XP awarded over ${data.range.days} days`} />
            </div>
          </div>

          <div className="admin-grid-2">
            <div className="panel panel-pad">
              <h2 className="admin-panel-title">Matches per day</h2>
              {data.matchesAvailable
                ? <BarChart data={weekMatches} label="Matches per day, last 7 days" />
                : <p className="muted">Match history is not connected yet. Apply the match_history migration to populate this chart.</p>}
            </div>
            <div className="panel panel-pad">
              <h2 className="admin-panel-title">Account types</h2>
              <Donut data={[{ label: 'Registered', value: data.accountTypes.registered }, { label: 'Guests', value: data.accountTypes.guest }]} label="Registered versus guest accounts" />
            </div>
          </div>

          <div className="admin-grid-2">
            <div className="panel panel-pad">
              <h2 className="admin-panel-title">Players by locale</h2>
              {data.locales.length > 0
                ? <Donut data={data.locales.map((l) => ({ label: l.locale, value: l.count }))} label="Share of players by interface locale" />
                : <p className="muted">No locale preferences recorded yet.</p>}
              <p className="faint admin-field-hint">Gameplay words are always English. Locale affects the interface only.</p>
            </div>
            <div className="panel panel-pad">
              <h2 className="admin-panel-title">Top players by XP</h2>
              <DataTable columns={playerColumns} rows={data.topPlayers} rowKey={(p) => p.userId} pageSize={10} emptyTitle="No progression data yet" />
            </div>
          </div>
        </>
      )}
    </AdminPage>
  );
}