import { useState } from 'react';
import { Pencil, Plus, Send, Trash2 } from 'lucide-react';
import type { CrmMessage } from '@/types';
import { useDb } from '@/hooks/useDb';
import { useToast } from '@/context/ToastContext';
import { adminService } from '@/services';
import { uid } from '@/services/db';
import { Badge, Button, ConfirmDialog, Field, Input, Modal, NativeSelect, Textarea } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable';
import { AdminPage, useAdmin } from './shared';
import { UnavailableFeature } from './UnavailableFeature';

const SEGMENTS = ['All players', 'Inactive 30 days', 'Level 10+', 'New this week', 'Guests'];

export default function Crm() {
  return <UnavailableFeature title="CRM & messaging" explanation="The inspected production schema has no CRM campaign or delivery tables. Sending local demo messages is disabled." />;
  const db = useDb();
  const { name } = useAdmin();
  const { toast } = useToast();
  const [editing, setEditing] = useState<CrmMessage | 'new' | null>(null);
  const [sending, setSending] = useState<CrmMessage | null>(null);
  const [deleting, setDeleting] = useState<CrmMessage | null>(null);
  const [form, setForm] = useState({ segment: SEGMENTS[0], subject: '', body: '' });

  const open = (m: CrmMessage | 'new') => {
    setForm(m === 'new' ? { segment: SEGMENTS[0], subject: '', body: '' } : { segment: m.segment, subject: m.subject, body: m.body });
    setEditing(m);
  };

  const save = (send: boolean) => {
    if (!editing) return;
    if (!form.subject.trim() || !form.body.trim()) { toast('Subject and body are required.', 'error'); return; }
    const message: CrmMessage = {
      id: editing === 'new' ? uid('cm') : editing.id,
      segment: form.segment,
      subject: form.subject.trim(),
      body: form.body.trim(),
      sentAt: editing === 'new' ? '' : editing.sentAt,
      recipients: editing === 'new' ? 0 : editing.recipients,
      status: editing === 'new' ? 'draft' : editing.status,
    };
    adminService.saveCrm(message, name, send);
    toast(send ? 'Message sent to the segment.' : 'Draft saved.', 'success');
    setEditing(null);
  };

  const columns: Column<CrmMessage>[] = [
    { key: 'subject', header: 'Subject', width: '30%', render: (m) => <span className="admin-user-name">{m.subject}</span>, sortValue: (m) => m.subject },
    { key: 'segment', header: 'Segment', render: (m) => <span className="muted">{m.segment}</span>, sortValue: (m) => m.segment },
    { key: 'status', header: 'Status', render: (m) => <Badge tone={m.status === 'sent' ? 'accent' : 'neutral'}>{m.status}</Badge>, sortValue: (m) => m.status },
    { key: 'recipients', header: 'Recipients', align: 'end', render: (m) => <span className="mono">{m.recipients.toLocaleString()}</span>, sortValue: (m) => m.recipients },
    { key: 'sentAt', header: 'Sent', render: (m) => <span className="muted">{m.sentAt ? new Date(m.sentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Not sent'}</span>, sortValue: (m) => m.sentAt },
    {
      key: 'actions', header: '', align: 'end', width: '150px',
      render: (m) => (
        <span className="admin-row-actions">
          {m.status === 'draft' && <Button size="sm" variant="ghost" icon={<Send size={13} />} onClick={() => setSending(m)} aria-label={`Send ${m.subject}`} />}
          <Button size="sm" variant="ghost" icon={<Pencil size={13} />} onClick={() => open(m)} aria-label={`Edit ${m.subject}`} />
          <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => setDeleting(m)} aria-label={`Delete ${m.subject}`} />
        </span>
      ),
    },
  ];

  return (
    <AdminPage
      title="CRM and messaging"
      sub="Announcements to player segments. Delivery is simulated in the demo."
      actions={<Button variant="primary" icon={<Plus size={15} />} onClick={() => open('new')}>New message</Button>}
    >
      <div className="panel">
        <DataTable
          columns={columns}
          rows={db.crm}
          rowKey={(m) => m.id}
          searchable
          searchPlaceholder="Search subject or segment"
          searchLabel="Search messages"
          searchValue={(m) => `${m.subject} ${m.segment} ${m.status}`}
          emptyTitle="No messages yet"
        />
      </div>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing === 'new' ? 'New message' : 'Edit message'} wide
        footer={<>
          <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
          <Button variant="secondary" onClick={() => save(false)}>Save draft</Button>
          <Button variant="primary" icon={<Send size={14} />} onClick={() => save(true)}>Send now</Button>
        </>}>
        <Field label="Segment" htmlFor="cm-seg">
          <NativeSelect id="cm-seg" value={form.segment} onChange={(e) => setForm({ ...form, segment: e.target.value })}>
            {SEGMENTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Subject" htmlFor="cm-sub">
          <Input id="cm-sub" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} maxLength={90} />
        </Field>
        <Field label="Body" htmlFor="cm-body">
          <Textarea id="cm-body" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={5} />
        </Field>
      </Modal>

      <ConfirmDialog
        open={Boolean(sending)} onClose={() => setSending(null)}
        onConfirm={() => { if (sending) { adminService.saveCrm(sending, name, true); toast('Message sent.', 'success'); } }}
        title="Send message" body={`Send "${sending?.subject}" to ${sending?.segment}?`}
        confirmLabel="Send"
      />
      <ConfirmDialog
        open={Boolean(deleting)} onClose={() => setDeleting(null)}
        onConfirm={() => { if (deleting) { adminService.removeCrm(deleting.id, name); toast('Message deleted.', 'success'); } }}
        title="Delete message" body={`Delete "${deleting?.subject}"?`}
        confirmLabel="Delete"
      />
    </AdminPage>
  );
}
