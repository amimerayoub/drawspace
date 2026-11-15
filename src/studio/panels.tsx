/* Studio side panels: blocks, templates, media (left) and design, SEO, code, publish (right). */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Download, Image as ImageIcon, Plus, Search, Trash2, Upload, X } from 'lucide-react';
import { Button, ConfirmDialog, Field, Input, NativeSelect, Segmented, Spinner, Switch, Textarea } from '@/components/ui';
import { ResponsiveImage } from '@/components/ResponsiveImage';
import { baseUrl } from '@/services/apiClient';
import { backendAdminService } from '@/services/backendAdmin.service';
import { templateService, type StoredTemplate } from '@/services/templates.service';
import type { MediaAsset } from '@/types';
import { BLOCK_META, type MediaTarget } from './BlockEditor';
import { buildPreviewDoc, sanitizeHtml } from './sanitize';
import { BUILT_IN_TEMPLATES, PRESETS, defaultDesign, type BlockType, type CodeConfig, type DesignConfig, type StudioDoc } from './types';

/* ---------- shared bits ---------- */
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const hex = /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#0a0a0a';
  return (
    <Field label={label}>
      <span className="st-color-field">
        <input type="color" value={hex} onChange={(e) => onChange(e.target.value)} aria-label={`${label} color picker`} />
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="inherit" aria-label={`${label} value`} />
        {value && <Button size="sm" variant="ghost" icon={<X size={12} />} onClick={() => onChange('')} aria-label={`Clear ${label}`} />}
      </span>
    </Field>
  );
}

function RangeField({ label, value, min, max, step = 1, unit = '', onChange }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void }) {
  return (
    <Field label={`${label}: ${value}${unit}`}>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
    </Field>
  );
}

const FONT_OPTIONS = ['Inter', 'Manrope', 'Georgia', 'Times New Roman', 'System UI', 'Courier New'];

