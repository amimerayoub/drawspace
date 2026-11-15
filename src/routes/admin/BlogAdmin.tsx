import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Archive, ArrowLeft, Download, Eye, EyeOff, FileUp, Pencil, Plus, Send, Trash2, Wand2 } from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import { contentService, type BlogInput, type BlogStats, type ContentBlog, type ContentBlogStatus } from '@/services/content.service';
import { Badge, Button, ConfirmDialog, Field, Input, NativeSelect, Textarea } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable';
import { AdminPage, StatCard } from './shared';
import { ExportModal, ImportModal } from './ContentTransfer';

const COVERS = ['guess', 'draw', 'learn', 'update', 'community', 'words', 'default'];
const STATUSES: ContentBlogStatus[] = ['draft', 'published', 'scheduled', 'archived'];

interface ArticleForm {
  title: string; slug: string; excerpt: string; body: string; category: string; tags: string;
  status: ContentBlogStatus; cover: string; publishAt: string; seoTitle: string; seoDescription: string;
}

const emptyForm = (): ArticleForm => ({
  title: '', slug: '', excerpt: '', body: '', category: 'Guides', tags: '',
  status: 'draft', cover: 'default', publishAt: new Date().toISOString().slice(0, 10), seoTitle: '', seoDescription: '',
});

function slugify(value: string) {
  return value.toLowerCase().trim().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
}

const statusTone = (status: ContentBlogStatus) => status === 'published' ? 'accent' : status === 'scheduled' ? 'outline' : 'neutral';

