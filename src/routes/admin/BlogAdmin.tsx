import { useState } from 'react';
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react';
import type { Article, ArticleStatus } from '@/types';
import { useDb } from '@/hooks/useDb';
import { useToast } from '@/context/ToastContext';
import { blogService } from '@/services';
import { uid } from '@/services/db';
import { Badge, Button, ConfirmDialog, Field, Input, NativeSelect, Textarea } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable';
import { AdminPage, useAdmin } from './shared';

const COVERS = ['guess', 'draw', 'learn', 'update', 'community', 'words', 'default'];
const STATUSES: ArticleStatus[] = ['draft', 'published', 'scheduled'];

interface ArticleForm {
  title: string; slug: string; excerpt: string; body: string; category: string; tags: string;
  status: ArticleStatus; cover: string; publishAt: string; seoTitle: string; seoDescription: string;
}

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

export default function BlogAdmin() {
  const db = useDb();
  const { name } = useAdmin();
  const { toast } = useToast();
  const [editing, setEditing] = useState<Article | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Article | null>(null);
  const [form, setForm] = useState<ArticleForm>({
    title: '', slug: '', excerpt: '', body: '', category: 'Guides', tags: '',
    status: 'draft', cover: 'default', publishAt: '', seoTitle: '', seoDescription: '',
  });

  const open = (a: Article | 'new') => {
    if (a === 'new') {
      setForm({ title: '', slug: '', excerpt: '', body: '', category: 'Guides', tags: '', status: 'draft', cover: 'default', publishAt: new Date().toISOString().slice(0, 10), seoTitle: '', seoDescription: '' });
    } else {
      setForm({
        title: a.title, slug: a.slug, excerpt: a.excerpt, body: a.body.join('\n\n'), category: a.category,
        tags: a.tags.join(', '), status: a.status, cover: a.cover, publishAt: a.publishAt.slice(0, 10),
        seoTitle: a.seoTitle, seoDescription: a.seoDescription,
      });
    }
    setEditing(a);
  };

  const save = () => {
    if (!form.title.trim()) { toast('The article needs a title.', 'error'); return; }
    const slug = form.slug.trim() ? slugify(form.slug) : slugify(form.title);
    if (!slug) { toast('The slug cannot be empty.', 'error'); return; }
    if (db.articles.some((a) => a.slug === slug && (editing === 'new' || a.id !== (editing as Article).id))) {
      toast('That slug is already used by another article.', 'error'); return;
    }
    const body = form.body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    if (body.length === 0) { toast('Write at least one paragraph.', 'error'); return; }
    const article: Article = {
      id: editing === 'new' ? uid('post') : (editing as Article).id,
      slug,
      title: form.title.trim(),
      excerpt: form.excerpt.trim() || body[0].slice(0, 140),
      body,
      category: form.category.trim() || 'News',
      tags: form.tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean),
      status: form.status,
      author: editing === 'new' ? name : (editing as Article).author,
      cover: form.cover,
      createdAt: editing === 'new' ? new Date().toISOString() : (editing as Article).createdAt,
      publishAt: form.publishAt ? new Date(`${form.publishAt}T10:00:00Z`).toISOString() : new Date().toISOString(),
      seoTitle: form.seoTitle.trim() || form.title.trim(),
      seoDescription: form.seoDescription.trim() || form.excerpt.trim(),
      views: editing === 'new' ? 0 : (editing as Article).views,
    };
    blogService.save(article, name);
    toast(editing === 'new' ? 'Article created.' : 'Article saved.', 'success');
    setEditing(null);
  };

  const columns: Column<Article>[] = [
    { key: 'title', header: 'Title', width: '32%', render: (a) => <span className="admin-user-name">{a.title}</span>, sortValue: (a) => a.title },
    { key: 'category', header: 'Category', render: (a) => <span className="muted">{a.category}</span>, sortValue: (a) => a.category },
    { key: 'status', header: 'Status', render: (a) => <Badge tone={a.status === 'published' ? 'accent' : 'neutral'}>{a.status}</Badge>, sortValue: (a) => a.status },
    { key: 'author', header: 'Author', render: (a) => <span className="muted">{a.author}</span>, sortValue: (a) => a.author },
    { key: 'publishAt', header: 'Publish date', render: (a) => <span className="muted">{new Date(a.publishAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>, sortValue: (a) => a.publishAt },
    { key: 'views', header: 'Views', align: 'end', render: (a) => <span className="mono">{a.views.toLocaleString()}</span>, sortValue: (a) => a.views },
    {
      key: 'actions', header: '', align: 'end', width: '110px',
      render: (a) => (
        <span className="admin-row-actions">
          <Button size="sm" variant="ghost" icon={<Pencil size={13} />} onClick={() => open(a)} aria-label={`Edit ${a.title}`} />
          <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => setDeleting(a)} aria-label={`Delete ${a.title}`} />
        </span>
      ),
    },
  ];

  if (editing) {
    const previewUrl = `/en-US/blog/${form.slug || slugify(form.title) || 'preview'}`;
    return (
      <AdminPage
        title={editing === 'new' ? 'New article' : 'Edit article'}
        sub="Separate paragraphs with a blank line. The excerpt is used on cards and in search results."
        actions={<>
          <Button variant="ghost" icon={<ArrowLeft size={15} />} onClick={() => setEditing(null)}>Back to list</Button>
          <Button variant="primary" onClick={save}>Save article</Button>
        </>}
      >
        <div className="admin-blog-editor">
          <div className="panel panel-pad">
            <Field label="Title" htmlFor="b-title">
              <Input id="b-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={90} />
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
              {[...new Set(db.articles.map((a) => a.category))].map((c) => <option key={c} value={c} />)}
            </datalist>
            <Field label="Excerpt" htmlFor="b-excerpt" hint="One or two sentences shown on the blog card.">
              <Textarea id="b-excerpt" value={form.excerpt} onChange={(e) => setForm({ ...form, excerpt: e.target.value })} rows={2} maxLength={220} />
            </Field>
            <Field label="Body" htmlFor="b-body">
              <Textarea id="b-body" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={12} />
            </Field>
            <Field label="Tags" htmlFor="b-tags" hint="Comma separated.">
              <Input id="b-tags" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="tips, guessing" />
            </Field>
          </div>
          <div className="admin-blog-side">
            <div className="panel panel-pad">
              <h2 className="admin-panel-title">Publishing</h2>
              <Field label="Status" htmlFor="b-status">
                <NativeSelect id="b-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ArticleStatus })}>
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
              <p className="faint admin-field-hint">Preview path: <span className="mono">{previewUrl}</span></p>
            </div>
            <div className="panel panel-pad">
              <h2 className="admin-panel-title">SEO</h2>
              <Field label="Meta title" htmlFor="b-seo-title" hint="Falls back to the article title.">
                <Input id="b-seo-title" value={form.seoTitle} onChange={(e) => setForm({ ...form, seoTitle: e.target.value })} maxLength={70} />
              </Field>
              <Field label="Meta description" htmlFor="b-seo-desc">
                <Textarea id="b-seo-desc" value={form.seoDescription} onChange={(e) => setForm({ ...form, seoDescription: e.target.value })} rows={3} maxLength={170} />
              </Field>
            </div>
          </div>
        </div>
      </AdminPage>
    );
  }

  return (
    <AdminPage
      title="Blog"
      sub={`${db.articles.length} articles. Drafts and scheduled posts are hidden from the public blog.`}
      actions={<Button variant="primary" icon={<Plus size={15} />} onClick={() => open('new')}>New article</Button>}
    >
      <div className="panel">
        <DataTable columns={columns} rows={db.articles} rowKey={(a) => a.id} searchable
          searchPlaceholder="Search title, category, author" searchLabel="Search articles"
          searchValue={(a) => `${a.title} ${a.category} ${a.author} ${a.status}`}
          emptyTitle="No articles yet" />
      </div>

      <ConfirmDialog
        open={Boolean(deleting)} onClose={() => setDeleting(null)}
        onConfirm={() => { if (deleting) { blogService.remove(deleting.id, name); toast('Article deleted.', 'success'); } }}
        title="Delete article" body={`Delete "${deleting?.title}"?`}
        confirmLabel="Delete"
      />
    </AdminPage>
  );
}