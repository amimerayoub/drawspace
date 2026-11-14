import { useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import type { AdPlacement, AdUnit } from '@/types';
import { useToast } from '@/context/ToastContext';
import { backendAdminService } from '@/services/backendAdmin.service';
import { Badge, Button, ConfirmDialog, Field, Input, Modal, NativeSelect, Switch, Textarea } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable';
import { AdminPage } from './shared';

type Device = 'desktop' | 'mobile' | 'tablet';
const DEVICES: Device[] = ['desktop', 'mobile', 'tablet'];

export default function Ads() {
  const { toast } = useToast();
  const [ads, setAds] = useState<AdUnit[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { void backendAdminService.ads().then(setAds).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Advertisements could not be loaded.')); }, []);
  const [editing, setEditing] = useState<AdUnit | 'new' | null>(null);
  const [deleting, setDeleting] = useState<AdUnit | null>(null);
  const [form, setForm] = useState({
    name: '', placement: 'landing' as AdPlacement, enabled: true,
    devices: ['desktop', 'mobile', 'tablet'] as Device[],
    startDate: '', endDate: '', priority: 1, body: '',
  });

  const open = (a: AdUnit | 'new') => {
    const today = new Date().toISOString().slice(0, 10);
    const month = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    setForm(a === 'new'
      ? { name: '', placement: 'landing', enabled: true, devices: [...DEVICES], startDate: today, endDate: month, priority: 1, body: '' }
      : { name: a.name, placement: a.placement, enabled: a.enabled, devices: [...a.devices], startDate: a.startDate, endDate: a.endDate, priority: a.priority, body: a.body });
    setEditing(a);
  };

  const toggleDevice = (d: Device) => {
    setForm((f) => ({ ...f, devices: f.devices.includes(d) ? f.devices.filter((x) => x !== d) : [...f.devices, d] }));
  };

  const save = async () => {
    if (!form.name.trim() || !form.body.trim()) { toast('Name and ad copy are required.', 'error'); return; }
    if (form.devices.length === 0) { toast('Pick at least one device.', 'error'); return; }
    if (form.endDate < form.startDate) { toast('End date must be after the start date.', 'error'); return; }
    const ad: AdUnit = {
      id: editing === 'new' ? crypto.randomUUID() : (editing as AdUnit).id,
      name: form.name.trim(),
      placement: form.placement,
      enabled: form.enabled,
      devices: form.devices,
      startDate: form.startDate,
      endDate: form.endDate,
      priority: form.priority,
      body: form.body.trim(),
    };
    try { await backendAdminService.saveAd(ad); setAds((current) => editing === 'new' ? [ad, ...current] : current.map((item) => item.id === ad.id ? ad : item)); toast('Ad unit saved. Device targeting is not available in the production schema.', 'success'); setEditing(null); }
    catch (e) { toast(e instanceof Error ? e.message : 'Ad unit could not be saved.', 'error'); }
  };
  const toggle = async (ad: AdUnit) => { try { const updated = { ...ad, enabled: !ad.enabled }; await backendAdminService.saveAd(updated); setAds((current) => current.map((item) => item.id === ad.id ? updated : item)); toast(updated.enabled ? 'Ad enabled.' : 'Ad paused.', 'success'); } catch (e) { toast(e instanceof Error ? e.message : 'Ad status could not be changed.', 'error'); } };

  const columns: Column<AdUnit>[] = [
    { key: 'name', header: 'Unit', width: '24%', render: (a) => <span className="admin-user-name">{a.name}</span>, sortValue: (a) => a.name },
    { key: 'placement', header: 'Placement', render: (a) => <Badge tone="neutral">{a.placement}</Badge>, sortValue: (a) => a.placement },
    { key: 'devices', header: 'Devices', render: (a) => <span className="muted">{a.devices.join(', ')}</span> },
    { key: 'dates', header: 'Schedule', render: (a) => <span className="muted mono">{a.startDate} to {a.endDate}</span>, sortValue: (a) => a.startDate },
    { key: 'priority', header: 'Priority', align: 'end', render: (a) => <span className="mono">{a.priority}</span>, sortValue: (a) => a.priority },
    {
      key: 'enabled', header: 'Live', align: 'center',
      render: (a) => <Switch checked={a.enabled} onChange={() => void toggle(a)} label={`Toggle ${a.name}`} />,
      sortValue: (a) => (a.enabled ? 1 : 0),
    },
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
      title="Ads"
      sub="Ads appear on the landing page and blog only. The game canvas and rooms never show ads."
      actions={<Button variant="primary" icon={<Plus size={15} />} onClick={() => open('new')}>New ad unit</Button>}
    >
      {error && <p role="alert" className="muted">{error}</p>}
      <div className="panel">
        <DataTable columns={columns} rows={ads} rowKey={(a) => a.id} searchable
          searchPlaceholder="Search ad units" searchLabel="Search ads" searchValue={(a) => `${a.name} ${a.placement}`}
          emptyTitle="No ad units" />
      </div>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing === 'new' ? 'New ad unit' : `Edit ${form.name}`} wide
        footer={<>
          <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
          <Button variant="primary" onClick={() => void save()}>Save ad unit</Button>
        </>}>
        <div className="admin-form-grid">
          <Field label="Name" htmlFor="ad-name" hint="Internal label, not shown to players.">
            <Input id="ad-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Placement" htmlFor="ad-place">
            <NativeSelect id="ad-place" value={form.placement} onChange={(e) => setForm({ ...form, placement: e.target.value as AdPlacement })}>
              <option value="landing">Landing page</option>
              <option value="blog">Blog</option>
            </NativeSelect>
          </Field>
          <Field label="Start date" htmlFor="ad-start">
            <Input id="ad-start" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </Field>
          <Field label="End date" htmlFor="ad-end">
            <Input id="ad-end" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          </Field>
          <Field label="Priority" htmlFor="ad-prio" hint="Lower numbers win when units overlap.">
            <Input id="ad-prio" type="number" min={1} max={99} value={form.priority}
              onChange={(e) => setForm({ ...form, priority: Math.max(1, Number(e.target.value) || 1) })} />
          </Field>
        </div>
        <Field label="Devices">
          <div className="admin-device-row">
            {DEVICES.map((d) => (
              <button key={d} type="button" className={`segment ${form.devices.includes(d) ? 'active' : ''}`}
                aria-pressed={form.devices.includes(d)} onClick={() => toggleDevice(d)}>
                {d}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Ad copy" htmlFor="ad-body" hint="Short text shown in the slot.">
          <Textarea id="ad-body" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={2} maxLength={160} />
        </Field>
        <div className="admin-ad-preview">
          <p className="admin-form-label">Preview</p>
          <div className="ad-slot">
            <span className="ad-label">Sponsored</span>
            <p>{form.body || 'Ad copy appears here.'}</p>
          </div>
        </div>
        <Switch checked={form.enabled} onChange={(v) => setForm({ ...form, enabled: v })} label="Enabled" description="Disabled units never render, even inside their schedule." />
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)} onClose={() => setDeleting(null)}
        onConfirm={() => { if (deleting) void backendAdminService.deleteAd(deleting.id).then(() => { setAds((current) => current.filter((ad) => ad.id !== deleting.id)); setDeleting(null); toast('Ad unit deleted.', 'success'); }).catch((e: unknown) => toast(e instanceof Error ? e.message : 'Ad unit could not be deleted.', 'error')); }}
        title="Delete ad unit" body={`Delete "${deleting?.name}"?`}
        confirmLabel="Delete"
      />
    </AdminPage>
  );
}
