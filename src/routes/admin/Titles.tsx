import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import type { Title } from '@/types';
import { useDb } from '@/hooks/useDb';
import { useToast } from '@/context/ToastContext';
import { adminService } from '@/services';
import { uid } from '@/services/db';
import { TitleIcon } from '@/components/Emblems';
import { Badge, Button, ConfirmDialog, Field, Input, Modal, Switch, Textarea } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable';
import { AdminPage, useAdmin } from './shared';

export default function Titles() {
  const db = useDb();
  const { name } = useAdmin();
  const { toast } = useToast();
  const [editing, setEditing] = useState<Title | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Title | null>(null);
  const [form, setForm] = useState({ name: '', description: '', condition: '', xpReward: 50, active: true });

  const open = (t: Title | 'new') => {
    setForm(t === 'new' ? { name: '', description: '', condition: '', xpReward: 50, active: true }
      : { name: t.name, description: t.description, condition: t.condition, xpReward: t.xpReward, active: t.active });
    setEditing(t);
  };

  const save = () => {
    if (!form.name.trim() || !form.condition.trim()) { toast('Name and unlock condition are required.', 'error'); return; }
    const title: Title = {
      id: editing === 'new' ? uid('ti') : (editing as Title).id,
      name: form.name.trim(),
      description: form.description.trim(),
      condition: form.condition.trim(),
      image: editing === 'new' ? undefined : (editing as Title).image,
      xpReward: form.xpReward,
      active: form.active,
      unlocked: editing === 'new' ? false : (editing as Title).unlocked,
    };
    adminService.saveTitle(title, name);
    toast(editing === 'new' ? 'Title created.' : 'Title updated.', 'success');
    setEditing(null);
  };

  const columns: Column<Title>[] = [
    { key: 'name', header: 'Title', width: '20%', render: (t) => <span className="admin-user-name"><TitleIcon title={t} size={22} />{t.name}</span>, sortValue: (t) => t.name },
    { key: 'condition', header: 'Unlock condition', width: '30%', render: (t) => <span className="muted">{t.condition}</span> },
    { key: 'xp', header: 'XP reward', align: 'end', render: (t) => <span className="mono">{t.xpReward}</span>, sortValue: (t) => t.xpReward },
    { key: 'active', header: 'Status', render: (t) => <Badge tone={t.active ? 'accent' : 'outline'}>{t.active ? 'active' : 'hidden'}</Badge>, sortValue: (t) => (t.active ? 1 : 0) },
    {
      key: 'actions', header: '', align: 'end', width: '110px',
      render: (t) => (
        <span className="admin-row-actions">
          <Button size="sm" variant="ghost" icon={<Pencil size={13} />} onClick={() => open(t)} aria-label={`Edit ${t.name}`} />
          <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => setDeleting(t)} aria-label={`Delete ${t.name}`} />
        </span>
      ),
    },
  ];

  return (
    <AdminPage
      title="Titles"
      sub="Titles appear next to player names once unlocked."
      actions={<Button variant="primary" icon={<Plus size={15} />} onClick={() => open('new')}>New title</Button>}
    >
      <div className="panel">
        <DataTable columns={columns} rows={db.titles} rowKey={(t) => t.id} searchable
          searchPlaceholder="Search titles" searchLabel="Search titles" searchValue={(t) => `${t.name} ${t.condition}`}
          emptyTitle="No titles yet" />
      </div>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing === 'new' ? 'New title' : `Edit ${form.name}`}
        footer={<>
          <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
          <Button variant="primary" onClick={save}>Save title</Button>
        </>}>
        <Field label="Name" htmlFor="ti-name">
          <Input id="ti-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={28} />
        </Field>
        <Field label="Description" htmlFor="ti-desc">
          <Textarea id="ti-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
        </Field>
        <Field label="Unlock condition" htmlFor="ti-cond" hint="Plain language, shown in the gallery.">
          <Input id="ti-cond" value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })} placeholder="Win 100 matches" />
        </Field>
        <Field label="XP reward" htmlFor="ti-xp">
          <Input id="ti-xp" type="number" min={0} max={1000} value={form.xpReward}
            onChange={(e) => setForm({ ...form, xpReward: Math.max(0, Number(e.target.value) || 0) })} />
        </Field>
        <Switch checked={form.active} onChange={(v) => setForm({ ...form, active: v })} label="Active" description="Hidden titles stay earned but cannot be equipped." />
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)} onClose={() => setDeleting(null)}
        onConfirm={() => { if (deleting) { adminService.removeTitle(deleting.id, name); toast('Title deleted.', 'success'); } }}
        title="Delete title" body={`Delete "${deleting?.name}"? Players wearing it lose the title.`}
        confirmLabel="Delete"
      />
    </AdminPage>
  );
}