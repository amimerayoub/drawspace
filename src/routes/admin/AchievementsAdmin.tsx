import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import type { Achievement } from '@/types';
import { useDb } from '@/hooks/useDb';
import { useToast } from '@/context/ToastContext';
import { adminService } from '@/services';
import { uid } from '@/services/db';
import { AchievementIcon } from '@/components/Emblems';
import { Badge, Button, ConfirmDialog, Field, Input, Modal, NativeSelect, Switch, Textarea } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable';
import { AdminPage, useAdmin } from './shared';

const ICONS = ['sparkles', 'eye', 'target', 'pen', 'palette', 'trophy', 'medal', 'zap', 'calendar', 'users', 'book', 'trending'];

export default function AchievementsAdmin() {
  const db = useDb();
  const { name } = useAdmin();
  const { toast } = useToast();
  const [editing, setEditing] = useState<Achievement | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Achievement | null>(null);
  const [form, setForm] = useState({ name: '', description: '', condition: '', icon: 'sparkles', xpReward: 100, goal: 10, active: true });

  const open = (a: Achievement | 'new') => {
    setForm(a === 'new' ? { name: '', description: '', condition: '', icon: 'sparkles', xpReward: 100, goal: 10, active: true }
      : { name: a.name, description: a.description, condition: a.condition, icon: a.icon, xpReward: a.xpReward, goal: a.goal ?? 10, active: a.active });
    setEditing(a);
  };

  const save = () => {
    if (!form.name.trim() || !form.condition.trim()) { toast('Name and unlock condition are required.', 'error'); return; }
    const achievement: Achievement = {
      id: editing === 'new' ? uid('ac') : (editing as Achievement).id,
      name: form.name.trim(),
      description: form.description.trim(),
      condition: form.condition.trim(),
      icon: form.icon,
      image: editing === 'new' ? undefined : (editing as Achievement).image,
      xpReward: form.xpReward,
      goal: form.goal,
      active: form.active,
      unlockedAt: editing === 'new' ? undefined : (editing as Achievement).unlockedAt,
      progress: editing === 'new' ? 0 : (editing as Achievement).progress,
    };
    adminService.saveAchievement(achievement, name);
    toast(editing === 'new' ? 'Achievement created.' : 'Achievement updated.', 'success');
    setEditing(null);
  };

  const columns: Column<Achievement>[] = [
    { key: 'name', header: 'Achievement', width: '22%', render: (a) => <span className="admin-user-name"><AchievementIcon achievement={a} size={28} />{a.name}</span>, sortValue: (a) => a.name },
    { key: 'condition', header: 'Condition', width: '30%', render: (a) => <span className="muted">{a.condition}</span> },
    { key: 'goal', header: 'Goal', align: 'end', render: (a) => <span className="mono">{a.goal ?? 1}</span>, sortValue: (a) => a.goal ?? 1 },
    { key: 'xp', header: 'XP reward', align: 'end', render: (a) => <span className="mono">{a.xpReward}</span>, sortValue: (a) => a.xpReward },
    { key: 'active', header: 'Status', render: (a) => <Badge tone={a.active ? 'accent' : 'outline'}>{a.active ? 'active' : 'hidden'}</Badge>, sortValue: (a) => (a.active ? 1 : 0) },
    {
      key: 'actions', header: '', align: 'end', width: '110px',
      render: (a) => (
        <span className="admin-row-actions">
          <Button size="sm" variant="ghost" icon={<Pencil size={13} />} onClick={() => open(a)} aria-label={`Edit ${a.name}`} />
          <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => setDeleting(a)} aria-label={`Delete ${a.name}`} />
        </span>
      ),
    },
  ];

  return (
    <AdminPage
      title="Achievements"
      sub="One-time goals with an XP reward. Progress is tracked per player."
      actions={<Button variant="primary" icon={<Plus size={15} />} onClick={() => open('new')}>New achievement</Button>}
    >
      <div className="panel">
        <DataTable columns={columns} rows={db.achievements} rowKey={(a) => a.id} searchable
          searchPlaceholder="Search achievements" searchLabel="Search achievements" searchValue={(a) => `${a.name} ${a.condition}`}
          emptyTitle="No achievements yet" />
      </div>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing === 'new' ? 'New achievement' : `Edit ${form.name}`}
        footer={<>
          <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
          <Button variant="primary" onClick={save}>Save achievement</Button>
        </>}>
        <Field label="Name" htmlFor="ac-name">
          <Input id="ac-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={32} />
        </Field>
        <Field label="Description" htmlFor="ac-desc">
          <Textarea id="ac-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
        </Field>
        <div className="admin-form-grid">
          <Field label="Condition" htmlFor="ac-cond">
            <Input id="ac-cond" value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })} placeholder="Guess 250 words" />
          </Field>
          <Field label="Icon" htmlFor="ac-icon">
            <NativeSelect id="ac-icon" value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })}>
              {ICONS.map((i) => <option key={i} value={i}>{i}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Goal" htmlFor="ac-goal" hint="Target count for the progress bar.">
            <Input id="ac-goal" type="number" min={1} max={10000} value={form.goal}
              onChange={(e) => setForm({ ...form, goal: Math.max(1, Number(e.target.value) || 1) })} />
          </Field>
          <Field label="XP reward" htmlFor="ac-xp">
            <Input id="ac-xp" type="number" min={0} max={5000} value={form.xpReward}
              onChange={(e) => setForm({ ...form, xpReward: Math.max(0, Number(e.target.value) || 0) })} />
          </Field>
        </div>
        <Switch checked={form.active} onChange={(v) => setForm({ ...form, active: v })} label="Active" description="Hidden achievements stop tracking progress." />
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)} onClose={() => setDeleting(null)}
        onConfirm={() => { if (deleting) { adminService.removeAchievement(deleting.id, name); toast('Achievement deleted.', 'success'); } }}
        title="Delete achievement" body={`Delete "${deleting?.name}"?`}
        confirmLabel="Delete"
      />
    </AdminPage>
  );
}