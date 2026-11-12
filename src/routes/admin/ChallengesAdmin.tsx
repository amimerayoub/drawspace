import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import type { Challenge, ChallengePeriod } from '@/types';
import { useDb } from '@/hooks/useDb';
import { useToast } from '@/context/ToastContext';
import { adminService } from '@/services';
import { uid } from '@/services/db';
import { Badge, Button, ConfirmDialog, Field, Input, Modal, NativeSelect, Switch, Textarea } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable';
import { AdminPage, useAdmin } from './shared';

const PERIODS: ChallengePeriod[] = ['daily', 'weekly', 'special'];

function toDateInput(iso: string) { return iso ? iso.slice(0, 10) : ''; }

export default function ChallengesAdmin() {
  const db = useDb();
  const { name } = useAdmin();
  const { toast } = useToast();
  const [editing, setEditing] = useState<Challenge | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Challenge | null>(null);
  const [form, setForm] = useState({ name: '', description: '', period: 'daily' as ChallengePeriod, objective: 5, xpReward: 100, startsAt: '', endsAt: '', active: true });

  const open = (c: Challenge | 'new') => {
    if (c === 'new') {
      const today = new Date();
      const week = new Date(today.getTime() + 7 * 86400000);
      setForm({ name: '', description: '', period: 'daily', objective: 5, xpReward: 100, startsAt: toDateInput(today.toISOString()), endsAt: toDateInput(week.toISOString()), active: true });
    } else {
      setForm({ name: c.name, description: c.description, period: c.period, objective: c.objective, xpReward: c.xpReward, startsAt: toDateInput(c.startsAt), endsAt: toDateInput(c.endsAt), active: c.active });
    }
    setEditing(c);
  };

  const save = () => {
    if (!form.name.trim()) { toast('Give the challenge a name.', 'error'); return; }
    if (form.endsAt <= form.startsAt) { toast('End date must be after the start date.', 'error'); return; }
    const challenge: Challenge = {
      id: editing === 'new' ? uid('ch') : (editing as Challenge).id,
      name: form.name.trim(),
      description: form.description.trim(),
      period: form.period,
      objective: form.objective,
      xpReward: form.xpReward,
      startsAt: new Date(`${form.startsAt}T00:00:00Z`).toISOString(),
      endsAt: new Date(`${form.endsAt}T23:59:59Z`).toISOString(),
      active: form.active,
      progress: editing === 'new' ? 0 : (editing as Challenge).progress,
      claimed: editing === 'new' ? false : (editing as Challenge).claimed,
    };
    adminService.saveChallenge(challenge, name);
    toast(editing === 'new' ? 'Challenge created.' : 'Challenge updated.', 'success');
    setEditing(null);
  };

  const columns: Column<Challenge>[] = [
    { key: 'name', header: 'Challenge', width: '24%', render: (c) => <span className="admin-user-name">{c.name}</span>, sortValue: (c) => c.name },
    { key: 'period', header: 'Period', render: (c) => <Badge tone={c.period === 'special' ? 'accent' : 'neutral'}>{c.period}</Badge>, sortValue: (c) => c.period },
    { key: 'objective', header: 'Objective', align: 'end', render: (c) => <span className="mono">{c.objective}</span>, sortValue: (c) => c.objective },
    { key: 'xp', header: 'XP reward', align: 'end', render: (c) => <span className="mono">{c.xpReward}</span>, sortValue: (c) => c.xpReward },
    { key: 'ends', header: 'Ends', render: (c) => <span className="muted">{new Date(c.endsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>, sortValue: (c) => c.endsAt },
    { key: 'active', header: 'Status', render: (c) => <Badge tone={c.active ? 'accent' : 'outline'}>{c.active ? 'active' : 'hidden'}</Badge>, sortValue: (c) => (c.active ? 1 : 0) },
    {
      key: 'actions', header: '', align: 'end', width: '110px',
      render: (c) => (
        <span className="admin-row-actions">
          <Button size="sm" variant="ghost" icon={<Pencil size={13} />} onClick={() => open(c)} aria-label={`Edit ${c.name}`} />
          <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => setDeleting(c)} aria-label={`Delete ${c.name}`} />
        </span>
      ),
    },
  ];

  return (
    <AdminPage
      title="Challenges"
      sub="Daily, weekly, and special challenges. Rewards are claimed by players."
      actions={<Button variant="primary" icon={<Plus size={15} />} onClick={() => open('new')}>New challenge</Button>}
    >
      <div className="panel">
        <DataTable columns={columns} rows={db.challenges} rowKey={(c) => c.id} searchable
          searchPlaceholder="Search challenges" searchLabel="Search challenges" searchValue={(c) => `${c.name} ${c.period}`}
          emptyTitle="No challenges yet" />
      </div>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing === 'new' ? 'New challenge' : `Edit ${form.name}`}
        footer={<>
          <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
          <Button variant="primary" onClick={save}>Save challenge</Button>
        </>}>
        <Field label="Name" htmlFor="ch-name">
          <Input id="ch-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={40} />
        </Field>
        <Field label="Description" htmlFor="ch-desc">
          <Textarea id="ch-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
        </Field>
        <div className="admin-form-grid">
          <Field label="Period" htmlFor="ch-period">
            <NativeSelect id="ch-period" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value as ChallengePeriod })}>
              {PERIODS.map((p) => <option key={p} value={p}>{p}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Objective" htmlFor="ch-obj" hint="Count players must reach.">
            <Input id="ch-obj" type="number" min={1} max={1000} value={form.objective}
              onChange={(e) => setForm({ ...form, objective: Math.max(1, Number(e.target.value) || 1) })} />
          </Field>
          <Field label="XP reward" htmlFor="ch-xp">
            <Input id="ch-xp" type="number" min={0} max={5000} value={form.xpReward}
              onChange={(e) => setForm({ ...form, xpReward: Math.max(0, Number(e.target.value) || 0) })} />
          </Field>
          <Field label="Starts" htmlFor="ch-start">
            <Input id="ch-start" type="date" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
          </Field>
          <Field label="Ends" htmlFor="ch-end">
            <Input id="ch-end" type="date" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
          </Field>
        </div>
        <Switch checked={form.active} onChange={(v) => setForm({ ...form, active: v })} label="Active" description="Hidden challenges do not appear for players." />
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)} onClose={() => setDeleting(null)}
        onConfirm={() => { if (deleting) { adminService.removeChallenge(deleting.id, name); toast('Challenge deleted.', 'success'); } }}
        title="Delete challenge" body={`Delete "${deleting?.name}"? Unclaimed rewards are lost.`}
        confirmLabel="Delete"
      />
    </AdminPage>
  );
}