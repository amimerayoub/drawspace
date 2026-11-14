import { useState } from 'react';
import { Pencil, Plus, Save, Trash2 } from 'lucide-react';
import type { RedirectRule, SeoRecord } from '@/types';
import { useDb } from '@/hooks/useDb';
import { useToast } from '@/context/ToastContext';
import { adminService } from '@/services';
import { uid } from '@/services/db';
import { Badge, Button, ConfirmDialog, Field, Input, Modal, NativeSelect, Tabs, Textarea } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable';
import { AdminPage, useAdmin } from './shared';
import { UnavailableFeature } from './UnavailableFeature';

const emptySeo: SeoRecord = { route: '', title: '', description: '', canonical: '', ogTitle: '', ogDescription: '', robots: 'index', structuredData: '' };

export default function Seo() {
  return <UnavailableFeature title="SEO & redirects" explanation="The inspected schema has no SEO or redirect tables. Local demo metadata and redirect changes are disabled." />;
  const db = useDb();
  const { name } = useAdmin();
  const { toast } = useToast();
  const [tab, setTab] = useState('pages');
  const [editing, setEditing] = useState<SeoRecord | 'new' | null>(null);
  const [form, setForm] = useState<SeoRecord>(emptySeo);
  const [redirect, setRedirect] = useState<RedirectRule | 'new' | null>(null);
  const [rForm, setRForm] = useState({ from: '', to: '', code: 301 as 301 | 302 });
  const [deletingRedirect, setDeletingRedirect] = useState<RedirectRule | null>(null);

  const openSeo = (r: SeoRecord | 'new') => {
    setForm(r === 'new' ? { ...emptySeo, canonical: 'https://drawspace.cloud/' } : { ...r });
    setEditing(r);
  };

  const saveSeo = () => {
    if (!form.route.trim().startsWith('/')) { toast('Route must start with /.', 'error'); return; }
    if (!form.title.trim() || !form.description.trim()) { toast('Title and description are required.', 'error'); return; }
    if (form.structuredData.trim()) {
      try { JSON.parse(form.structuredData); } catch { toast('Structured data is not valid JSON.', 'error'); return; }
    }
    adminService.saveSeo({ ...form, route: form.route.trim() }, name);
    toast('SEO record saved.', 'success');
    setEditing(null);
  };

  const openRedirect = (r: RedirectRule | 'new') => {
    setRForm(r === 'new' ? { from: '', to: '', code: 301 } : { from: r.from, to: r.to, code: r.code });
    setRedirect(r);
  };

  const saveRedirect = () => {
    if (!rForm.from.startsWith('/') || !rForm.to.startsWith('/')) { toast('Both paths must start with /.', 'error'); return; }
    adminService.saveRedirect({
      id: redirect === 'new' ? uid('rd') : (redirect as RedirectRule).id,
      from: rForm.from.trim(), to: rForm.to.trim(), code: rForm.code,
      hits: redirect === 'new' ? 0 : (redirect as RedirectRule).hits,
    }, name);
    toast('Redirect saved.', 'success');
    setRedirect(null);
  };

  const seoColumns: Column<SeoRecord>[] = [
    { key: 'route', header: 'Route', width: '16%', render: (r) => <span className="mono">{r.route}</span>, sortValue: (r) => r.route },
    { key: 'title', header: 'Title', width: '28%', render: (r) => <span className="admin-user-name">{r.title}</span>, sortValue: (r) => r.title },
    { key: 'description', header: 'Description', render: (r) => <span className="muted admin-clamp">{r.description}</span> },
    { key: 'robots', header: 'Robots', render: (r) => <Badge tone={r.robots === 'index' ? 'neutral' : 'outline'}>{r.robots}</Badge>, sortValue: (r) => r.robots },
    {
      key: 'actions', header: '', align: 'end', width: '70px',
      render: (r) => <Button size="sm" variant="ghost" icon={<Pencil size={13} />} onClick={() => openSeo(r)} aria-label={`Edit SEO for ${r.route}`} />,
    },
  ];

  const redirectColumns: Column<RedirectRule>[] = [
    { key: 'from', header: 'From', width: '26%', render: (r) => <span className="mono">{r.from}</span>, sortValue: (r) => r.from },
    { key: 'to', header: 'To', width: '26%', render: (r) => <span className="mono">{r.to}</span>, sortValue: (r) => r.to },
    { key: 'code', header: 'Code', render: (r) => <Badge tone="neutral">{r.code}</Badge>, sortValue: (r) => r.code },
    { key: 'hits', header: 'Hits', align: 'end', render: (r) => <span className="mono">{r.hits}</span>, sortValue: (r) => r.hits },
    {
      key: 'actions', header: '', align: 'end', width: '110px',
      render: (r) => (
        <span className="admin-row-actions">
          <Button size="sm" variant="ghost" icon={<Pencil size={13} />} onClick={() => openRedirect(r)} aria-label={`Edit redirect ${r.from}`} />
          <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => setDeletingRedirect(r)} aria-label={`Delete redirect ${r.from}`} />
        </span>
      ),
    },
  ];

  return (
    <AdminPage title="SEO" sub="Metadata per route, redirect rules, and crawler files.">
      <Tabs
        tabs={[{ id: 'pages', label: 'Page metadata', count: db.seo.length }, { id: 'redirects', label: 'Redirects', count: db.redirects.length }, { id: 'files', label: 'Crawler files' }]}
        active={tab} onChange={setTab} label="SEO sections"
      />
      {tab === 'pages' && (
        <div className="panel">
          <DataTable columns={seoColumns} rows={db.seo} rowKey={(r) => r.route}
            toolbar={<Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => openSeo('new')}>Add route</Button>}
            emptyTitle="No routes configured" />
        </div>
      )}
      {tab === 'redirects' && (
        <div className="panel">
          <DataTable columns={redirectColumns} rows={db.redirects} rowKey={(r) => r.id}
            toolbar={<Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => openRedirect('new')}>Add redirect</Button>}
            emptyTitle="No redirects" />
        </div>
      )}
      {tab === 'files' && (
        <div className="admin-grid-2">
          <div className="panel panel-pad">
            <h2 className="admin-panel-title">robots.txt</h2>
            <pre className="admin-code-block mono">{`User-agent: *\n${db.seo.some((s) => s.robots === 'noindex') ? `Disallow: ${db.seo.filter((s) => s.robots === 'noindex').map((s) => s.route).join(', ')}` : 'Allow: /'}\nSitemap: https://drawspace.cloud/sitemap.xml`}</pre>
            <p className="faint admin-field-hint">Generated from the robots setting on each route.</p>
          </div>
          <div className="panel panel-pad">
            <h2 className="admin-panel-title">sitemap.xml</h2>
            <pre className="admin-code-block mono">{db.seo.filter((s) => s.robots === 'index').map((s) => s.canonical || `https://drawspace.cloud${s.route}`).join('\n')}</pre>
            <p className="faint admin-field-hint">Indexable routes only. Updated whenever metadata changes.</p>
          </div>
        </div>
      )}

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add route metadata' : `SEO for ${form.route}`} wide
        footer={<>
          <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
          <Button variant="primary" icon={<Save size={14} />} onClick={saveSeo}>Save</Button>
        </>}>
        <div className="admin-form-grid">
          <Field label="Route" htmlFor="seo-route">
            <Input id="seo-route" value={form.route} onChange={(e) => setForm({ ...form, route: e.target.value })} placeholder="/play" disabled={editing !== 'new'} />
          </Field>
          <Field label="Robots" htmlFor="seo-robots">
            <NativeSelect id="seo-robots" value={form.robots} onChange={(e) => setForm({ ...form, robots: e.target.value as SeoRecord['robots'] })}>
              <option value="index">index</option>
              <option value="noindex">noindex</option>
            </NativeSelect>
          </Field>
        </div>
        <Field label="Title" htmlFor="seo-title">
          <Input id="seo-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={70} />
        </Field>
        <Field label="Description" htmlFor="seo-desc">
          <Textarea id="seo-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} maxLength={170} />
        </Field>
        <Field label="Canonical URL" htmlFor="seo-can">
          <Input id="seo-can" value={form.canonical} onChange={(e) => setForm({ ...form, canonical: e.target.value })} />
        </Field>
        <div className="admin-form-grid">
          <Field label="Open Graph title" htmlFor="seo-ogt">
            <Input id="seo-ogt" value={form.ogTitle} onChange={(e) => setForm({ ...form, ogTitle: e.target.value })} />
          </Field>
          <Field label="Open Graph description" htmlFor="seo-ogd">
            <Input id="seo-ogd" value={form.ogDescription} onChange={(e) => setForm({ ...form, ogDescription: e.target.value })} />
          </Field>
        </div>
        <Field label="Structured data (JSON-LD)" htmlFor="seo-json" hint="Optional. Validated as JSON on save.">
          <Textarea id="seo-json" className="mono" value={form.structuredData} onChange={(e) => setForm({ ...form, structuredData: e.target.value })} rows={3} />
        </Field>
      </Modal>

      <Modal open={Boolean(redirect)} onClose={() => setRedirect(null)} title={redirect === 'new' ? 'Add redirect' : 'Edit redirect'}
        footer={<>
          <Button variant="ghost" onClick={() => setRedirect(null)}>Cancel</Button>
          <Button variant="primary" onClick={saveRedirect}>Save redirect</Button>
        </>}>
        <Field label="From" htmlFor="rd-from">
          <Input id="rd-from" value={rForm.from} onChange={(e) => setRForm({ ...rForm, from: e.target.value })} placeholder="/old-page" />
        </Field>
        <Field label="To" htmlFor="rd-to">
          <Input id="rd-to" value={rForm.to} onChange={(e) => setRForm({ ...rForm, to: e.target.value })} placeholder="/play" />
        </Field>
        <Field label="Status code" htmlFor="rd-code">
          <NativeSelect id="rd-code" value={String(rForm.code)} onChange={(e) => setRForm({ ...rForm, code: Number(e.target.value) as 301 | 302 })}>
            <option value="301">301 (permanent)</option>
            <option value="302">302 (temporary)</option>
          </NativeSelect>
        </Field>
      </Modal>

      <ConfirmDialog
        open={Boolean(deletingRedirect)} onClose={() => setDeletingRedirect(null)}
        onConfirm={() => { if (deletingRedirect) { adminService.removeRedirect(deletingRedirect.id, name); toast('Redirect deleted.', 'success'); } }}
        title="Delete redirect" body={`Delete the redirect from ${deletingRedirect?.from}?`}
        confirmLabel="Delete"
      />
    </AdminPage>
  );
}
