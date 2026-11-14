import { useEffect, useState } from 'react';
import { Check, Flag, X } from 'lucide-react';
import type { Report } from '@/types';
import { useToast } from '@/context/ToastContext';
import { backendAdminService } from '@/services/backendAdmin.service';
import { Badge, Button, Tabs } from '@/components/ui';
import { AdminPage, useAdmin } from './shared';

export default function Moderation() {
  useAdmin();
  const { toast } = useToast();
  const [tab, setTab] = useState('open');
  const [rows, setRows] = useState<Report[]>([]);
  const [counts, setCounts] = useState({ open: 0, resolved: 0, dismissed: 0 });
  const [error, setError] = useState('');
  const load = async (status = tab) => {
    try { const [open, resolved, dismissed] = await Promise.all(['open', 'resolved', 'dismissed'].map((value) => backendAdminService.reports(value))); setRows(status === 'open' ? open : status === 'resolved' ? resolved : dismissed); setCounts({ open: open.length, resolved: resolved.length, dismissed: dismissed.length }); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Moderation queue could not be loaded.'); }
  };
  useEffect(() => { void load(); }, [tab]);

  const resolve = async (r: Report, status: 'resolved' | 'dismissed') => {
    try { await backendAdminService.resolveReport(r.id, status, status === 'resolved' ? 'Reviewed and resolved by moderator.' : 'Reviewed and dismissed by moderator.'); await load(tab); toast(status === 'resolved' ? 'Report resolved. Action logged.' : 'Report dismissed.', 'success'); }
    catch (e) { toast(e instanceof Error ? e.message : 'Report could not be updated.', 'error'); }
  };

  return (
    <AdminPage title="Moderation" sub="Player reports from rooms. Every decision is written to the audit log.">
      {error && <p role="alert" className="muted">{error}</p>}
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
                  <Button size="sm" variant="primary" icon={<Check size={14} />} onClick={() => void resolve(r, 'resolved')}>Resolve</Button>
                  <Button size="sm" variant="ghost" icon={<X size={14} />} onClick={() => void resolve(r, 'dismissed')}>Dismiss</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </AdminPage>
  );
}
