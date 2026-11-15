import { useEffect, useState } from 'react';
import { Check, Flag, X } from 'lucide-react';
import type { Report } from '@/types';
import { useToast } from '@/context/ToastContext';
import { backendAdminService } from '@/services/backendAdmin.service';
import { Badge, Button, Field, Modal, Tabs, Textarea } from '@/components/ui';
import { AdminPage, useAdmin } from './shared';

type Decision = { report: Report; status: 'resolved' | 'dismissed' };

export default function Moderation() {
  useAdmin();
  const { toast } = useToast();
  const [tab, setTab] = useState('open');
  const [rows, setRows] = useState<Report[]>([]);
  const [counts, setCounts] = useState({ open: 0, resolved: 0, dismissed: 0 });
  const [error, setError] = useState('');
  const [decision, setDecision] = useState<Decision | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  const load = async (status = tab) => {
    try { const [open, resolved, dismissed] = await Promise.all(['open', 'resolved', 'dismissed'].map((value) => backendAdminService.reports(value))); setRows(status === 'open' ? open : status === 'resolved' ? resolved : dismissed); setCounts({ open: open.length, resolved: resolved.length, dismissed: dismissed.length }); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Moderation queue could not be loaded.'); }
  };
  useEffect(() => { void load(); }, [tab]);

  const openDecision = (report: Report, status: 'resolved' | 'dismissed') => { setDecision({ report, status }); setNote(''); setActionError(''); };

  const submitDecision = async () => {
    if (!decision) return;
    const trimmed = note.trim();
    if (trimmed.length < 3) { setActionError('Add a short note (at least 3 characters) explaining this decision.'); return; }
    setBusy(true); setActionError('');
    try {
      await backendAdminService.resolveReport(decision.report.id, decision.status, trimmed);
      await load(tab);
      toast(decision.status === 'resolved' ? 'Report resolved. Decision logged.' : 'Report dismissed. Decision logged.', 'success');
      setDecision(null);
    } catch (e) { setActionError(e instanceof Error ? e.message : 'Report could not be updated.'); }
    finally { setBusy(false); }
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
              <p className="admin-report-reason">{r.detail || r.reason}</p>
              <p className="faint admin-report-meta">Target: {r.target} · Reported by {r.reporter}</p>
              {r.status === 'open' ? (
                <div className="admin-report-actions">
                  <Button size="sm" variant="primary" icon={<Check size={14} />} onClick={() => openDecision(r, 'resolved')}>Resolve</Button>
                  <Button size="sm" variant="ghost" icon={<X size={14} />} onClick={() => openDecision(r, 'dismissed')}>Dismiss</Button>
                </div>
              ) : (
                <div className="admin-report-resolution">
                  <p className="admin-form-label">{r.resolutionAction === 'dismissed' ? 'Dismissed' : 'Resolved'}{r.resolvedAt ? ` · ${new Date(r.resolvedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}</p>
                  <p className="muted">{r.moderatorNotes || 'No moderator note recorded.'}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal
        open={decision !== null}
        onClose={() => { if (!busy) setDecision(null); }}
        title={decision?.status === 'resolved' ? 'Resolve report' : 'Dismiss report'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDecision(null)} disabled={busy}>Cancel</Button>
            <Button variant="primary" loading={busy} icon={decision?.status === 'resolved' ? <Check size={15} /> : <X size={15} />} onClick={() => void submitDecision()}>
              {decision?.status === 'resolved' ? 'Resolve' : 'Dismiss'}
            </Button>
          </>
        }
      >
        {decision && (
          <>
            <p className="muted admin-report-detail">{decision.report.detail || decision.report.reason}</p>
            <p className="faint admin-report-meta">Target: {decision.report.target} · Reported by {decision.report.reporter}</p>
            <Field label="Moderator note" htmlFor="moderation-note" required hint="Recorded in the audit log. Explain why this report is being resolved or dismissed.">
              <Textarea id="moderation-note" rows={4} maxLength={255} value={note} onChange={(e) => setNote(e.target.value)} placeholder={decision.status === 'resolved' ? 'e.g. Confirmed inappropriate drawing. Player warned.' : 'e.g. Reviewed the round; no rule violation found.'} />
            </Field>
            {actionError && <p role="alert" className="admin-form-error">{actionError}</p>}
          </>
        )}
      </Modal>
    </AdminPage>
  );
}