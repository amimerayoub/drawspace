import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
import { useDb } from '@/hooks/useDb';
import { blogService } from '@/services';
import { BlogCover } from '@/components/BlogCover';
import { AdSlot } from '@/components/AdSlot';
import { Badge, EmptyState, Tabs } from '@/components/ui';
import { SeoHead } from '@/components/SeoHead';

export default function Blog() {
  const { t, path, formatDate } = useI18n();
  useDb();
  const [category, setCategory] = useState('all');

  const articles = blogService.published();
  const categories = ['all', ...Array.from(new Set(articles.map((a) => a.category)))];
  const list = category === 'all' ? articles : articles.filter((a) => a.category === category);

  return (
    <div className="page">
      <SeoHead title={`${t('blog.title')} · DrawSpace`} description={t('blog.sub')} />
      <div className="container">
        <div className="page-head">
          <h1 className="page-title">{t('blog.title')}</h1>
          <p className="page-sub">{t('blog.sub')}</p>
        </div>

        <Tabs
          label={t('blog.title')}
          active={category}
          onChange={setCategory}
          tabs={categories.map((c) => ({ id: c, label: c === 'all' ? t('common.all') : c }))}
        />

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
                    <span className="faint">{formatDate(a.publishAt)}</span>
                  </div>
                  <h2 className="blog-card-title">{a.title}</h2>
                  <p className="muted blog-card-excerpt">{a.excerpt}</p>
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