/* ---------- Blocks panel ---------- */
export function BlocksPanel({ onAdd }: { onAdd: (type: BlockType) => void }) {
  const groups = ['text', 'media', 'layout', 'components'] as const;
  return (
    <div className="st-panel-body">
      <p className="faint st-panel-hint">Click to append, or drag a block into the article.</p>
      {groups.map((group) => (
        <div key={group} className="st-block-group">
          <span className="st-group-label">{group}</span>
          <div className="st-block-grid">
            {(Object.keys(BLOCK_META) as BlockType[]).filter((t) => BLOCK_META[t].group === group).map((type) => {
              const meta = BLOCK_META[type];
              return (
                <button
                  key={type} type="button" className="st-block-chip" draggable
                  onDragStart={(e) => { e.dataTransfer.setData('text/studio-new', type); e.dataTransfer.effectAllowed = 'copy'; }}
                  onClick={() => onAdd(type)}
                >
                  <meta.icon size={14} aria-hidden />
                  <span>{meta.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- Templates panel ---------- */
export function TemplatesPanel({ doc, onApply }: { doc: StudioDoc; onApply: (doc: StudioDoc) => void }) {
  const [saved, setSaved] = useState<StoredTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<{ name: string; doc: StudioDoc } | null>(null);
  const [removing, setRemoving] = useState<StoredTemplate | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try { setSaved(await templateService.list()); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Templates could not be loaded.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  const save = async () => {
    const clean = name.trim();
    if (!clean) { setError('Give the template a name.'); return; }
    setSaving(true);
    try {
      await templateService.save(clean.slice(0, 64), `${doc.blocks.length} blocks`, JSON.parse(JSON.stringify(doc)) as StudioDoc);
      setName('');
      await reload();
    } catch (e) { setError(e instanceof Error ? e.message : 'Template could not be saved.'); }
    finally { setSaving(false); }
  };

  return (
    <div className="st-panel-body">
      <span className="st-group-label">Built-in templates</span>
      <div className="st-template-list">
        {BUILT_IN_TEMPLATES.map((t) => (
          <div key={t.id} className="st-template-card">
            <div>
              <strong>{t.name}</strong>
              <p className="faint">{t.description}</p>
            </div>
            <Button size="sm" variant="secondary" onClick={() => setPending({ name: t.name, doc: t.doc })}>Use</Button>
          </div>
        ))}
      </div>
      <span className="st-group-label">Your templates</span>
      <div className="st-template-save">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name" aria-label="Template name" maxLength={64} />
        <Button size="sm" variant="primary" icon={<Plus size={13} />} loading={saving} onClick={() => void save()}>Save current</Button>
      </div>
      {error && <p role="alert" className="admin-form-error">{error}</p>}
      {loading ? <Spinner label="Loading templates…" /> : saved.length === 0 ? (
        <p className="faint st-panel-hint">No saved templates yet. Design an article, then save it here.</p>
      ) : (
        <div className="st-template-list">
          {saved.map((t) => (
            <div key={t.id} className="st-template-card">
              <div>
                <strong>{t.name}</strong>
                <p className="faint">{t.description} · {t.source === 'local' ? 'this browser' : 'server'}</p>
              </div>
              <span className="st-inline-actions">
                <Button size="sm" variant="secondary" onClick={() => setPending({ name: t.name, doc: t.doc })}>Use</Button>
                <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} onClick={() => setRemoving(t)} aria-label={`Delete template ${t.name}`} />
              </span>
            </div>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={Boolean(pending)} onClose={() => setPending(null)}
        onConfirm={() => { if (pending) { onApply(JSON.parse(JSON.stringify(pending.doc)) as StudioDoc); setPending(null); } }}
        title="Apply template" body={`Replace the current article content with "${pending?.name}"? Undo is available afterwards.`}
        confirmLabel="Apply"
      />
      <ConfirmDialog
        open={Boolean(removing)} onClose={() => setRemoving(null)}
        onConfirm={() => { if (removing) void templateService.remove(removing).then(() => { setRemoving(null); return reload(); }).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Delete failed.')); }}
        title="Delete template" body={`Delete "${removing?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
      />
    </div>
  );
}

/* ---------- Media panel ---------- */
export function MediaPanel({ onPick, target }: { onPick: (url: string) => void; target: MediaTarget | null }) {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const [copiedId, setCopiedId] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try { setAssets(await backendAdminService.media()); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Media could not be loaded.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const asset = await backendAdminService.uploadMedia(file, 'image');
      setAssets((current) => [asset, ...current]);
      onPick(`${baseUrl}${asset.url}`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Upload failed.'); }
    finally { setUploading(false); }
  };

  const filtered = assets.filter((a) => a.kind !== 'document' && a.name.toLowerCase().includes(search.toLowerCase()));
  const targetLabel = target
    ? target.kind === 'cover' ? 'featured image' : target.kind === 'design-bg' ? 'background image' : target.kind === 'og' ? 'OG image' : target.kind === 'gallery' ? 'gallery image' : target.kind === 'avatar' ? 'avatar' : target.kind === 'hero' ? 'hero image' : 'image'
    : '';

  return (
    <div className="st-panel-body">
      {target && <p className="st-pick-note">Picking: <strong>{targetLabel}</strong>. Click an image to insert it.</p>}
      <div className="st-media-tools">
        <span className="st-search">
          <Search size={13} aria-hidden />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search media" aria-label="Search media" />
        </span>
        <Button size="sm" variant="secondary" icon={<Upload size={13} />} loading={uploading} onClick={() => fileRef.current?.click()}>Upload</Button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }} />
      </div>
      {error && <p role="alert" className="admin-form-error">{error}</p>}
      {loading ? <Spinner label="Loading media…" /> : filtered.length === 0 ? (
        <p className="faint st-panel-hint">No images yet. Upload one to use it in articles.</p>
      ) : (
        <div className="st-media-grid">
          {filtered.map((a) => {
            const url = `${baseUrl}${a.url}`;
            return (
              <div key={a.id} className="st-media-item">
                <button type="button" className="st-media-thumb" onClick={() => onPick(url)} aria-label={`Insert ${a.name}`}>
                  <ResponsiveImage src={url} alt={a.name} thumb />
                </button>
                <span className="st-media-name" title={a.name}>{a.name}</span>
                <span className="st-media-actions">
                  <Button size="sm" variant="ghost" icon={<ImageIcon size={12} />} onClick={() => onPick(url)}>Insert</Button>
                  <Button size="sm" variant="ghost" icon={copiedId === a.id ? <Check size={12} /> : <Copy size={12} />} onClick={() => { void navigator.clipboard?.writeText(url).then(() => { setCopiedId(a.id); setTimeout(() => setCopiedId(''), 1500); }).catch(() => undefined); }} aria-label={`Copy URL of ${a.name}`} />
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------- Design panel ---------- */
const GRADIENTS = [
  { label: 'None', value: '' },
  { label: 'Cyan fade', value: 'linear-gradient(180deg, rgba(6,182,212,0.10), transparent 320px)' },
  { label: 'Neon space', value: 'radial-gradient(600px 300px at 20% 0%, rgba(6,182,212,0.16), transparent), radial-gradient(500px 260px at 90% 10%, rgba(168,85,247,0.12), transparent)' },
  { label: 'Warm paper', value: 'linear-gradient(180deg, rgba(245,158,11,0.07), transparent 300px)' },
];

export function DesignPanel({ design, onChange, onPickMedia }: { design: DesignConfig; onChange: (d: DesignConfig) => void; onPickMedia: (t: MediaTarget) => void }) {
  const [copyState, setCopyState] = useState('');
  const t = design.typography; const l = design.layout; const c = design.colors;
  const setT = (partial: Partial<typeof t>) => onChange({ ...design, preset: 'custom', typography: { ...t, ...partial } });
  const setL = (partial: Partial<typeof l>) => onChange({ ...design, preset: 'custom', layout: { ...l, ...partial } });
  const setC = (partial: Partial<typeof c>) => onChange({ ...design, preset: 'custom', colors: { ...c, ...partial } });

  const copyDesign = async () => {
    try { await navigator.clipboard.writeText(JSON.stringify(design)); setCopyState('Copied'); }
    catch { setCopyState('Copy failed'); }
    setTimeout(() => setCopyState(''), 1600);
  };
  const pasteDesign = async () => {
    try {
      const parsed = JSON.parse(await navigator.clipboard.readText()) as DesignConfig;
      if (parsed && parsed.typography && parsed.layout && parsed.colors) onChange({ ...defaultDesign(), ...parsed, preset: 'custom' });
      else setCopyState('Clipboard has no design');
    } catch { setCopyState('Clipboard has no design'); }
    setTimeout(() => setCopyState(''), 1600);
  };

  return (
    <div className="st-panel-body">
      <span className="st-group-label">Presets</span>
      <div className="st-preset-row">
        {PRESETS.map((p) => (
          <button key={p.id} type="button" className={`st-preset ${design.preset === p.id ? 'active' : ''}`} onClick={() => onChange(JSON.parse(JSON.stringify(p.design)) as DesignConfig)}>
            <span className="st-preset-dot" style={{ background: p.design.colors.accent }} aria-hidden />
            {p.name}
          </button>
        ))}
      </div>
      <div className="st-design-actions">
        <Button size="sm" variant="ghost" icon={<Copy size={12} />} onClick={() => void copyDesign()}>Copy design</Button>
        <Button size="sm" variant="ghost" icon={<Download size={12} />} onClick={() => void pasteDesign()}>Paste design</Button>
        {copyState && <span className="faint">{copyState}</span>}
      </div>

      <span className="st-group-label">Typography</span>
      <Field label="Body font">
        <Input value={t.fontFamily} onChange={(e) => setT({ fontFamily: e.target.value })} list="st-fonts" aria-label="Body font family" />
      </Field>
      <datalist id="st-fonts">{FONT_OPTIONS.map((f) => <option key={f} value={f} />)}</datalist>
      <RangeField label="Font size" value={t.fontSize} min={14} max={22} unit="px" onChange={(fontSize) => setT({ fontSize })} />
      <Field label="Body weight">
        <NativeSelect value={t.fontWeight} onChange={(e) => setT({ fontWeight: Number(e.target.value) })} aria-label="Body font weight">
          {[300, 400, 500, 600, 700].map((w) => <option key={w} value={w}>{w}</option>)}
        </NativeSelect>
      </Field>
      <RangeField label="Line height" value={t.lineHeight} min={1.3} max={2} step={0.05} onChange={(lineHeight) => setT({ lineHeight })} />
      <RangeField label="Letter spacing" value={t.letterSpacing} min={-0.02} max={0.1} step={0.005} unit="em" onChange={(letterSpacing) => setT({ letterSpacing })} />
      <ColorField label="Text color" value={t.textColor} onChange={(textColor) => setT({ textColor })} />
      <Field label="Heading font">
        <Input value={t.headingFamily} onChange={(e) => setT({ headingFamily: e.target.value })} list="st-fonts" aria-label="Heading font family" />
      </Field>
      <Field label="Heading weight">
        <NativeSelect value={t.headingWeight} onChange={(e) => setT({ headingWeight: Number(e.target.value) })} aria-label="Heading weight">
          {[500, 600, 700, 800, 900].map((w) => <option key={w} value={w}>{w}</option>)}
        </NativeSelect>
      </Field>
      <ColorField label="Heading color" value={t.headingColor} onChange={(headingColor) => setT({ headingColor })} />

      <span className="st-group-label">Layout</span>
      <RangeField label="Content width" value={l.contentWidth} min={560} max={1100} step={20} unit="px" onChange={(contentWidth) => setL({ contentWidth })} />
      <RangeField label="Block spacing" value={l.sectionSpacing} min={12} max={64} step={2} unit="px" onChange={(sectionSpacing) => setL({ sectionSpacing })} />
      <RangeField label="Padding" value={l.padding} min={0} max={48} step={4} unit="px" onChange={(padding) => setL({ padding })} />
      <RangeField label="Corner radius" value={l.radius} min={0} max={24} step={2} unit="px" onChange={(radius) => setL({ radius })} />
      <Field label="Shadow">
        <NativeSelect value={l.shadow} onChange={(e) => setL({ shadow: e.target.value as 'none' | 'soft' | 'strong' })} aria-label="Shadow">
          <option value="none">None</option><option value="soft">Soft</option><option value="strong">Strong</option>
        </NativeSelect>
      </Field>
      <Segmented options={[{ value: 'start', label: 'Left aligned' }, { value: 'center', label: 'Centered' }]} value={l.align} onChange={(align) => setL({ align })} label="Container alignment" />
      <Switch checked={l.fullWidth} onChange={(fullWidth) => setL({ fullWidth })} label="Full width" description="Stretch the article to the container width." />

      <span className="st-group-label">Colors & background</span>
      <ColorField label="Background" value={c.background} onChange={(background) => setC({ background })} />
      <Field label="Gradient">
        <NativeSelect value={GRADIENTS.some((g) => g.value === c.gradient) ? c.gradient : 'custom'} onChange={(e) => setC({ gradient: e.target.value === 'custom' ? c.gradient : e.target.value })} aria-label="Background gradient">
          {GRADIENTS.map((g) => <option key={g.label} value={g.value}>{g.label}</option>)}
          {!GRADIENTS.some((g) => g.value === c.gradient) && c.gradient && <option value="custom">Custom</option>}
        </NativeSelect>
      </Field>
      <div className="st-field-row">
        <Field label="Background image">
          <Input value={c.backgroundImage} onChange={(e) => setC({ backgroundImage: e.target.value })} placeholder="https://…" aria-label="Background image URL" />
        </Field>
        <Button size="sm" variant="secondary" icon={<ImageIcon size={13} />} onClick={() => onPickMedia({ kind: 'design-bg' })}>Media</Button>
      </div>
      <ColorField label="Section background" value={c.sectionBackground} onChange={(sectionBackground) => setC({ sectionBackground })} />
      <ColorField label="Border color" value={c.borderColor} onChange={(borderColor) => setC({ borderColor })} />
      <ColorField label="Accent" value={c.accent} onChange={(accent) => setC({ accent })} />
    </div>
  );
}

/* ---------- SEO panel ---------- */
export interface SeoValues { slug: string; seoTitle: string; seoDescription: string; canonical: string; ogImage: string }
export function SeoPanel({ title, values, onChange, onPickMedia }: { title: string; values: SeoValues; onChange: (v: Partial<SeoValues>) => void; onPickMedia: (t: MediaTarget) => void }) {
  const previewTitle = values.seoTitle || title || 'Article title';
  const previewUrl = `drawspace.cloud/en-US/blog/${values.slug || 'article-slug'}`;
  return (
    <div className="st-panel-body">
      <Field label="URL slug" hint="Lowercase letters, numbers and hyphens.">
        <Input value={values.slug} onChange={(e) => onChange({ slug: e.target.value })} placeholder="generated-from-title" aria-label="URL slug" />
      </Field>
      <Field label="Meta title" hint={`${values.seoTitle.length}/128. Falls back to the article title.`}>
        <Input value={values.seoTitle} onChange={(e) => onChange({ seoTitle: e.target.value })} maxLength={128} aria-label="Meta title" />
      </Field>
      <Field label="Meta description" hint={`${values.seoDescription.length}/255. Shown in search results and shares.`}>
        <Textarea value={values.seoDescription} onChange={(e) => onChange({ seoDescription: e.target.value })} rows={3} maxLength={255} aria-label="Meta description" />
      </Field>
      <Field label="Canonical URL" hint="Optional. Defaults to the article URL.">
        <Input value={values.canonical} onChange={(e) => onChange({ canonical: e.target.value })} placeholder="https://drawspace.cloud/…" aria-label="Canonical URL" />
      </Field>
      <div className="st-field-row">
        <Field label="OG image" hint="Used when the article is shared.">
          <Input value={values.ogImage} onChange={(e) => onChange({ ogImage: e.target.value })} placeholder="Falls back to the featured image" aria-label="OG image URL" />
        </Field>
        <Button size="sm" variant="secondary" icon={<ImageIcon size={13} />} onClick={() => onPickMedia({ kind: 'og' })}>Media</Button>
      </div>
      <span className="st-group-label">Search preview</span>
      <div className="st-seo-preview">
        <span className="st-seo-url">{previewUrl}</span>
        <span className="st-seo-title">{previewTitle.slice(0, 60)}{previewTitle.length > 60 ? '…' : ''}</span>
        <span className="st-seo-desc">{(values.seoDescription || 'The meta description appears here.').slice(0, 160)}</span>
      </div>
    </div>
  );
}

/* ---------- Code panel ---------- */
export function CodePanel({ code, onChange, canUseJs }: { code: CodeConfig; onChange: (c: CodeConfig) => void; canUseJs: boolean }) {
  const [showPreview, setShowPreview] = useState(false);
  const set = (partial: Partial<CodeConfig>) => onChange({ ...code, ...partial });

  const report = useMemo(() => {
    const issues: string[] = [];
    if (code.js.trim() || code.headerScript.trim() || code.footerScript.trim()) {
      for (const [label, source] of [['Custom JS', code.js], ['Header script', code.headerScript], ['Footer script', code.footerScript]] as const) {
        if (!source.trim()) continue;
        try { new Function(source); } catch (e) { issues.push(`${label}: ${e instanceof Error ? e.message : 'syntax error'}`); }
      }
    }
    if (/<script|<form|<object|<embed|on\w+\s*=/i.test(code.html)) issues.push('Custom HTML contains active markup; it will be stripped on save.');
    if (/expression\s*\(|javascript:|@import/i.test(code.css)) issues.push('CSS contains unsafe directives; remove expression(), javascript: or @import.');
    return issues;
  }, [code.js, code.headerScript, code.footerScript, code.html, code.css]);

  const previewDoc = useMemo(() => buildPreviewDoc({
    html: sanitizeHtml(code.html, 'block'),
    css: code.css,
    js: canUseJs ? code.js : '',
    headerScript: canUseJs ? code.headerScript : '',
    footerScript: canUseJs ? code.footerScript : '',
    baseCss: 'body{margin:0;padding:16px;background:#0a0a0a;color:#e4e4e7;font-family:Inter,system-ui,sans-serif;font-size:15px;line-height:1.6}',
  }), [code, canUseJs]);

  return (
    <div className="st-panel-body">
      <Switch checked={code.enabled} onChange={(enabled) => set({ enabled })} label="Enable custom code" description="Disabled by default. Applies to this article only." />
      <p className="faint st-note">HTML and CSS render inline after sanitizing. Scripts run only inside a sandboxed frame with a restrictive CSP, never in the main app.</p>
      <Field label="Placement">
        <NativeSelect value={code.placement} onChange={(e) => set({ placement: e.target.value as CodeConfig['placement'] })} aria-label="Code placement">
          <option value="post">After article</option>
          <option value="section">End of content</option>
          <option value="header">Before article</option>
          <option value="footer">Page footer area</option>
        </NativeSelect>
      </Field>
      <Field label="Frame height (px)" hint="Height of the sandboxed script frame.">
        <Input type="number" min={0} max={2000} value={code.height} onChange={(e) => set({ height: Math.max(0, Math.min(2000, Number(e.target.value) || 0)) })} aria-label="Frame height" />
      </Field>
      <Field label="Custom HTML">
        <Textarea className="mono" value={code.html} onChange={(e) => set({ html: e.target.value })} rows={5} spellCheck={false} aria-label="Custom HTML" />
      </Field>
      <Field label="Custom CSS">
        <Textarea className="mono" value={code.css} onChange={(e) => set({ css: e.target.value })} rows={5} spellCheck={false} aria-label="Custom CSS" />
      </Field>
      {canUseJs ? (
        <>
          <Field label="Custom JavaScript" hint="Runs in the sandboxed frame only.">
            <Textarea className="mono" value={code.js} onChange={(e) => set({ js: e.target.value })} rows={5} spellCheck={false} aria-label="Custom JavaScript" />
          </Field>
          <Field label="Header script">
            <Textarea className="mono" value={code.headerScript} onChange={(e) => set({ headerScript: e.target.value })} rows={3} spellCheck={false} aria-label="Header script" />
          </Field>
          <Field label="Footer script">
            <Textarea className="mono" value={code.footerScript} onChange={(e) => set({ footerScript: e.target.value })} rows={3} spellCheck={false} aria-label="Footer script" />
          </Field>
        </>
      ) : (
        <p className="st-js-gate" role="note">Custom JavaScript requires an admin or super admin role. HTML and CSS remain available.</p>
      )}
      {report.length > 0 && (
        <div className="st-code-report" role="alert">
          {report.map((issue, i) => <p key={i}>{issue}</p>)}
        </div>
      )}
      <Button size="sm" variant="secondary" onClick={() => setShowPreview(!showPreview)}>{showPreview ? 'Hide sandbox preview' : 'Test in sandbox'}</Button>
      {showPreview && (
        <iframe className="st-code-preview" title="Sandboxed code preview" srcDoc={previewDoc} sandbox="allow-scripts" style={{ height: Math.max(160, code.height || 240) }} />
      )}
    </div>
  );
}

/* ---------- Publish panel ---------- */
export interface PublishValues {
  status: 'draft' | 'published' | 'scheduled' | 'archived';
  publishAt: string; category: string; tags: string; cover: string; excerpt: string;
}
export function PublishPanel({ values, onChange, author, categories, onPickMedia, onDuplicate, busy }: {
  values: PublishValues; onChange: (v: Partial<PublishValues>) => void; author: string; categories: string[];
  onPickMedia: (t: MediaTarget) => void; onDuplicate: () => void; busy: boolean;
}) {
  return (
    <div className="st-panel-body">
      <Field label="Status">
        <NativeSelect value={values.status} onChange={(e) => onChange({ status: e.target.value as PublishValues['status'] })} aria-label="Post status">
          <option value="draft">Draft</option><option value="published">Published</option>
          <option value="scheduled">Scheduled</option><option value="archived">Archived</option>
        </NativeSelect>
      </Field>
      <Field label="Publish date" hint="Scheduled posts go live on this date.">
        <Input type="date" value={values.publishAt} onChange={(e) => onChange({ publishAt: e.target.value })} aria-label="Publish date" />
      </Field>
      <Field label="Category">
        <Input value={values.category} onChange={(e) => onChange({ category: e.target.value })} list="st-cats" aria-label="Category" />
      </Field>
      <datalist id="st-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
      <Field label="Tags" hint="Comma separated, up to 10.">
        <Input value={values.tags} onChange={(e) => onChange({ tags: e.target.value })} placeholder="tips, updates" aria-label="Tags" />
      </Field>
      <Field label="Excerpt" hint={`${values.excerpt.length}/500. Used on cards and in search.`}>
        <Textarea value={values.excerpt} onChange={(e) => onChange({ excerpt: e.target.value })} rows={3} maxLength={500} aria-label="Excerpt" />
      </Field>
      <span className="st-group-label">Featured image</span>
      {values.cover ? (
        <div className="st-cover-preview">
          <ResponsiveImage src={values.cover} alt="Featured preview" sizes="320px" />
          <span className="st-inline-actions">
            <Button size="sm" variant="secondary" icon={<ImageIcon size={12} />} onClick={() => onPickMedia({ kind: 'cover' })}>Replace</Button>
            <Button size="sm" variant="ghost" icon={<X size={12} />} onClick={() => onChange({ cover: '' })}>Remove</Button>
          </span>
        </div>
      ) : (
        <Button size="sm" variant="secondary" icon={<ImageIcon size={13} />} onClick={() => onPickMedia({ kind: 'cover' })}>Pick featured image</Button>
      )}
      <Field label="Author">
        <Input value={author} disabled aria-label="Author" />
      </Field>
      <span className="st-group-label">Actions</span>
      <Button size="sm" variant="secondary" icon={<Copy size={13} />} onClick={onDuplicate} disabled={busy}>Duplicate post</Button>
      <p className="faint st-panel-hint">Import and export live in the toolbar menu.</p>
    </div>
  );
}