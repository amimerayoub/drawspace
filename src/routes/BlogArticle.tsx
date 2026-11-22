import { useState, useMemo, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Clock,
  Share2,
  Check,
  Copy,
  Twitter,
  Linkedin,
  Sparkles,
  BookOpen,
  ChevronRight,
  ChevronLeft,
  Calendar,
} from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
import { usePublicBlog } from '@/hooks/useQueries';
import { BlogCover } from '@/components/BlogCover';
import { AdSlot } from '@/components/AdSlot';
import { Badge, EmptyState, Spinner } from '@/components/ui';
import { SeoHead } from '@/components/SeoHead';
import { docToPlainText, parseDoc } from '@/studio/types';
import { StudioContent } from '@/studio/blocks';
import { CustomCodeSection } from '@/studio/StudioArticle';
import { BlogMarkdown, extractHeadings, extractFaqs } from '@/components/BlogMarkdown';

function slugifyCategory(cat: string): string {
  return cat.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export default function BlogArticle() {
  const { t, path, formatDate } = useI18n();
  const { slug } = useParams<{ slug: string }>();
  const { data, isLoading, isError } = usePublicBlog(slug);
  const article = data?.data;
  const related = data?.related ?? [];

  const [copied, setCopied] = useState(false);

  const studio = useMemo(() => {
    if (!article) return null;
    return parseDoc(article.studioDoc || article.content);
  }, [article]);

  const headings = useMemo(() => {
    if (!article || studio) return [];
    return extractHeadings(article.content);
  }, [article, studio]);

  const faqs = useMemo(() => {
    if (!article || studio) return [];
    return extractFaqs(article.content);
  }, [article, studio]);

  const wordSource = article ? (studio ? docToPlainText(studio) : article.content) : '';
  const minutes = Math.max(3, Math.round(wordSource.split(/\s+/).filter(Boolean).length / 200));

  const canonicalUrl = useMemo(() => {
    // Blog routes only exist under a locale prefix; a locale-free URL redirects home.
    if (!article) return `https://drawspace.cloud${path('/blog')}`;
    return studio?.meta?.canonical || `https://drawspace.cloud${path(`/blog/${article.slug}`)}`;
  }, [article, studio, path]);

  const handleCopyLink = useCallback(() => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(canonicalUrl).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      });
    }
  }, [canonicalUrl]);

  const structuredData = useMemo(() => {
    if (!article) return undefined;

    const postSchema: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: article.seoTitle || article.title,
      description: article.seoDescription || article.excerpt,
      image: studio?.meta?.ogImage || article.cover || 'https://drawspace.cloud/og-home.png',
      datePublished: article.publishedAt,
      dateModified: article.updatedAt || article.publishedAt,
      author: {
        '@type': 'Organization',
        name: article.author || 'DrawSpace Editorial Team',
        url: 'https://drawspace.cloud',
      },
      publisher: {
        '@type': 'Organization',
        name: 'DrawSpace',
        url: 'https://drawspace.cloud',
        logo: {
          '@type': 'ImageObject',
          url: 'https://drawspace.cloud/logo.png',
        },
      },
      mainEntityOfPage: {
        '@type': 'WebPage',
        '@id': canonicalUrl,
      },
    };

    const site = (route: string) => `https://drawspace.cloud${path(route)}`;
    const breadcrumbSchema: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: site('/') },
        { '@type': 'ListItem', position: 2, name: 'Blog', item: site('/blog') },
        ...(article.category
          ? [
              {
                '@type': 'ListItem',
                position: 3,
                name: article.category,
                item: site(`/blog/category/${slugifyCategory(article.category)}`),
              },
            ]
          : []),
        {
          '@type': 'ListItem',
          position: article.category ? 4 : 3,
          name: article.title,
          item: canonicalUrl,
        },
      ],
    };

    const schemas: Array<Record<string, unknown>> = [postSchema, breadcrumbSchema];

    if (faqs.length > 0) {
      schemas.push({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faqs.map((f) => ({
          '@type': 'Question',
          name: f.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: f.answer,
          },
        })),
      });
    }

    return schemas;
  }, [article, canonicalUrl, faqs, studio, path]);

  if (!isError && (isLoading || !article)) {
    return (
      <div className="page container container-narrow">
        <Spinner label="Loading article…" />
      </div>
    );
  }

  if (isError || !article) {
    return (
      <div className="page container container-narrow">
        <EmptyState
          title={t('notFound.title')}
          action={
            <Link to={path('/blog')} className="btn btn-primary btn-sm">
              {t('blog.back')}
            </Link>
          }
        />
      </div>
    );
  }

  const relatedItems = related.map((a) => ({
    slug: a.slug,
    title: a.title,
    publishedAt: a.publishedAt,
  }));

  const prevArticle = related.length > 0 ? related[0] : null;
  const nextArticle = related.length > 1 ? related[1] : null;

  return (
    <div className="page">
      <SeoHead
        title={`${article.seoTitle || article.title} · DrawSpace`}
        description={article.seoDescription || article.excerpt}
        type="article"
        image={studio?.meta?.ogImage || article.cover || undefined}
        canonical={canonicalUrl}
        structuredData={structuredData}
      />

      <article className="container container-narrow article">
        {/* Breadcrumbs Navigation */}
        <nav aria-label="Breadcrumb" className="blog-breadcrumbs">
          <Link to={path('/')} className="breadcrumb-link">
            Home
          </Link>
          <ChevronRight size={13} className="breadcrumb-separator" aria-hidden />
          <Link to={path('/blog')} className="breadcrumb-link">
            Blog
          </Link>
          {article.category && (
            <>
              <ChevronRight size={13} className="breadcrumb-separator" aria-hidden />
              <Link
                to={path(`/blog/category/${slugifyCategory(article.category)}`)}
                className="breadcrumb-link"
              >
                {article.category}
              </Link>
            </>
          )}
          <ChevronRight size={13} className="breadcrumb-separator" aria-hidden />
          <span className="breadcrumb-current" aria-current="page">
            {article.title}
          </span>
        </nav>

        {/* Back Link */}
        <Link to={path('/blog')} className="article-back faint">
          <ArrowLeft size={14} aria-hidden /> {t('blog.back')}
        </Link>

        {/* Meta Header */}
        <div className="article-meta">
          <Badge tone="outline">{article.category}</Badge>
          <span className="faint article-date">
            <Calendar size={12} aria-hidden /> {formatDate(article.publishedAt)}
          </span>
          <span className="faint article-read">
            <Clock size={12} aria-hidden /> {t('blog.minRead', { min: minutes })}
          </span>
          {article.author && (
            <span className="faint article-author-tag">By {article.author}</span>
          )}
        </div>

        <h1 className="article-title">{article.title}</h1>
        <p className="article-excerpt muted">{article.excerpt}</p>

        {article.cover && (
          <BlogCover cover={article.cover} title={article.title} />
        )}

        {/* Table of Contents for Long-Form Articles */}
        {headings.length >= 3 && (
          <nav className="blog-toc" aria-label="Table of Contents">
            <div className="blog-toc-header">
              <BookOpen size={16} aria-hidden />
              <span>In this guide</span>
            </div>
            <ul className="blog-toc-list">
              {headings.map((h) => (
                <li
                  key={h.id}
                  className={`blog-toc-item level-${h.level}`}
                >
                  <a href={`#${h.id}`}>{h.text}</a>
                </li>
              ))}
            </ul>
          </nav>
        )}

        {/* Article Body */}
        {studio ? (
          <div className="article-body article-body-studio">
            <CustomCodeSection code={studio.code} runScripts position="header" />
            <StudioContent doc={studio} related={relatedItems} pathFor={path} />
            <CustomCodeSection code={studio.code} runScripts position="body" />
            <CustomCodeSection code={studio.code} runScripts position="footer" />
          </div>
        ) : (
          <div className="article-body">
            <BlogMarkdown content={article.content} pathFor={path} />
          </div>
        )}

        {/* Tags */}
        {article.tags && article.tags.length > 0 && (
          <div className="article-tags">
            {article.tags.map((tag) => (
              <Badge key={tag}>{tag}</Badge>
            ))}
          </div>
        )}

        {/* DrawSpace In-Article Game CTA Card */}
        <div className="blog-cta-box">
          <div className="blog-cta-icon">
            <Sparkles size={28} />
          </div>
          <div className="blog-cta-content">
            <h3 className="blog-cta-title">Ready to Play DrawSpace?</h3>
            <p className="blog-cta-text">
              Jump straight into a live multiplayer sketch-and-guess room. Host private games with
              custom word lists, or test your speed against players worldwide—100% free with no install required.
            </p>
            <div className="blog-cta-actions">
              <Link to={path('/create')} className="btn btn-primary btn-md">
                Create Private Room
              </Link>
              <Link to={path('/play')} className="btn btn-secondary btn-md">
                Play DrawSpace Free
              </Link>
            </div>
          </div>
        </div>

        {/* Social Share Bar */}
        <div className="blog-share-bar">
          <span className="blog-share-label">
            <Share2 size={15} aria-hidden /> Share this guide:
          </span>
          <div className="blog-share-buttons">
            <a
              href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(canonicalUrl)}&text=${encodeURIComponent(article.seoTitle || article.title)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary btn-xs share-btn"
              aria-label="Share on X (Twitter)"
            >
              <Twitter size={14} aria-hidden /> X (Twitter)
            </a>
            <a
              href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(canonicalUrl)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary btn-xs share-btn"
              aria-label="Share on LinkedIn"
            >
              <Linkedin size={14} aria-hidden /> LinkedIn
            </a>
            <button
              type="button"
              onClick={handleCopyLink}
              className="btn btn-secondary btn-xs share-btn"
              aria-label="Copy article link"
            >
              {copied ? <Check size={14} className="accent" /> : <Copy size={14} />}
              {copied ? 'Link Copied!' : 'Copy Link'}
            </button>
          </div>
        </div>

        {/* Next / Previous Article Navigation */}
        {(prevArticle || nextArticle) && (
          <div className="blog-nav-pagination">
            {prevArticle && (
              <Link to={path(`/blog/${prevArticle.slug}`)} className="blog-nav-card prev">
                <span className="blog-nav-direction">
                  <ChevronLeft size={14} /> Previous Guide
                </span>
                <span className="blog-nav-title">{prevArticle.title}</span>
              </Link>
            )}
            {nextArticle && (
              <Link to={path(`/blog/${nextArticle.slug}`)} className="blog-nav-card next">
                <span className="blog-nav-direction">
                  Next Guide <ChevronRight size={14} />
                </span>
                <span className="blog-nav-title">{nextArticle.title}</span>
              </Link>
            )}
          </div>
        )}

        <AdSlot placement="blog" />

        {/* Related Articles */}
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
