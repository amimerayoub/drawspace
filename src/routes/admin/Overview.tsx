import { Link } from 'react-router-dom';
import { BookOpen, Flag, Gamepad2, Users } from 'lucide-react';
import { useDb } from '@/hooks/useDb';
import { ANALYTICS } from '@/data/mock';
import { LineChart } from '@/components/charts';
import { Badge } from '@/components/ui';
import { AdminPage, StatCard } from './shared';

export default function Overview() {
  const db = useDb();
  const openReports = db.reports.filter((r) => r.status === 'open').length;
  const activeRooms = db.rooms.filter((r) => r.status !== 'finished').length;
  const activeWords = db.words.filter((w) => w.active).length;
  const days = ['Oct 29', 'Nov 11'];

  return (
    <AdminPage title="Overview" sub="Platform health at a glance.">
      <div className="admin-stat-grid">
        <StatCard label="Registered players" value={ANALYTICS.dau[ANALYTICS.dau.length - 1].toLocaleString()} hint="cumulative" icon={<Users size={17} />} />
        <StatCard label="Matches yesterday" value={ANALYTICS.matches[ANALYTICS.matches.length - 1]} hint="14 day trend below" icon={<Gamepad2 size={17} />} />
        <StatCard label="Active words" value={activeWords} hint={`${db.words.length} total`} icon={<BookOpen size={17} />} />
        <StatCard label="Open reports" value={openReports} hint="moderation queue" icon={<Flag size={17} />} />
      </div>

      <div className="admin-grid-2">
        <div className="panel panel-pad">
          <div className="admin-panel-head">
            <h2 className="admin-panel-title">Daily active players</h2>
            <Badge tone="outline">14 days</Badge>
          </div>
          <LineChart data={ANALYTICS.dau} labels={days} label="Daily active players" />
        </div>
        <div className="panel panel-pad">
          <div className="admin-panel-head">
            <h2 className="admin-panel-title">Rooms right now</h2>
            <Link to="/admin/rooms" className="admin-link">Manage</Link>
          </div>
          {activeRooms === 0 ? (
            <p className="muted">No rooms open.</p>
          ) : (
            <ul className="admin-mini-list">
              {db.rooms.slice(0, 5).map((r) => (
                <li key={r.code}>
                  <span className="mono admin-room-code">{r.code}</span>
                  <span className="admin-mini-main">{r.name}</span>
                  <Badge tone={r.status === 'playing' ? 'accent' : 'neutral'}>{r.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="panel panel-pad">
        <div className="admin-panel-head">
          <h2 className="admin-panel-title">Recent admin activity</h2>
          <Link to="/admin/audit" className="admin-link">Full audit log</Link>
        </div>
        <ul className="admin-mini-list">
          {db.audit.slice(0, 6).map((a) => (
            <li key={a.id}>
              <span className="admin-mini-main"><strong>{a.admin}</strong> {a.action} <span className="muted">{a.target}</span></span>
              <span className="faint admin-mini-date">{new Date(a.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
              <Badge tone={a.status === 'success' ? 'neutral' : 'outline'}>{a.status}</Badge>
            </li>
          ))}
        </ul>
      </div>
    </AdminPage>
  );
}
