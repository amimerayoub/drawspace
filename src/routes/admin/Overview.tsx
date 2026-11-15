import { useCallback, useEffect, useState } from 'react';
import { BookOpen, FileText, Flag, Gamepad2, Radio, RotateCw, Trophy, UserCheck, Users } from 'lucide-react';
import type { OverviewActivity, PlatformOverview } from '@/types';
import { Badge, Button, Spinner } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable';
import { backendAdminService } from '@/services/backendAdmin.service';
import { AdminPage, StatCard } from './shared';

const fmt = (value: number | null) => (value === null ? '—' : value.toLocaleString());
const fmtTime = (value: string) => value ? new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

export default function Overview() {
  const [overview, setOverview] = useState<PlatformOverview | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setOverview(await backendAdminService.overview());
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Overview metrics could not be loaded.');
    } finally {
      setRefreshing(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const activityColumns: Column<OverviewActivity>[] = [
    { key: 'at', header: 'Time', width: '18%', render: (a) => <span className="muted mono admin-audit-time">{fmtTime(a.at)}</span>, sortValue: (a) => a.at },
    { key: 'admin', header: 'Admin', render: (a) => <span className="admin-user-name">{a.admin}</span>, sortValue: (a) => a.admin },
    { key: 'action', header: 'Action', render: (a) => <span className="mono">{a.action}</span>, sortValue: (a) => a.action },
    { key: 'target', header: 'Target', render: (a) => <span className="muted mono">{a.target || '—'}</span>, sortValue: (a) => a.target },
    { key: 'status', header: 'Result', render: (a) => <Badge tone={a.status === 'success' ? 'neutral' : 'outline'}>{a.status}</Badge>, sortValue: (a) => a.status },
  ];

  return (
    <AdminPage
      title="Platform overview"
      sub="Live counts from the production database and game server. No demo data."
      actions={<Button variant="secondary" icon={<RotateCw size={15} />} loading={refreshing} onClick={() => void load()}>Refresh</Button>}
    >
      {error && <p role="alert" className="muted">{error}</p>}
      {!overview && !error && <div className="page"><Spinner /></div>}

      {overview && (
        <>
          <p className="faint" style={{ marginBottom: 16 }}>Last updated {fmtTime(overview.generatedAt)}</p>
          <div className="admin-stat-grid">
            <StatCard label="Total users" value={fmt(overview.users.total)} icon={<Users size={17} />} />
            <StatCard label="Active users" value={fmt(overview.users.active)} hint="Enabled accounts" icon={<UserCheck size={17} />} />
            <StatCard label="Live rooms" value={overview.rooms.playing} hint={`${overview.rooms.waiting} waiting, ${overview.rooms.total} total`} icon={<Gamepad2 size={17} />} />
            <StatCard label="Players online" value={overview.rooms.players} hint="Connected in open rooms" icon={<Radio size={17} />} />
            <StatCard label="Matches played" value={fmt(overview.matches.total)} hint={overview.matches.total === null ? 'Connects after match_history migration' : 'Completed matches'} icon={<Trophy size={17} />} />
            <StatCard label="Blog posts" value={fmt(overview.blog.total)} hint={`${fmt(overview.blog.published)} published, ${fmt(overview.blog.drafts)} drafts`} icon={<FileText size={17} />} />
            <StatCard label="Words" value={fmt(overview.words.total)} hint={`${fmt(overview.words.active)} active in matches`} icon={<BookOpen size={17} />} />
            <StatCard label="Open reports" value={fmt(overview.reports.open)} hint={`${fmt(overview.reports.resolved)} resolved, ${fmt(overview.reports.dismissed)} dismissed`} icon={<Flag size={17} />} />
          </div>

          <h2 className="admin-section-title">Recent activity</h2>
          <div className="panel">
            <DataTable
              columns={activityColumns}
              rows={overview.recentActivity}
              rowKey={(a) => a.id}
              pageSize={8}
              emptyTitle="No admin activity yet"
            />
          </div>
        </>
      )}
    </AdminPage>
  );
}