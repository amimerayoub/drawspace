import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Pencil, Plus, RotateCw, Save, Trash2 } from 'lucide-react';
import type { RedirectRule, SeoRecord } from '@/types';
import { useToast } from '@/context/ToastContext';
import { backendAdminService } from '@/services/backendAdmin.service';
import { baseUrl } from '@/services/apiClient';
import { Badge, Button, ConfirmDialog, Field, Input, Modal, NativeSelect, Spinner, Tabs, Textarea } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable';
import { AdminPage, NoAccess, useAdmin } from './shared';

const emptySeo: SeoRecord = { route: '', title: '', description: '', canonical: '', ogTitle: '', ogDescription: '', robots: 'index', structuredData: '' };

export default function Seo() {
  const { can } = useAdmin();
  const { toast } = useToast();
  const [tab, setTab] = useState('pages');
  const [records, setRecords] = useState<SeoRecord[]>([]);
  const [redirects, setRedirects] = useState<RedirectRule[]>([]);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<SeoRecord | 'new' | null>(null);
  const [form, setForm] = useState<SeoRecord>(emptySeo);
  const [redirect, setRedirect] = useState<RedirectRule | 'new' | null>(null);
  const [rForm, setRForm] = useState({ from: '', to: '', code: 301 as 301 | 302 });
  const [deletingRedirect, setDeletingRedirect] = useState<RedirectRule | null>(null);
  const [deletingSeo, setDeletingSeo] = useState<SeoRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setRefreshing(true);
    try { const [seo, rd] = await Promise.all([backendAdminService.seo(), backendAdminService.redirects()]); setRecords(seo); setRedirects(rd); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'SEO data could not be loaded.'); }
    finally { setRefreshing(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (!can('content.seo')) return <NoAccess />;

  const openSeo = (r: SeoRecord | 'new') => { setForm(r === 'new' ? { ...emptySeo, canonical: `${baseUrl}/` } : { ...r }); setFormError(''); setEditing(r); };
  const openRedirect = (r: RedirectRule | 'new') => { setRForm(r === 'new' ? { from: '', to: '', code: 301 } : { from: r.from, to: r.to, code: r.code }); setFormError(''); setRedirect(r); };

  const saveSeo = async () => {
    if (!form.route.trim().startsWith('/')) { setFormError('Route must start with /.'); return; }
    if (!form.title.trim() || !form.description.trim()) { setFormError('Title and description are required.'); return; }
    if (form.structuredData.trim()) { try { JSON.parse(form.structuredData); } catch { setFormError('Structured data is not valid JSON.'); return; } }
    setBusy(true); setFormError('');
    try { await backendAdminService.saveSeo({ ...form, route: form.route.trim() }); await load(); toast('SEO record saved.', 'success'); setEditing(null); }
    catch (e) { setFormError(e instanceof Error ? e.message : 'SEO record could not be saved.'); }
    finally { setBusy(false); }
  };

  const saveRedirect = async () => {
    if (!rForm.from.startsWith('/') || !rForm.to.startsWith('/')) { setFormError('Both paths must start with /.'); return; }
    setBusy(true); setFormError('');
    try { await backendAdminService.saveRedirect({ id: redirect === 'new' ? undefined : (redirect as RedirectRule).id, from: rForm.from.trim(), to: rForm.to.trim(), code: rForm.code }); await load(); toast('Redirect saved.', 'success'); setRedirect(null); }
    catch (e) { setFormError(e instanceof Error ? e.message : 'Redirect could not be saved.'); }
    finally { setBusy(false); }
  };

  const removeRedirect = async () => {
    if (!deletingRedirect) return;
    try { await backendAdminService.deleteRedirect(deletingRedirect.id); await load(); toast('Redirect deleted.', 'success'); }
    catch (e) { toast(e instanceof Error ? e.message : 'Redirect could not be deleted.', 'error'); }
    setDeletingRedirect(null);
  };
  const removeSeo = async () => {
    if (!deletingSeo) return;
    try { await backendAdminService.deleteSeo(deletingSeo.route); await load(); toast('SEO record deleted.', 'success'); }
    catch (e) { toast(e instanceof Error ? e.message : 'SEO record could not be deleted.', 'error'); }
    setDeletingSeo(null);
  };

  const seoColumns: Column<SeoRecord>[] = [
    { key: 'route', header: 'Route', width: '16%', render: (r) => <span className="mono">{r.route}</span>, sortValue: (r) => r.route },
    { key: 'title', header: 'Title', width: '26%', render: (r) => <span className="admin-user-name">{r.title}</span>, sortValue: (r) => r.title },
    { key: 'description', header: 'Description', render: (r) => <span className="muted admin-clamp">{r.description}</span> },
    { key: 'robots', header: 'Robots', render: (r) => <Badge tone={r.robots === 'index' ? 'neutral' : 'outline'}>{r.robots}</Badge>, sortValue: (r) => r.robots },
    {
      key: 'actions', header: '', align: 'end', width: '110px',
      render: (r) => (
        <span className="admin-row-actions">
          <Button size="sm" variant="ghost" icon={<Pencil size={13} />} onClick={() => openSeo(r)} aria-label={`Edit SEO for ${r.route}`} />
          <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => setDeletingSeo(r)} aria-label={`Delete SEO for ${r.route}`} />
        </span>
      ),
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

  const noindex = records.filter((s) => s.robots === 'noindex').map((s) => s.route);
  const robotsPreview = `User-agent: *\n${noindex.length ? `Disallow: ${noindex.join(', ')}` : 'Allow: /'}\nSitemap: ${baseUrl}/sitemap.xml`;
  const sitemapPreview = records.filter((s) => s.robots === 'index').map((s) => s.canonical || `${baseUrl}${s.route}`).join('\n');

  return (
    <AdminPage
      title="SEO"
      sub="Metadata per route, redirect rules, and crawler files. Served live from the production database."
      actions={<Button variant="secondary" icon={<RotateCw size={15} />} loading={refreshing} onClick={() => void load()}>Refresh</Button>}
    >
      {error && <p role="alert" className="muted">{error}</p>}
      <Tabs
        tabs={[{ id: 'pages', label: 'Page metadata', count: records.length }, { id: 'redirects', label: 'Redirects', count: redirects.length }, { id: 'files', label: 'Crawler files' }]}
        active={tab} onChange={setTab} label="SEO sections"
      />
      {refreshing && records.length === 0 && redirects.length === 0 && <div className="page"><Spinner /></div>}
      {tab === 'pages' && (
        <div className="panel">
          <DataTable columns={seoColumns} rows={records} rowKey={(r) => r.route}
            toolbar={<Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => openSeo('new')}>Add route</Button>}
            emptyTitle="No routes configured" emptyBody="Add page metadata to control titles, descriptions, and indexing." />
        </div>
      )}
      {tab === 'redirects' && (
        <div className="panel">
          <DataTable columns={redirectColumns} rows={redirects} rowKey={(r) => r.id}
            toolbar={<Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => openRedirect('new')}>Add redirect</Button>}
            emptyTitle="No redirects" emptyBody="Redirect rules are resolved by the client router from /api/redirects." />
        </div>
      )}
      {tab === 'files' && (
        <div className="admin-grid-2">
          <div className="panel panel-pad">
            <h2 className="admin-panel-title">robots.txt</h2>
            <pre className="admin-code-block mono">{robotsPreview}</pre>
            <a className="admin-file-link" href={`${baseUrl}/robots.txt`} target="_blank" rel="noreferrer"><ExternalLink size={13} aria-hidden /> Open live robots.txt</a>
            <p className="faint admin-field-hint">Generated from the robots setting on each route.</p>
          </div>
          <div className="panel panel-pad">
            <h2 className="admin-panel-title">sitemap.xml</h2>
            <pre className="admin-code-block mono">{sitemapPreview || 'No indexable routes yet.'}</pre>
            <a className="admin-file-link" href={`${baseUrl}/sitemap.xml`} target="_blank" rel="noreferrer"><ExternalLink size={13} aria-hidden /> Open live sitemap.xml</a>
            <p className="faint admin-field-hint">Indexable routes only. Updated whenever metadata changes.</p>
          </div>
        </div>
      )}

      <Modal open={Boolean(editing)} onClose={() => { if (!busy) setEditing(null); }} title={editing === 'new' ? 'Add route metadata' : `SEO for ${form.route}`} wide
        footer={<>
          <Button variant="ghost" onClick={() => setEditing(null)} disabled={busy}>Cancel</Button>
          <Button variant="primary" icon={<Save size={14} />} loading={busy} onClick={() => void saveSeo()}>Save</Button>
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
        {formError && <p role="alert" className="admin-form-error">{formError}</p>}
      </Modal>

      <Modal open={Boolean(redirect)} onClose={() => { if (!busy) setRedirect(null); }} title={redirect === 'new' ? 'Add redirect' : 'Edit redirect'}
        footer={<>
          <Button variant="ghost" onClick={() => setRedirect(null)} disabled={busy}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={() => void saveRedirect()}>Save redirect</Button>
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
        {formError && <p role="alert" className="admin-form-error">{formError}</p>}
      </Modal>

      <ConfirmDialog
        open={Boolean(deletingRedirect)} onClose={() => setDeletingRedirect(null)}
        onConfirm={() => void removeRedirect()}
        title="Delete redirect" body={`Delete the redirect from ${deletingRedirect?.from}?`}
        confirmLabel="Delete"
      />
      <ConfirmDialog
        open={Boolean(deletingSeo)} onClose={() => setDeletingSeo(null)}
        onConfirm={() => void removeSeo()}
        title="Delete SEO record" body={`Delete metadata for ${deletingSeo?.route}?`}
        confirmLabel="Delete"
      />
    </AdminPage>
  );
}