export default function BlogAdmin() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [posts, setPosts] = useState<ContentBlog[]>([]);
  const [stats, setStats] = useState<BlogStats | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [editing, setEditing] = useState<ContentBlog | 'new' | null>(null);
  const [form, setForm] = useState<ArticleForm>(emptyForm());
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(true);
  const [deleting, setDeleting] = useState<ContentBlog | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ kind: 'publish' | 'archive' | 'unpublish'; post: ContentBlog } | null>(null);
  const [bulkAction, setBulkAction] = useState<'publish' | 'archive' | 'delete' | null>(null);

  const reload = useCallback(async () => {
    try {
      const [postList, postStats, categoryList] = await Promise.all([contentService.blogs(), contentService.blogStats(), contentService.blogCategories()]);
      setPosts(postList); setStats(postStats); setCategories(categoryList.map((c) => c.name)); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Articles could not be loaded.'); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  const filtered = useMemo(() => posts.filter((p) =>
    (statusFilter === 'all' || p.status === statusFilter) &&
    (categoryFilter === 'all' || p.category === categoryFilter)),
  [posts, statusFilter, categoryFilter]);

  const toggleSelected = (id: string) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const allFilteredSelected = filtered.length > 0 && filtered.every((p) => selected.has(p.id));
  const toggleAll = () => setSelected(allFilteredSelected ? new Set() : new Set(filtered.map((p) => p.id)));

  const open = (post: ContentBlog | 'new') => {
    setFormError('');
    if (post === 'new') setForm(emptyForm());
    else setForm({
      title: post.title, slug: post.slug, excerpt: post.excerpt, body: post.content, category: post.category,
      tags: post.tags.join(', '), status: post.status, cover: post.cover || 'default',
      publishAt: post.publishedAt ? post.publishedAt.slice(0, 10) : new Date().toISOString().slice(0, 10),
      seoTitle: post.seoTitle, seoDescription: post.seoDescription,
    });
    setEditing(post);
  };

  const save = async () => {
    const title = form.title.trim();
    if (!title) { setFormError('The article needs a title.'); return; }
    const slug = form.slug.trim() ? slugify(form.slug) : slugify(title);
    if (!slug) { setFormError('The slug cannot be empty.'); return; }
    if (posts.some((p) => p.slug === slug && (editing === 'new' || p.id !== (editing as ContentBlog).id))) { setFormError('That slug is already used by another article.'); return; }
    const content = form.body.trim();
    if (!content) { setFormError('Write at least one paragraph.'); return; }
    if (form.status === 'scheduled' && !form.publishAt) { setFormError('Scheduled articles need a publish date.'); return; }
    const excerpt = form.excerpt.trim() || content.split(/\n\s*\n/)[0].slice(0, 140);
    const input: BlogInput = {
      title, slug, excerpt, content,
      category: form.category.trim() || 'News',
      tags: form.tags.split(',').map((tag) => tag.trim().toLowerCase()).filter(Boolean).slice(0, 10),
      status: form.status, cover: form.cover,
      publishAt: form.publishAt ? new Date(`${form.publishAt}T10:00:00Z`).toISOString() : undefined,
      seoTitle: form.seoTitle.trim() || title,
      seoDescription: form.seoDescription.trim() || excerpt,
    };
    setSaving(true);
    try {
      if (editing === 'new') await contentService.createBlog(input);
      else await contentService.updateBlog((editing as ContentBlog).id, input);
      toast('Article saved.', 'success');
      setEditing(null);
      await reload();
    } catch (e) { setFormError(e instanceof Error ? e.message : 'Article could not be saved.'); }
    finally { setSaving(false); }
  };

  const runAction = async (kind: 'publish' | 'archive' | 'unpublish', post: ContentBlog) => {
    try {
      if (kind === 'publish') await contentService.publishBlog(post.id);
      else if (kind === 'archive') await contentService.archiveBlog(post.id);
      else await contentService.unpublishBlog(post.id);
      toast(kind === 'publish' ? 'Article published.' : kind === 'archive' ? 'Article archived.' : 'Article moved to drafts.', 'success');
      await reload();
    } catch (e) { toast(e instanceof Error ? e.message : 'The action failed.', 'error'); }
  };

  const runBulk = async () => {
    if (!bulkAction) return;
    const ids = [...selected];
    try {
      for (const id of ids) {
        if (bulkAction === 'publish') await contentService.publishBlog(id);
        else if (bulkAction === 'archive') await contentService.archiveBlog(id);
        else await contentService.deleteBlog(id);
      }
      toast(`${ids.length} articles ${bulkAction === 'delete' ? 'deleted' : bulkAction === 'publish' ? 'published' : 'archived'}.`, 'success');
      setSelected(new Set());
      await reload();
    } catch (e) { toast(e instanceof Error ? e.message : 'Bulk action failed. Some articles may have been updated.', 'error'); await reload(); }
    finally { setBulkAction(null); }
  };

  const columns: Column<ContentBlog>[] = [
    {
      key: 'select', header: <input type="checkbox" checked={allFilteredSelected} onChange={toggleAll} aria-label="Select all filtered articles" />, width: '36px',
      render: (p) => <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelected(p.id)} aria-label={`Select ${p.title}`} />,
    },
    { key: 'title', header: 'Title', width: '26%', render: (p) => <span className="admin-user-name">{p.title}</span>, sortValue: (p) => p.title },
    { key: 'category', header: 'Category', render: (p) => <span className="muted">{p.category}</span>, sortValue: (p) => p.category },
    { key: 'status', header: 'Status', render: (p) => <Badge tone={statusTone(p.status)}>{p.status}</Badge>, sortValue: (p) => p.status },
    { key: 'tags', header: 'Tags', render: (p) => <span className="muted admin-clamp">{p.tags.join(', ') || 'None'}</span> },
    { key: 'publishAt', header: 'Publish date', render: (p) => <span className="muted">{p.publishedAt ? new Date(p.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not set'}</span>, sortValue: (p) => p.publishedAt },
    { key: 'views', header: 'Views', align: 'end', render: (p) => <span className="mono">{p.views.toLocaleString()}</span>, sortValue: (p) => p.views },
    {
      key: 'actions', header: '', align: 'end', width: '185px',
      render: (p) => (
        <span className="admin-row-actions">
          <Button size="sm" variant="ghost" icon={<Wand2 size={13} />} onClick={() => navigate(`/admin/blog/studio/${p.id}`)} aria-label={`Open ${p.title} in Studio`} />
          <Button size="sm" variant="ghost" icon={<Pencil size={13} />} onClick={() => open(p)} aria-label={`Edit ${p.title}`} />
          {p.status === 'published'
            ? <Button size="sm" variant="ghost" icon={<EyeOff size={13} />} onClick={() => setConfirmAction({ kind: 'unpublish', post: p })} aria-label={`Unpublish ${p.title}`} />
            : <Button size="sm" variant="ghost" icon={<Send size={13} />} onClick={() => setConfirmAction({ kind: 'publish', post: p })} aria-label={`Publish ${p.title}`} />}
          <Button size="sm" variant="ghost" icon={<Archive size={13} />} onClick={() => setConfirmAction({ kind: 'archive', post: p })} aria-label={`Archive ${p.title}`} />
          <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => setDeleting(p)} aria-label={`Delete ${p.title}`} />
        </span>
      ),
    },
  ];

  if (editing) {
    const previewSlug = form.slug.trim() ? slugify(form.slug) : slugify(form.title) || 'preview';
    const paragraphs = form.body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    return (
      <AdminPage
        title={editing === 'new' ? 'New article' : 'Edit article'}
        sub="Separate paragraphs with a blank line. The excerpt is used on cards and in search results."
        actions={<>
          <Button variant="ghost" icon={<ArrowLeft size={15} />} onClick={() => setEditing(null)}>Back to list</Button>
          <Button variant="ghost" icon={preview ? <EyeOff size={15} /> : <Eye size={15} />} onClick={() => setPreview(!preview)}>{preview ? 'Hide preview' : 'Show preview'}</Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>Save article</Button>
        </>}
      >
        <div className="admin-blog-editor">
          <div className="panel panel-pad">
            <Field label="Title" htmlFor="b-title">
              <Input id="b-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={255} />
            </Field>
            <div className="admin-form-grid">
              <Field label="Slug" htmlFor="b-slug" hint="Leave empty to generate from the title.">
                <Input id="b-slug" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="guess-faster" />
              </Field>
              <Field label="Category" htmlFor="b-cat">
                <Input id="b-cat" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} list="b-cats" />
              </Field>
            </div>
            <datalist id="b-cats">
              {[...new Set([...categories, ...posts.map((p) => p.category)])].map((c) => <option key={c} value={c} />)}
            </datalist>
            <Field label="Excerpt" htmlFor="b-excerpt" hint="One or two sentences shown on the blog card.">
              <Textarea id="b-excerpt" value={form.excerpt} onChange={(e) => setForm({ ...form, excerpt: e.target.value })} rows={2} maxLength={500} />
            </Field>
            <Field label="Body" htmlFor="b-body" hint="Plain text with blank lines between paragraphs.">
              <Textarea id="b-body" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={12} />
            </Field>
            <Field label="Tags" htmlFor="b-tags" hint="Comma separated, up to 10. Stored once the content schema migration is applied.">
              <Input id="b-tags" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="tips, guessing" />
            </Field>
            {formError && <p role="alert" className="admin-form-error">{formError}</p>}
          </div>
          <div className="admin-blog-side">
            <div className="panel panel-pad">
              <h2 className="admin-panel-title">Publishing</h2>
              <Field label="Status" htmlFor="b-status">
                <NativeSelect id="b-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ContentBlogStatus })}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Publish date" htmlFor="b-date" hint="Scheduled articles go live on this date.">
                <Input id="b-date" type="date" value={form.publishAt} onChange={(e) => setForm({ ...form, publishAt: e.target.value })} />
              </Field>
              <Field label="Cover" htmlFor="b-cover">
                <NativeSelect id="b-cover" value={form.cover} onChange={(e) => setForm({ ...form, cover: e.target.value })}>
                  {COVERS.map((c) => <option key={c} value={c}>{c}</option>)}
                </NativeSelect>
              </Field>
              <p className="faint admin-field-hint">Preview path: <span className="mono">/en-US/blog/{previewSlug}</span></p>
            </div>
            <div className="panel panel-pad">
              <h2 className="admin-panel-title">SEO</h2>
              <Field label="Meta title" htmlFor="b-seo-title" hint="Falls back to the article title.">
                <Input id="b-seo-title" value={form.seoTitle} onChange={(e) => setForm({ ...form, seoTitle: e.target.value })} maxLength={128} />
              </Field>
              <Field label="Meta description" htmlFor="b-seo-desc">
                <Textarea id="b-seo-desc" value={form.seoDescription} onChange={(e) => setForm({ ...form, seoDescription: e.target.value })} rows={3} maxLength={255} />
              </Field>
            </div>
          </div>
        </div>
        {preview && (
          <div className="panel panel-pad admin-blog-preview">
            <h2 className="admin-panel-title">Live preview</h2>
            <article className="article">
              <div className="article-meta">
                <Badge tone="outline">{form.category.trim() || 'News'}</Badge>
                <Badge tone={statusTone(form.status)}>{form.status}</Badge>
              </div>
              <h1 className="article-title">{form.title.trim() || 'Untitled article'}</h1>
              <p className="article-excerpt muted">{form.excerpt.trim() || paragraphs[0]?.slice(0, 140) || 'The excerpt appears here.'}</p>
              <div className="article-body">
                {paragraphs.length > 0 ? paragraphs.map((p, i) => <p key={i}>{p}</p>) : <p className="muted">Start writing to see the preview.</p>}
              </div>
              <div className="article-tags">
                {form.tags.split(',').map((tag) => tag.trim().toLowerCase()).filter(Boolean).map((tag) => <Badge key={tag}>{tag}</Badge>)}
              </div>
            </article>
          </div>
        )}
      </AdminPage>
    );
  }

  return (
    <AdminPage
      title="Blog"
      sub="Drafts, scheduled, and archived posts are hidden from the public blog."
      actions={<>
        <Button variant="ghost" icon={<FileUp size={15} />} onClick={() => setImportOpen(true)}>Import</Button>
        <Button variant="ghost" icon={<Download size={15} />} onClick={() => setExportOpen(true)}>Export</Button>
        <Button variant="secondary" icon={<Wand2 size={15} />} onClick={() => navigate('/admin/blog/studio')}>Open Studio</Button>
        <Button variant="primary" icon={<Plus size={15} />} onClick={() => open('new')}>New article</Button>
      </>}
    >
      {error && <p role="alert" className="muted">{error}</p>}
      <div className="admin-stat-grid">
        <StatCard label="Total posts" value={stats?.total ?? posts.length} />
        <StatCard label="Published" value={stats?.published ?? 0} />
        <StatCard label="Drafts" value={stats?.draft ?? 0} hint={`${stats?.scheduled ?? 0} scheduled, ${stats?.archived ?? 0} archived`} />
        <StatCard label="Total views" value={(stats?.totalViews ?? 0).toLocaleString()} hint={stats && stats.mostViewed.length > 0 ? `Most viewed: ${stats.mostViewed[0].title}` : undefined} />
      </div>
      <div className="panel">
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(p) => p.id}
          searchable
          searchPlaceholder="Search title, category, tags"
          searchLabel="Search articles"
          searchValue={(p) => `${p.title} ${p.category} ${p.author} ${p.status} ${p.tags.join(' ')}`}
          pageSize={10}
          emptyTitle="No articles yet"
          toolbar={<>
            <NativeSelect value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status">
              <option value="all">All statuses</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </NativeSelect>
            <NativeSelect value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} aria-label="Filter by category">
              <option value="all">All categories</option>
              {[...new Set(posts.map((p) => p.category))].map((c) => <option key={c} value={c}>{c}</option>)}
            </NativeSelect>
            {selected.size > 0 && <>
              <Button size="sm" variant="ghost" icon={<Send size={13} />} onClick={() => setBulkAction('publish')}>Publish {selected.size}</Button>
              <Button size="sm" variant="ghost" icon={<Archive size={13} />} onClick={() => setBulkAction('archive')}>Archive {selected.size}</Button>
              <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} onClick={() => setBulkAction('delete')}>Delete {selected.size}</Button>
            </>}
          </>}
        />
      </div>

      <ConfirmDialog
        open={Boolean(deleting)} onClose={() => setDeleting(null)}
        onConfirm={() => { if (deleting) void contentService.deleteBlog(deleting.id).then(() => { setDeleting(null); toast('Article deleted.', 'success'); return reload(); }).catch((e: unknown) => toast(e instanceof Error ? e.message : 'Article could not be deleted.', 'error')); }}
        title="Delete article" body={`Delete "${deleting?.title}"? This cannot be undone.`}
        confirmLabel="Delete"
      />
      <ConfirmDialog
        open={Boolean(confirmAction)} onClose={() => setConfirmAction(null)}
        onConfirm={() => { if (confirmAction) void runAction(confirmAction.kind, confirmAction.post); }}
        title={confirmAction?.kind === 'publish' ? 'Publish article' : confirmAction?.kind === 'archive' ? 'Archive article' : 'Unpublish article'}
        body={confirmAction?.kind === 'publish' ? `Make "${confirmAction?.post.title}" visible on the public blog?` : confirmAction?.kind === 'archive' ? `Archive "${confirmAction?.post.title}"? It will be hidden from the public blog.` : `Move "${confirmAction?.post.title}" back to drafts?`}
        confirmLabel={confirmAction?.kind === 'publish' ? 'Publish' : confirmAction?.kind === 'archive' ? 'Archive' : 'Unpublish'}
      />
      <ConfirmDialog
        open={Boolean(bulkAction)} onClose={() => setBulkAction(null)}
        onConfirm={() => { void runBulk(); }}
        title={bulkAction === 'delete' ? 'Delete selected articles' : bulkAction === 'publish' ? 'Publish selected articles' : 'Archive selected articles'}
        body={`${bulkAction === 'delete' ? 'Permanently delete' : bulkAction === 'publish' ? 'Publish' : 'Archive'} ${selected.size} selected articles?`}
        confirmLabel={bulkAction === 'delete' ? `Delete ${selected.size}` : bulkAction === 'publish' ? `Publish ${selected.size}` : `Archive ${selected.size}`}
      />
      <ImportModal kind="blogs" open={importOpen} onClose={() => setImportOpen(false)} onImported={reload} />
      <ExportModal kind="blogs" open={exportOpen} onClose={() => setExportOpen(false)} selectedIds={[...selected]} />
    </AdminPage>
  );
}