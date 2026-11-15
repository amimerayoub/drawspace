import { useCallback, useEffect, useState } from 'react';
import { Info, Pencil, Plus, RotateCw, Send, Trash2 } from 'lucide-react';
import type { CrmMessage } from '@/types';
import { useToast } from '@/context/ToastContext';
import { backendAdminService } from '@/services/backendAdmin.service';
import { Badge, Button, ConfirmDialog, Field, Input, Modal, NativeSelect, Spinner, Textarea } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable';
import { AdminPage, NoAccess, useAdmin } from './shared';

const SEGMENTS = ['All players', 'Inactive 30 days', 'Level 10+', 'New this week', 'Guests'];
type SegmentCount = { segment: string; count: number };

export default function Crm() {
  const { can } = useAdmin();
  const { toast } = useToast();
  const [messages, setMessages] = useState<CrmMessage[]>([]);
  const [segments, setSegments] = useState<SegmentCount[]>([]);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<CrmMessage | 'new' | null>(null);
  const [form, setForm] = useState({ segment: SEGMENTS[0], subject: '', body: '' });
  const [sending, setSending] = useState<CrmMessage | null>(null);
  const [deleting, setDeleting] = useState<CrmMessage | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setRefreshing(true);
    try { const data = await backendAdminService.crm(); setMessages(data.messages); setSegments(data.segments); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Campaigns could not be loaded.'); }
    finally { setRefreshing(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (!can('crm.send')) return <NoAccess />;

  const audienceFor = (segment: string) => segments.find((s) => s.segment === segment)?.count ?? 0;
  const segmentOptions = segments.length ? segments : SEGMENTS.map((segment) => ({ segment, count: 0 }));

  const open = (m: CrmMessage | 'new') => {
    setForm(m === 'new' ? { segment: SEGMENTS[0], subject: '', body: '' } : { segment: m.segment, subject: m.subject, body: m.body });
    setFormError('');
    setEditing(m);
  };

  const save = async (status: 'draft' | 'sent') => {
    if (!form.subject.trim() || !form.body.trim()) { setFormError('Subject and body are required.'); return; }
    setBusy(true); setFormError('');
    try {
      const saved = await backendAdminService.saveCrm({ id: editing === 'new' ? undefined : (editing as CrmMessage).id, segment: form.segment, subject: form.subject.trim(), body: form.body.trim(), status });
      await load();
      toast(status === 'sent' ? `Campaign recorded for ${saved.recipients.toLocaleString()} players.` : 'Draft saved.', 'success');
      setEditing(null);
    } catch (e) { setFormError(e instanceof Error ? e.message : 'Campaign could not be saved.'); }
    finally { setBusy(false); }
  };

  const confirmSend = async () => {
    if (!sending) return;
    try { const saved = await backendAdminService.sendCrm(sending.id); await load(); toast(`Campaign recorded for ${saved.recipients.toLocaleString()} players.`, 'success'); }
    catch (e) { toast(e instanceof Error ? e.message : 'Campaign could not be recorded.', 'error'); }
    setSending(null);
  };
  const confirmDelete = async () => {
    if (!deleting) return;
    try { await backendAdminService.deleteCrm(deleting.id); await load(); toast('Campaign deleted.', 'success'); }
    catch (e) { toast(e instanceof Error ? e.message : 'Campaign could not be deleted.', 'error'); }
    setDeleting(null);
  };

  const columns: Column<CrmMessage>[] = [
    { key: 'subject', header: 'Subject', width: '30%', render: (m) => <span className="admin-user-name">{m.subject}</span>, sortValue: (m) => m.subject },
    { key: 'segment', header: 'Segment', render: (m) => <span className="muted">{m.segment}</span>, sortValue: (m) => m.segment },
    { key: 'status', header: 'Status', render: (m) => <Badge tone={m.status === 'sent' ? 'accent' : 'neutral'}>{m.status}</Badge>, sortValue: (m) => m.status },
    { key: 'recipients', header: 'Audience', align: 'end', render: (m) => <span className="mono">{m.recipients.toLocaleString()}</span>, sortValue: (m) => m.recipients },
    { key: 'sentAt', header: 'Recorded', render: (m) => <span className="muted">{m.sentAt ? new Date(m.sentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Not sent'}</span>, sortValue: (m) => m.sentAt },
    {
      key: 'actions', header: '', align: 'end', width: '150px',
      render: (m) => (
        <span className="admin-row-actions">
          {m.status === 'draft' && <Button size="sm" variant="ghost" icon={<Send size={13} />} onClick={() => setSending(m)} aria-label={`Record ${m.subject} as sent`} />}
          <Button size="sm" variant="ghost" icon={<Pencil size={13} />} onClick={() => open(m)} aria-label={`Edit ${m.subject}`} />
          <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => setDeleting(m)} aria-label={`Delete ${m.subject}`} />
        </span>
      ),
    },
  ];

  return (
    <AdminPage
      title="CRM and messaging"
      sub="Announcements to player segments with live audience sizes computed from production data."
      actions={<>
        <Button variant="secondary" icon={<RotateCw size={15} />} loading={refreshing} onClick={() => void load()}>Refresh</Button>
        <Button variant="primary" icon={<Plus size={15} />} onClick={() => open('new')}>New message</Button>
      </>}
    >
      <div className="admin-notice" role="note">
        <Info size={16} className="accent" aria-hidden />
        <span>No email or push provider is connected. Campaigns are saved with live audience sizes and marked as sent when you record them, but no messages are delivered to players yet.</span>
      </div>
      {error && <p role="alert" className="muted">{error}</p>}
      {refreshing && messages.length === 0 && <div className="page"><Spinner /></div>}
      <div className="panel">
        <DataTable
          columns={columns}
          rows={messages}
          rowKey={(m) => m.id}
          searchable
          searchPlaceholder="Search subject or segment"
          searchLabel="Search messages"
          searchValue={(m) => `${m.subject} ${m.segment} ${m.status}`}
          emptyTitle="No campaigns yet"
          emptyBody="Create a message to record an announcement for a player segment."
        />
      </div>

      <Modal open={Boolean(editing)} onClose={() => { if (!busy) setEditing(null); }} title={editing === 'new' ? 'New message' : 'Edit message'} wide
        footer={<>
          <Button variant="ghost" onClick={() => setEditing(null)} disabled={busy}>Cancel</Button>
          <Button variant="secondary" loading={busy} onClick={() => void save('draft')}>Save draft</Button>
          <Button variant="primary" icon={<Send size={14} />} loading={busy} onClick={() => void save('sent')}>Record as sent</Button>
        </>}>
        <Field label="Segment" htmlFor="cm-seg" hint={`Live audience: ${audienceFor(form.segment).toLocaleString()} players`}>
          <NativeSelect id="cm-seg" value={form.segment} onChange={(e) => setForm({ ...form, segment: e.target.value })}>
            {segmentOptions.map((s) => <option key={s.segment} value={s.segment}>{s.segment} ({s.count.toLocaleString()})</option>)}
          </NativeSelect>
        </Field>
        <Field label="Subject" htmlFor="cm-sub">
          <Input id="cm-sub" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} maxLength={90} />
        </Field>
        <Field label="Body" htmlFor="cm-body">
          <Textarea id="cm-body" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={5} maxLength={5000} />
        </Field>
        {formError && <p role="alert" className="admin-form-error">{formError}</p>}
      </Modal>

      <ConfirmDialog
        open={Boolean(sending)} onClose={() => setSending(null)}
        onConfirm={() => void confirmSend()}
        title="Record campaign" body={`Record "${sending?.subject}" as sent to ${sending?.segment} (${audienceFor(sending?.segment ?? '').toLocaleString()} players)? No messages are delivered yet.`}
        confirmLabel="Record as sent"
      />
      <ConfirmDialog
        open={Boolean(deleting)} onClose={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
        title="Delete campaign" body={`Delete "${deleting?.subject}"?`}
        confirmLabel="Delete"
      />
    </AdminPage>
  );
}