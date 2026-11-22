/* DrawSpace Blog Studio: three-panel block editor with live preview, design,
   custom code, SEO, publishing, templates and media. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Check, ChevronLeft, ChevronRight, Download, ExternalLink, FileUp, Keyboard,
  Maximize2, Minimize2, Monitor, MoreHorizontal, Redo2, Save, Send, Smartphone, Tablet, Undo2,
} from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import { apiGet } from '@/services/apiClient';
import { contentService, type ContentBlogStatus } from '@/services/content.service';
import { Button, ConfirmDialog, IconButton, Input, Modal, Segmented, Spinner } from '@/components/ui';
import { BlockList, type MediaTarget } from '@/studio/BlockEditor';
import { StudioContent } from '@/studio/blocks';
import { CustomCodeSection } from '@/studio/StudioArticle';
import { BlocksPanel, CodePanel, DesignPanel, MediaPanel, PublishPanel, SeoPanel, TemplatesPanel, type PublishValues, type SeoValues } from '@/studio/panels';
import { docToPlainText, emptyDoc, legacyToDoc, newBlock, parseDoc, serializeDoc, type BlockType, type StudioDoc } from '@/studio/types';
import { useAdmin } from './shared';

interface MetaState {
  title: string; slug: string; excerpt: string; category: string; tags: string;
  status: ContentBlogStatus; cover: string; publishAt: string;
  seoTitle: string; seoDescription: string; canonical: string; ogImage: string;
}
interface Snapshot { doc: StudioDoc; meta: MetaState }

const emptyMeta = (): MetaState => ({
  title: '', slug: '', excerpt: '', category: 'Guides', tags: '', status: 'draft', cover: '',
  publishAt: new Date().toISOString().slice(0, 10), seoTitle: '', seoDescription: '', canonical: '', ogImage: '',
});
const metaFromRecord = (record: { title: string; slug: string; excerpt: string; category: string; tags: string[]; status: string; cover: string; publishedAt: string; seoTitle: string; seoDescription: string }, doc: StudioDoc): MetaState => ({
  title: record.title, slug: record.slug, excerpt: record.excerpt, category: record.category,
  tags: record.tags.join(', '), status: record.status as ContentBlogStatus, cover: record.cover,
  publishAt: record.publishedAt ? record.publishedAt.slice(0, 10) : new Date().toISOString().slice(0, 10),
  seoTitle: record.seoTitle, seoDescription: record.seoDescription,
  canonical: doc.meta?.canonical || '', ogImage: doc.meta?.ogImage || '',
});

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
const DEVICES = [{ value: 'desktop', label: 'Desktop' }, { value: 'tablet', label: 'Tablet' }, { value: 'mobile', label: 'Mobile' }] as const;
type Device = typeof DEVICES[number]['value'];
const DEVICE_WIDTH: Record<Device, string> = { desktop: '100%', tablet: '768px', mobile: '390px' };

export default function BlogStudio() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { role, name } = useAdmin();

  const [loading, setLoading] = useState(Boolean(id));
  const [loadError, setLoadError] = useState('');
  const [postId, setPostId] = useState<string | null>(id ?? null);
  const [author, setAuthor] = useState(name);
  const [snap, setSnap] = useState<Snapshot>({ doc: emptyDoc(), meta: emptyMeta() });
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [savedAt, setSavedAt] = useState('');
  const [contentLimit, setContentLimit] = useState(50000);
  const [canUseJs, setCanUseJs] = useState(role === 'admin' || role === 'superadmin');

  const [leftTab, setLeftTab] = useState<'blocks' | 'templates' | 'media'>('blocks');
  const [rightTab, setRightTab] = useState<'design' | 'seo' | 'code' | 'publish'>('design');
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [device, setDevice] = useState<Device>('desktop');
  const [fullscreen, setFullscreen] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState<string | null>(null);
  const [mediaTarget, setMediaTarget] = useState<MediaTarget | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmBack, setConfirmBack] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [pendingImport, setPendingImport] = useState<Snapshot | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const snapRef = useRef(snap); snapRef.current = snap;
  const postIdRef = useRef(postId); postIdRef.current = postId;
  const limitRef = useRef(contentLimit); limitRef.current = contentLimit;
  const loadedId = useRef<string | null>(null);
  const creating = useRef(false);
  const past = useRef<Snapshot[]>([]);
  const future = useRef<Snapshot[]>([]);
  const lastKey = useRef('');
  const lastAt = useRef(0);
  const [, setHistTick] = useState(0);

  /* ---------- load ---------- */
  useEffect(() => {
    if (!id) { loadedId.current = null; return; }
    if (loadedId.current === id) return;
    let cancelled = false;
    setLoading(true); setLoadError('');
    void contentService.blog(id).then((record) => {
      if (cancelled) return;
      const doc = parseDoc(record.studioDoc || record.content) ?? legacyToDoc(record.content);
      loadedId.current = id;
      setPostId(id);
      setAuthor(record.author || name);
      setSnap({ doc, meta: metaFromRecord(record, doc) });
      setDirty(false); setSaveState('idle');
      past.current = []; future.current = [];
    }).catch((e: unknown) => { if (!cancelled) setLoadError(e instanceof Error ? e.message : 'The article could not be loaded.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id, name]);

  useEffect(() => {
    void apiGet<{ contentLimit: number; studioLimit?: number; canUseCustomJs: boolean }>('/api/v1/admin/blog-studio/config')
      .then((config) => { setContentLimit(config.studioLimit || config.contentLimit || 50000); setCanUseJs(Boolean(config.canUseCustomJs)); })
      .catch(() => undefined);
    void contentService.blogCategories().then((cats) => setCategories(cats.map((c) => c.name))).catch(() => undefined);
  }, []);

  /* ---------- history ---------- */
  const commit = useCallback((next: Snapshot, key = '') => {
    const now = Date.now();
    if (!(key && key === lastKey.current && now - lastAt.current < 900)) {
      past.current.push(snapRef.current);
      if (past.current.length > 100) past.current.shift();
    }
    lastKey.current = key; lastAt.current = now;
    future.current = [];
    setSnap(next); setDirty(true); setHistTick((t) => t + 1);
  }, []);
  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(snapRef.current);
    lastKey.current = '';
    setSnap(prev); setDirty(true); setHistTick((t) => t + 1);
  }, []);
  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(snapRef.current);
    lastKey.current = '';
    setSnap(next); setDirty(true); setHistTick((t) => t + 1);
  }, []);

  const updateDoc = useCallback((partial: Partial<StudioDoc>, key = 'doc') => {
    commit({ ...snapRef.current, doc: { ...snapRef.current.doc, ...partial } }, key);
  }, [commit]);
  const updateMeta = useCallback((partial: Partial<MetaState>) => {
    commit({ ...snapRef.current, meta: { ...snapRef.current.meta, ...partial } }, `meta-${Object.keys(partial).join(',')}`);
  }, [commit]);

  /* ---------- save ---------- */
  const buildInput = useCallback((statusOverride?: ContentBlogStatus) => {
    const { doc, meta } = snapRef.current;
    const stored: StudioDoc = { ...doc, meta: { canonical: meta.canonical, ogImage: meta.ogImage } };
    const content = serializeDoc(stored);
    const plain = docToPlainText(stored);
    const excerpt = meta.excerpt.trim() || plain.slice(0, 140);
    const title = meta.title.trim() || 'Untitled article';
    return {
      title, slug: meta.slug.trim() || undefined, excerpt, content,
      category: meta.category.trim() || 'News',
      tags: meta.tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 10),
      status: statusOverride ?? meta.status,
      cover: meta.cover,
      seoTitle: meta.seoTitle.trim() || title,
      seoDescription: meta.seoDescription.trim() || excerpt,
      publishAt: meta.publishAt ? new Date(`${meta.publishAt}T10:00:00Z`).toISOString() : undefined,
    };
  }, []);

  const save = useCallback(async (opts: { silent?: boolean; statusOverride?: ContentBlogStatus } = {}) => {
    const { meta } = snapRef.current;
    if (!meta.title.trim()) {
      if (!opts.silent) toast('Give the article a title before saving.', 'error');
      return;
    }
    const input = buildInput(opts.statusOverride);
    if (input.content.length > limitRef.current) {
      const message = `The article is ${input.content.length.toLocaleString()} characters but storage allows ${limitRef.current.toLocaleString()}. Remove some blocks or ask an admin to run the content capacity migration.`;
      setSaveState('error');
      if (!opts.silent) toast(message, 'error');
      return;
    }
    setSaveState('saving');
    try {
      const pid = postIdRef.current;
      if (pid) {
        await contentService.updateBlog(pid, input);
      } else {
        const record = await contentService.createBlog({ ...input, status: opts.statusOverride ?? 'draft' });
        loadedId.current = record.id;
        setPostId(record.id);
        navigate(`/admin/blog/studio/${record.id}`, { replace: true });
      }
      if (opts.statusOverride) setSnap((s) => ({ ...s, meta: { ...s.meta, status: opts.statusOverride! } }));
      setDirty(false);
      setSaveState('saved');
      setSavedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      if (!opts.silent) toast(opts.statusOverride === 'published' ? 'Article published.' : 'Article saved.', 'success');
    } catch (e) {
      setSaveState('error');
      if (!opts.silent) toast(e instanceof Error ? e.message : 'The article could not be saved.', 'error');
    }
  }, [buildInput, navigate, toast]);

  /* Autosave: existing posts debounce-save; new posts auto-create a draft once they have content. */
  useEffect(() => {
    if (!dirty || saveState === 'saving') return;
    const { meta, doc } = snap;
    if (postId) {
      const timer = setTimeout(() => { void save({ silent: true }); }, 1600);
      return () => clearTimeout(timer);
    }
    if (!creating.current && meta.title.trim() && doc.blocks.length > 0) {
      const timer = setTimeout(() => { creating.current = true; void save({ silent: true }).finally(() => { creating.current = false; }); }, 2400);
      return () => clearTimeout(timer);
    }
  }, [dirty, postId, snap, save, saveState]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  /* ---------- shortcuts ---------- */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const target = e.target as HTMLElement;
      const inText = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); void save(); return; }
      if (mod && e.shiftKey && e.key.toLowerCase() === 'p') { e.preventDefault(); setMode((m) => m === 'edit' ? 'preview' : 'edit'); return; }
      if (mod && e.shiftKey && e.key.toLowerCase() === 'f') { e.preventDefault(); setFullscreen((f) => !f); return; }
      if (e.key === 'Escape') { setFullscreen(false); setMenuOpen(false); return; }
      if (inText) return;
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [save, undo, redo]);

  /* ---------- media picking ---------- */
  const pickMedia = useCallback((target: MediaTarget) => {
    setMediaTarget(target);
    setLeftTab('media'); setLeftOpen(true);
  }, []);
  const applyMedia = useCallback((url: string) => {
    const target = mediaTarget;
    const { doc, meta } = snapRef.current;
    if (!target) return;
    if (target.kind === 'cover') updateMeta({ cover: url });
    else if (target.kind === 'design-bg') updateDoc({ design: { ...doc.design, colors: { ...doc.design.colors, backgroundImage: url } } }, 'design');
    else if (target.kind === 'og') updateMeta({ ogImage: url });
    else {
      const blocks = doc.blocks.map((b) => {
        if (b.id !== target.blockId) return b;
        if (target.kind === 'image' && b.type === 'image') return { ...b, src: url };
        if (target.kind === 'hero' && b.type === 'hero') return { ...b, image: url };
        if (target.kind === 'avatar' && b.type === 'author') return { ...b, avatar: url };
        if (target.kind === 'gallery' && b.type === 'gallery') return { ...b, images: b.images.map((img, i) => i === target.index ? { ...img, src: url } : img) };
        return b;
      });
      updateDoc({ blocks }, 'media');
    }
    setMediaTarget(null);
    toast('Image inserted.', 'success');
  }, [mediaTarget, updateDoc, updateMeta, toast]);

  /* ---------- toolbar actions ---------- */
  const goBack = () => { if (dirty) setConfirmBack(true); else navigate('/admin/blog'); };
  const duplicatePost = async () => {
    try {
      const input = buildInput('draft');
      const record = await contentService.createBlog({ ...input, title: `${input.title} (copy)`, slug: input.slug ? `${input.slug}-copy`.slice(0, 64) : undefined });
      toast('Post duplicated. You are editing the copy.', 'success');
      navigate(`/admin/blog/studio/${record.id}`);
    } catch (e) { toast(e instanceof Error ? e.message : 'Duplication failed.', 'error'); }
  };
  const exportJson = () => {
    const { doc, meta } = snapRef.current;
    const blob = new Blob([JSON.stringify({ format: 'drawspace-studio', version: 1, meta, doc }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `${meta.slug || 'article'}.studio.json`;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    setMenuOpen(false);
  };
  const importJson = (file: File) => {
    void file.text().then((text) => {
      const parsed = JSON.parse(text) as { meta?: MetaState; doc?: StudioDoc };
      if (!parsed.doc || !Array.isArray(parsed.doc.blocks)) throw new Error('Not a DrawSpace studio export.');
      setPendingImport({ doc: { ...emptyDoc(), ...parsed.doc }, meta: { ...emptyMeta(), ...parsed.meta } });
    }).catch((e: unknown) => toast(e instanceof Error ? e.message : 'Import failed.', 'error'));
    setMenuOpen(false);
  };

  const serializedLength = useMemo(() => serializeDoc(snap.doc).length, [snap.doc]);
  const capacityPct = Math.min(100, Math.round((serializedLength / contentLimit) * 100));
  const { doc, meta } = snap;
  const publishValues: PublishValues = { status: meta.status, publishAt: meta.publishAt, category: meta.category, tags: meta.tags, cover: meta.cover, excerpt: meta.excerpt };
  const seoValues: SeoValues = { slug: meta.slug, seoTitle: meta.seoTitle, seoDescription: meta.seoDescription, canonical: meta.canonical, ogImage: meta.ogImage };

  if (loading) return <div className="st-loading"><Spinner label="Loading studio…" /></div>;
  if (loadError) {
    return (
      <div className="st-loading">
        <div className="panel panel-pad st-load-error">
          <p role="alert">{loadError}</p>
          <Button variant="secondary" onClick={() => { loadedId.current = null; setLoadError(''); setLoading(true); void contentService.blog(id!).then((record) => { const d = parseDoc(record.studioDoc || record.content) ?? legacyToDoc(record.content); loadedId.current = id!; setSnap({ doc: d, meta: metaFromRecord(record, d) }); setLoading(false); }).catch(() => { setLoadError('Still unavailable.'); setLoading(false); }); }}>Retry</Button>
        </div>
      </div>
    );
  }

  const statusLabel = saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Save failed' : dirty ? 'Unsaved changes' : savedAt ? `Saved ${savedAt}` : postId ? 'All changes saved' : 'New article';

  return (
    <div className={`studio-shell ${fullscreen ? 'st-fullscreen' : ''}`}>
      <div className="st-toolbar">
        <div className="st-toolbar-left">
          <Button size="sm" variant="ghost" icon={<ArrowLeft size={14} />} onClick={goBack}>Blog</Button>
          <span className={`st-save-status ${dirty ? 'dirty' : ''} ${saveState === 'error' ? 'error' : ''}`} role="status">
            {saveState === 'saved' && !dirty ? <Check size={12} aria-hidden /> : null}
            {statusLabel}
          </span>
        </div>
        <div className="st-toolbar-mid">
          <IconButton label="Undo (Ctrl+Z)" disabled={past.current.length === 0} onClick={undo}><Undo2 size={15} /></IconButton>
          <IconButton label="Redo (Ctrl+Shift+Z)" disabled={future.current.length === 0} onClick={redo}><Redo2 size={15} /></IconButton>
          <span className="st-toolbar-sep" aria-hidden />
          <Segmented options={[{ value: 'edit', label: 'Edit' }, { value: 'preview', label: 'Preview' }]} value={mode} onChange={setMode} label="Editor mode" />
          {mode === 'preview' && (
            <span className="st-device-seg">
              <IconButton label="Desktop preview" className={device === 'desktop' ? 'active' : ''} onClick={() => setDevice('desktop')}><Monitor size={15} /></IconButton>
              <IconButton label="Tablet preview" className={device === 'tablet' ? 'active' : ''} onClick={() => setDevice('tablet')}><Tablet size={15} /></IconButton>
              <IconButton label="Mobile preview" className={device === 'mobile' ? 'active' : ''} onClick={() => setDevice('mobile')}><Smartphone size={15} /></IconButton>
            </span>
          )}
          <IconButton label={fullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen (Ctrl+Shift+F)'} onClick={() => setFullscreen(!fullscreen)}>
            {fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </IconButton>
          <IconButton label="Keyboard shortcuts" onClick={() => setShowShortcuts(true)}><Keyboard size={15} /></IconButton>
        </div>
        <div className="st-toolbar-right">
          <span className={`st-capacity ${capacityPct > 90 ? 'warn' : ''}`} title={`Storage used: ${serializedLength.toLocaleString()} of ${contentLimit.toLocaleString()} characters`}>
            <span className="st-capacity-bar"><span style={{ width: `${capacityPct}%` }} /></span>
            {capacityPct}%
          </span>
          <span className="st-more-wrap">
            <IconButton label="More actions" onClick={() => setMenuOpen(!menuOpen)}><MoreHorizontal size={16} /></IconButton>
            {menuOpen && (
              <span className="st-menu" role="menu">
                <button type="button" role="menuitem" onClick={exportJson}><Download size={13} /> Export JSON</button>
                <button type="button" role="menuitem" onClick={() => fileRef.current?.click()}><FileUp size={13} /> Import JSON</button>
                {postId && meta.status === 'published' && meta.slug && (
                  <a role="menuitem" href={`/en-US/blog/${meta.slug}`} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} /> View public article</a>
                )}
              </span>
            )}
          </span>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importJson(f); e.target.value = ''; }} />
          <Button size="sm" variant="secondary" icon={<Save size={14} />} loading={saveState === 'saving'} onClick={() => void save()}>Save draft</Button>
          <Button size="sm" variant="primary" icon={<Send size={14} />} onClick={() => setConfirmPublish(true)}>Publish</Button>
        </div>
      </div>

      <div className="st-body">
        {!fullscreen && (
          <aside className={`st-panel st-panel-left ${leftOpen ? '' : 'collapsed'}`}>
            {leftOpen ? (
              <>
                <div className="st-panel-tabs">
                  {(['blocks', 'templates', 'media'] as const).map((tab) => (
                    <button key={tab} type="button" className={leftTab === tab ? 'active' : ''} onClick={() => setLeftTab(tab)}>{tab}</button>
                  ))}
                  <IconButton label="Collapse left panel" className="st-collapse" onClick={() => setLeftOpen(false)}><ChevronLeft size={14} /></IconButton>
                </div>
                {leftTab === 'blocks' && <BlocksPanel onAdd={(type: BlockType) => { const block = newBlock(type); updateDoc({ blocks: [...doc.blocks, block] }, 'add'); setSelectedBlock(block.id); }} />}
                {leftTab === 'templates' && <TemplatesPanel doc={doc} onApply={(templateDoc) => { commit({ doc: templateDoc, meta: snapRef.current.meta }, 'template'); toast('Template applied. Undo to revert.', 'success'); }} />}
                {leftTab === 'media' && <MediaPanel onPick={applyMedia} target={mediaTarget} />}
              </>
            ) : (
              <button type="button" className="st-rail" onClick={() => setLeftOpen(true)} aria-label="Expand content panel"><ChevronRight size={14} /></button>
            )}
          </aside>
        )}

        <main className="st-center">
          <Input
            className="st-title-input" value={meta.title} placeholder="Article title"
            onChange={(e) => updateMeta({ title: e.target.value })} aria-label="Article title" maxLength={255}
          />
          {mode === 'edit' ? (
            <div className="st-edit-canvas">
              {doc.blocks.length === 0 && (
                <div className="st-empty-canvas">
                  <p>Start with a block from the left panel, or apply a template.</p>
                </div>
              )}
              <BlockList
                blocks={doc.blocks}
                selectedId={selectedBlock}
                onSelect={setSelectedBlock}
                onChange={(blocks) => updateDoc({ blocks }, 'blocks')}
                onPickMedia={pickMedia}
              />
            </div>
          ) : (
            <div className="st-preview-scroll">
              <div className={`st-device st-device-${device}`} style={{ width: DEVICE_WIDTH[device] }}>
                <article className="st-preview-article">
                  <CustomCodeSection code={doc.code} runScripts={canUseJs} position="header" />
                  <header className="st-preview-head">
                    <span className="st-preview-meta">
                      <span className="st-preview-cat">{meta.category || 'News'}</span>
                      <span>{meta.publishAt}</span>
                      <span>{author}</span>
                    </span>
                    <h1>{meta.title || 'Untitled article'}</h1>
                    {meta.excerpt && <p className="st-preview-excerpt">{meta.excerpt}</p>}
                  </header>
                  <StudioContent doc={doc} preview pathFor={(p) => `/en-US${p}`} />
                  <CustomCodeSection code={doc.code} runScripts={canUseJs} position="body" />
                  <CustomCodeSection code={doc.code} runScripts={canUseJs} position="footer" />
                </article>
              </div>
            </div>
          )}
        </main>

        {!fullscreen && (
          <aside className={`st-panel st-panel-right ${rightOpen ? '' : 'collapsed'}`}>
            {rightOpen ? (
              <>
                <div className="st-panel-tabs">
                  {(['design', 'seo', 'code', 'publish'] as const).map((tab) => (
                    <button key={tab} type="button" className={rightTab === tab ? 'active' : ''} onClick={() => setRightTab(tab)}>{tab}</button>
                  ))}
                  <IconButton label="Collapse right panel" className="st-collapse" onClick={() => setRightOpen(false)}><ChevronRight size={14} /></IconButton>
                </div>
                {rightTab === 'design' && <DesignPanel design={doc.design} onChange={(design) => updateDoc({ design }, 'design')} onPickMedia={pickMedia} />}
                {rightTab === 'seo' && <SeoPanel title={meta.title} values={seoValues} onChange={(v) => updateMeta(v)} onPickMedia={pickMedia} />}
                {rightTab === 'code' && <CodePanel code={doc.code} onChange={(code) => updateDoc({ code }, 'code')} canUseJs={canUseJs} />}
                {rightTab === 'publish' && (
                  <PublishPanel
                    values={publishValues} onChange={(v) => updateMeta(v)} author={author} categories={categories}
                    onPickMedia={pickMedia} onDuplicate={() => void duplicatePost()} busy={saveState === 'saving'}
                  />
                )}
              </>
            ) : (
              <button type="button" className="st-rail" onClick={() => setRightOpen(true)} aria-label="Expand settings panel"><ChevronLeft size={14} /></button>
            )}
          </aside>
        )}
      </div>

      <Modal open={showShortcuts} onClose={() => setShowShortcuts(false)} title="Keyboard shortcuts">
        <div className="st-shortcuts">
          <p><kbd>Ctrl</kbd>+<kbd>S</kbd> Save</p>
          <p><kbd>Ctrl</kbd>+<kbd>Z</kbd> Undo</p>
          <p><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> or <kbd>Ctrl</kbd>+<kbd>Y</kbd> Redo</p>
          <p><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> Toggle preview</p>
          <p><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd> Toggle fullscreen</p>
          <p><kbd>Esc</kbd> Exit fullscreen / close menus</p>
          <p className="faint">Drag blocks by their handle to reorder. Drop a block from the left panel between existing blocks.</p>
        </div>
      </Modal>
      <ConfirmDialog
        open={confirmBack} onClose={() => setConfirmBack(false)}
        onConfirm={() => { setConfirmBack(false); navigate('/admin/blog'); }}
        title="Leave the studio?" body="You have unsaved changes. Autosave may not have run yet."
        confirmLabel="Leave" cancelLabel="Stay"
      />
      <ConfirmDialog
        open={confirmPublish} onClose={() => setConfirmPublish(false)}
        onConfirm={() => { setConfirmPublish(false); void save({ statusOverride: 'published' }); }}
        title="Publish article" body={`Make "${meta.title || 'Untitled article'}" visible on the public blog?`}
        confirmLabel="Publish"
      />
      <ConfirmDialog
        open={Boolean(pendingImport)} onClose={() => setPendingImport(null)}
        onConfirm={() => { if (pendingImport) { commit(pendingImport, 'import'); setPendingImport(null); toast('Import applied. Undo to revert.', 'success'); } }}
        title="Import article" body="Replace the current content and settings with the imported file? Undo is available afterwards."
        confirmLabel="Import"
      />
      {menuOpen && <div className="st-menu-scrim" onClick={() => setMenuOpen(false)} aria-hidden />}
    </div>
  );
}