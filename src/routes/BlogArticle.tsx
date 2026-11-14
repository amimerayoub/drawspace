import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Clock } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
import { contentService, type ContentBlog } from '@/services/content.service';
import { BlogCover } from '@/components/BlogCover';
import { AdSlot } from '@/components/AdSlot';
import { Badge, EmptyState, Spinner } from '@/components/ui';
import { SeoHead } from '@/components/SeoHead';

export default function BlogArticle() {
  const { t, path, formatDate } = useI18n();
  const { slug } = useParams();
  const [article, setArticle] = useState<ContentBlog | undefined>();
  const [related, setRelated] = useState<ContentBlog[]>([]);
  const [loadError, setLoadError] = useState(false);
  useEffect(() => {
    if (!slug) return;
    setArticle(undefined); setLoadError(false);
    void contentService.publicBlog(slug).then((result) => { setArticle(result.data); setRelated(result.related); }).catch(() => setLoadError(true));
  }, [slug]);

  if (!loadError && !article) return <div className="page container container-narrow"><Spinner label="Loading article…" /></div>;
  if (loadError || !article) {
    return (
      <div className="page container container-narrow">
        <EmptyState title={t('notFound.title')} action={<Link to={path('/blog')} className="btn btn-primary btn-sm">{t('blog.back')}</Link>} />
      </div>
    );
  }

  const paragraphs = article.content.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const minutes = Math.max(2, Math.round(paragraphs.join(' ').split(/\s+/).length / 180));

  return (
    <div className="page">
      <SeoHead title={`${article.seoTitle || article.title} · DrawSpace`} description={article.seoDescription || article.excerpt} />
      <article className="container container-narrow article">
        <Link to={path('/blog')} className="article-back faint">
          <ArrowLeft size={14} aria-hidden /> {t('blog.back')}
        </Link>
        <div className="article-meta">
          <Badge tone="outline">{article.category}</Badge>
          <span className="faint">{formatDate(article.publishedAt)}</span>
          <span className="faint article-read"><Clock size={12} aria-hidden /> {t('blog.minRead', { min: minutes })}</span>
        </div>
        <h1 className="article-title">{article.title}</h1>
        <p className="article-excerpt muted">{article.excerpt}</p>
        <BlogCover cover={article.cover} title={article.title} />
        <div className="article-body">
          {paragraphs.map((p, i) => <p key={i}>{p}</p>)}
        </div>
        <div className="article-tags">
          {article.tags.map((tag) => <Badge key={tag}>{tag}</Badge>)}
        </div>
        <p className="faint article-author">{article.author}</p>

        <AdSlot placement="blog" />

        {related.length > 0 && (
          <div className="section">
            <h2 className="section-title">{t('blog.related')}</h2>
            <div className="panel related-list">
              {related.map((a) => (
                <Link key={a.id} to={path(`/blog/${a.slug}`)} className="related-row">
                  <span className="related-title">{a.title}</span>
                  <span className="faint related-date">{formatDate(a.publishedAt)}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </article>
    </div>
  );
}