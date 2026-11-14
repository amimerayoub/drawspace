import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
import { contentService, type ContentBlog } from '@/services/content.service';
import { BlogCover } from '@/components/BlogCover';
import { AdSlot } from '@/components/AdSlot';
import { Badge, EmptyState, SearchInput, Tabs } from '@/components/ui';
import { SeoHead } from '@/components/SeoHead';

export default function Blog() {
  const { t, path, formatDate } = useI18n();
  const [category, setCategory] = useState('all');
  const [tag, setTag] = useState('all');
  const [search, setSearch] = useState('');
  const [articles, setArticles] = useState<ContentBlog[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { void contentService.publicBlogs({ limit: 100 }).then((result) => setArticles(result.data)).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Blog articles could not be loaded.')); }, []);

  const categories = ['all', ...Array.from(new Set(articles.map((a) => a.category)))];
  const tags = ['all', ...Array.from(new Set(articles.flatMap((a) => a.tags)))];
  const list = useMemo(() => {
    const query = search.trim().toLowerCase();
    return articles.filter((a) =>
      (category === 'all' || a.category === category) &&
      (tag === 'all' || a.tags.includes(tag)) &&
      (!query || a.title.toLowerCase().includes(query) || a.excerpt.toLowerCase().includes(query) || a.tags.some((item) => item.includes(query))));
  }, [articles, category, tag, search]);

  return (
    <div className="page">
      <SeoHead title={`${t('blog.title')} · DrawSpace`} description={t('blog.sub')} />
      <div className="container">
        <div className="page-head">
          <h1 className="page-title">{t('blog.title')}</h1>
          <p className="page-sub">{t('blog.sub')}</p>
        </div>
        {error && <p role="alert" className="muted">{error}</p>}

        <div className="blog-filters">
          <SearchInput value={search} onChange={setSearch} placeholder={t('common.search')} label={t('common.search')} />
        </div>
        <Tabs
          label={t('blog.title')}
          active={category}
          onChange={(value) => { setCategory(value); }}
          tabs={categories.map((c) => ({ id: c, label: c === 'all' ? t('common.all') : c }))}
        />
        {tags.length > 1 && (
          <Tabs
            label="Tags"
            active={tag}
            onChange={setTag}
            tabs={tags.map((item) => ({ id: item, label: item === 'all' ? t('common.all') : item }))}
          />
        )}

        {list.length === 0 ? (
          <EmptyState title={t('lobby.noRooms')} />
        ) : (
          <div className="blog-grid">
            {list.map((a) => (
              <Link key={a.id} to={path(`/blog/${a.slug}`)} className="panel blog-card">
                <BlogCover cover={a.cover} title={a.title} />
                <div className="blog-card-body">
                  <div className="blog-card-meta">
                    <Badge tone="outline">{a.category}</Badge>
                    <span className="faint">{formatDate(a.publishedAt)}</span>
                  </div>
                  <h2 className="blog-card-title">{a.title}</h2>
                  <p className="muted blog-card-excerpt">{a.excerpt}</p>
                  {a.tags.length > 0 && (
                    <div className="blog-card-tags">
                      {a.tags.slice(0, 3).map((item) => <Badge key={item}>{item}</Badge>)}
                    </div>
                  )}
                  <span className="blog-card-more accent">
                    {t('blog.readMore')} <ArrowRight size={13} aria-hidden />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}

        <AdSlot placement="blog" />
      </div>
    </div>
  );
}