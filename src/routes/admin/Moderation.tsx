import { useState } from 'react';
import { Check, Flag, X } from 'lucide-react';
import type { Report } from '@/types';
import { useDb } from '@/hooks/useDb';
import { useToast } from '@/context/ToastContext';
import { adminService } from '@/services';
import { Badge, Button, Tabs } from '@/components/ui';
import { AdminPage, useAdmin } from './shared';

export default function Moderation() {
  const db = useDb();
  const { name } = useAdmin();
  const { toast } = useToast();
  const [tab, setTab] = useState('open');

  const counts = {
    open: db.reports.filter((r) => r.status === 'open').length,
    resolved: db.reports.filter((r) => r.status === 'resolved').length,
    dismissed: db.reports.filter((r) => r.status === 'dismissed').length,
  };
  const rows = db.reports.filter((r) => r.status === tab);

  const resolve = (r: Report, status: 'resolved' | 'dismissed') => {
    adminService.resolveReport(r.id, status, name);
    toast(status === 'resolved' ? 'Report resolved. Action logged.' : 'Report dismissed.', 'success');
  };

  return (
    <AdminPage title="Moderation" sub="Player reports from rooms. Every decision is written to the audit log.">
      <Tabs
        tabs={[
          { id: 'open', label: 'Open', count: counts.open },
          { id: 'resolved', label: 'Resolved', count: counts.resolved },
          { id: 'dismissed', label: 'Dismissed', count: counts.dismissed },
        ]}
        active={tab} onChange={setTab} label="Report status"
      />
      {rows.length === 0 ? (
        <div className="panel panel-pad">
          <p className="muted">{tab === 'open' ? 'No open reports. The queue is clear.' : `No ${tab} reports.`}</p>
        </div>
      ) : (
        <div className="admin-report-list">
          {rows.map((r) => (
            <div key={r.id} className="panel panel-pad admin-report">
              <div className="admin-report-head">
                <span className="admin-report-type"><Flag size={14} aria-hidden /> {r.type}</span>
                <Badge tone={r.status === 'open' ? 'accent' : 'neutral'}>{r.status}</Badge>
                <span className="faint admin-report-date">{new Date(r.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <p className="admin-report-reason">{r.reason}</p>
              <p className="muted admin-report-detail">{r.detail}</p>
              <p className="faint admin-report-meta">Target: {r.target} · Reported by {r.reporter}</p>
              {r.status === 'open' && (
                <div className="admin-report-actions">
                  <Button size="sm" variant="primary" icon={<Check size={14} />} onClick={() => resolve(r, 'resolved')}>Resolve</Button>
                  <Button size="sm" variant="ghost" icon={<X size={14} />} onClick={() => resolve(r, 'dismissed')}>Dismiss</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </AdminPage>
  );
}