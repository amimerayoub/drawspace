import { useState } from 'react';
import { ArrowDown, ArrowUp, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import type { AvatarDef } from '@/types';
import { useDb } from '@/hooks/useDb';
import { useToast } from '@/context/ToastContext';
import { adminService } from '@/services';
import { uid } from '@/services/db';
import { Avatar, Shape } from '@/components/Avatar';
import { Badge, Button, ConfirmDialog, Field, IconButton, Input, Modal, Switch } from '@/components/ui';
import { AdminPage, useAdmin } from './shared';

export default function Avatars() {
  const db = useDb();
  const { name } = useAdmin();
  const { toast } = useToast();
  const [editing, setEditing] = useState<AvatarDef | 'new' | null>(null);
  const [deleting, setDeleting] = useState<AvatarDef | null>(null);
  const [form, setForm] = useState({ name: '', shape: 0, enabled: true });

  const avatars = [...db.avatars].sort((a, b) => a.order - b.order);

  const open = (a: AvatarDef | 'new') => {
    setForm(a === 'new' ? { name: '', shape: db.avatars.length % 12, enabled: true } : { name: a.name, shape: a.shape, enabled: a.enabled });
    setEditing(a);
  };

  const save = () => {
    if (!form.name.trim()) { toast('Give the avatar a name.', 'error'); return; }
    const avatar: AvatarDef = {
      id: editing === 'new' ? uid('av') : (editing as AvatarDef).id,
      name: form.name.trim(),
      shape: form.shape,
      image: editing === 'new' ? undefined : (editing as AvatarDef).image,
      enabled: form.enabled,
      isDefault: editing === 'new' ? false : (editing as AvatarDef).isDefault,
      order: editing === 'new' ? db.avatars.length : (editing as AvatarDef).order,
    };
    adminService.saveAvatar(avatar, name);
    toast(editing === 'new' ? 'Avatar added.' : 'Avatar updated.', 'success');
    setEditing(null);
  };

  return (
    <AdminPage
      title="Avatar library"
      sub="Players pick from this library. Custom uploads are not supported."
      actions={<Button variant="primary" icon={<Plus size={15} />} onClick={() => open('new')}>Add avatar</Button>}
    >
      <div className="admin-avatar-grid">
        {avatars.map((a, i) => (
          <div key={a.id} className={`panel admin-avatar-card ${a.enabled ? '' : 'disabled'}`}>
            <Avatar avatarId={a.id} size={56} />
            <span className="admin-avatar-name">{a.name}</span>
            <span className="admin-avatar-badges">
              {a.isDefault && <Badge tone="accent">default</Badge>}
              {!a.enabled && <Badge tone="outline">hidden</Badge>}
            </span>
            <div className="admin-row-actions">
              <IconButton label={`Move ${a.name} earlier`} disabled={i === 0} onClick={() => adminService.moveAvatar(a.id, -1)}><ArrowUp size={14} /></IconButton>
              <IconButton label={`Move ${a.name} later`} disabled={i === avatars.length - 1} onClick={() => adminService.moveAvatar(a.id, 1)}><ArrowDown size={14} /></IconButton>
              <IconButton label={`Make ${a.name} the default`} onClick={() => { adminService.setDefaultAvatar(a.id, name); toast(`${a.name} is the default avatar.`, 'success'); }}><Star size={14} /></IconButton>
              <IconButton label={`Edit ${a.name}`} onClick={() => open(a)}><Pencil size={14} /></IconButton>
              <IconButton label={`Delete ${a.name}`} onClick={() => setDeleting(a)}><Trash2 size={14} /></IconButton>
            </div>
          </div>
        ))}
      </div>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add avatar' : `Edit ${form.name}`}
        footer={<>
          <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
          <Button variant="primary" onClick={save}>Save</Button>
        </>}>
        <div className="admin-avatar-preview">
          <span className="avatar" style={{ width: 72, height: 72 }}>
            <svg viewBox="0 0 48 48" width={72} height={72} aria-hidden><Shape shape={form.shape} /></svg>
          </span>
          <span className="faint">Shape {form.shape} of the geometric set</span>
        </div>
        <Field label="Name" htmlFor="av-name">
          <Input id="av-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={24} />
        </Field>
        <Field label="Shape" htmlFor="av-shape" hint="0 to 11. Each number is a different geometric mark.">
          <Input id="av-shape" type="number" min={0} max={11} value={form.shape}
            onChange={(e) => setForm({ ...form, shape: Math.min(11, Math.max(0, Number(e.target.value) || 0)) })} />
        </Field>
        <Switch checked={form.enabled} onChange={(v) => setForm({ ...form, enabled: v })} label="Visible to players" description="Hidden avatars stay assigned to existing players but cannot be picked." />
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)} onClose={() => setDeleting(null)}
        onConfirm={() => { if (deleting) { adminService.removeAvatar(deleting.id, name); toast('Avatar deleted.', 'success'); } }}
        title="Delete avatar" body={`Delete ${deleting?.name}? Players using it fall back to the default.`}
        confirmLabel="Delete"
      />
    </AdminPage>
  );
}