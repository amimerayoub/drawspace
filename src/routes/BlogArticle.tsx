import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Clock } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
import { useDb } from '@/hooks/useDb';
import { blogService } from '@/services';
import { BlogCover } from '@/components/BlogCover';
import { AdSlot } from '@/components/AdSlot';
import { Badge, EmptyState } from '@/components/ui';
import { SeoHead } from '@/components/SeoHead';

export default function BlogArticle() {
  const { t, path, formatDate } = useI18n();
  const { slug } = useParams();
  useDb();

  const article = slug ? blogService.bySlug(slug) : undefined;
  const visible = article && (article.status === 'published' || (article.status === 'scheduled' && new Date(article.publishAt) <= new Date()));

  if (!article || !visible) {
    return (
      <div className="page container container-narrow">
        <EmptyState title={t('notFound.title')} action={<Link to={path('/blog')} className="btn btn-primary btn-sm">{t('blog.back')}</Link>} />
      </div>
    );
  }

  const related = blogService.published().filter((a) => a.id !== article.id).slice(0, 3);
  const minutes = Math.max(2, Math.round(article.body.join(' ').split(/\s+/).length / 180));

  return (
    <div className="page">
      <SeoHead title={`${article.seoTitle || article.title} · DrawSpace`} description={article.seoDescription || article.excerpt} />
      <article className="container container-narrow article">
        <Link to={path('/blog')} className="article-back faint">
          <ArrowLeft size={14} aria-hidden /> {t('blog.back')}
        </Link>
        <div className="article-meta">
          <Badge tone="outline">{article.category}</Badge>
          <span className="faint">{formatDate(article.publishAt)}</span>
          <span className="faint article-read"><Clock size={12} aria-hidden /> {t('blog.minRead', { min: minutes })}</span>
        </div>
        <h1 className="article-title">{article.title}</h1>
        <p className="article-excerpt muted">{article.excerpt}</p>
        <BlogCover cover={article.cover} title={article.title} />
        <div className="article-body">
          {article.body.map((p, i) => <p key={i}>{p}</p>)}
        </div>
        <div className="article-tags">
          {article.tags.map((tag) => <Badge key={tag}>{tag}</Badge>)}
        </div>
        <p className="faint article-author">{article.author}</p>

        <AdSlot placement="blog" />

        <div className="section">
          <h2 className="section-title">{t('blog.related')}</h2>
          <div className="panel related-list">
            {related.map((a) => (
              <Link key={a.id} to={path(`/blog/${a.slug}`)} className="related-row">
                <span className="related-title">{a.title}</span>
                <span className="faint related-date">{formatDate(a.publishAt)}</span>
              </Link>
            ))}
          </div>
        </div>
      </article>
    </div>
  );
}
