import { useMemo, useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { ArrowRight, Sparkles, BookOpen, Clock, Calendar } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
import { usePublicBlogs } from '@/hooks/useQueries';
import { BlogCover } from '@/components/BlogCover';
import { AdSlot } from '@/components/AdSlot';
import { Badge, EmptyState, SearchInput, Tabs } from '@/components/ui';
import { SeoHead } from '@/components/SeoHead';

function toSlug(text: string): string {
  return text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export default function Blog() {
  const { t, path, formatDate } = useI18n();
  const { categorySlug } = useParams<{ categorySlug?: string }>();
  const navigate = useNavigate();

  const [category, setCategory] = useState('all');
  const [tag, setTag] = useState('all');
  const [search, setSearch] = useState('');

  const { data, error: loadError } = usePublicBlogs({ limit: 100 });
  const articles = data?.data ?? [];
  const error = loadError instanceof Error ? loadError.message : loadError ? 'Blog articles could not be loaded.' : '';

  const categories = useMemo(() => {
    return ['all', ...Array.from(new Set(articles.map((a) => a.category).filter(Boolean)))];
  }, [articles]);

  const tags = useMemo(() => {
    return ['all', ...Array.from(new Set(articles.flatMap((a) => a.tags || []).filter(Boolean)))];
  }, [articles]);

  // Sync category state with URL param
  useEffect(() => {
    if (categorySlug) {
      const match = categories.find((c) => c !== 'all' && toSlug(c) === categorySlug.toLowerCase());
      if (match) {
        setCategory(match);
      }
    } else {
      setCategory('all');
    }
  }, [categorySlug, categories]);

  const handleCategoryChange = (val: string) => {
    setCategory(val);
    if (val === 'all') {
      navigate(path('/blog'));
    } else {
      navigate(path(`/blog/category/${toSlug(val)}`));
    }
  };

  const list = useMemo(() => {
    const query = search.trim().toLowerCase();
    return articles.filter((a) =>
      (category === 'all' || a.category === category) &&
      (tag === 'all' || (a.tags && a.tags.includes(tag))) &&
      (!query ||
        a.title.toLowerCase().includes(query) ||
        a.excerpt.toLowerCase().includes(query) ||
        (a.tags && a.tags.some((item) => item.toLowerCase().includes(query)))));
  }, [articles, category, tag, search]);

  // When no filters are active, highlight the first article as Hero
  const isDefaultView = category === 'all' && tag === 'all' && !search.trim();
  const heroArticle = isDefaultView && list.length > 0 ? list[0] : null;
  const gridArticles = isDefaultView ? list.slice(1) : list;

  return (
    <div className="page">
      <SeoHead
        title={
          category !== 'all'
            ? `${category} Guides & Articles · DrawSpace Blog`
            : `${t('blog.title')} · DrawSpace`
        }
        description={
          category !== 'all'
            ? `Explore the best drawing game guides, word lists, and multiplayer tips for ${category} on DrawSpace.`
            : t('blog.sub')
        }
      />

      <div className="container">
        <div className="page-head">
          <h1 className="page-title">{t('blog.title')}</h1>
          <p className="page-sub">{t('blog.sub')}</p>
        </div>

        {error && <p role="alert" className="muted">{error}</p>}

        <div className="blog-filters">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t('common.search')}
            label={t('common.search')}
          />
        </div>

        <Tabs
          label={t('blog.title')}
          active={category}
          onChange={handleCategoryChange}
          tabs={categories.map((c) => ({
            id: c,
            label: c === 'all' ? t('common.all') : c,
          }))}
        />

        {tags.length > 1 && (
          <Tabs
            label="Tags"
            active={tag}
            onChange={setTag}
            tabs={tags.map((item) => ({
              id: item,
              label: item === 'all' ? t('common.all') : item,
            }))}
          />
        )}

        {/* Featured Hero Article */}
        {heroArticle && (
          <Link
            to={path(`/blog/${heroArticle.slug}`)}
            className="panel blog-hero"
            aria-label={`Featured: ${heroArticle.title}`}
          >
            <div className="blog-hero-cover-wrap">
              <BlogCover cover={heroArticle.cover} title={heroArticle.title} />
            </div>
            <div className="blog-hero-body">
              <div className="blog-hero-badge-row">
                <Badge tone="accent">
                  <Sparkles size={11} aria-hidden /> Featured Guide
                </Badge>
                <Badge tone="outline">{heroArticle.category}</Badge>
                <span className="faint blog-hero-date">
                  <Calendar size={12} aria-hidden /> {formatDate(heroArticle.publishedAt)}
                </span>
              </div>
              <h2 className="blog-hero-title">{heroArticle.title}</h2>
              <p className="blog-hero-excerpt muted">{heroArticle.excerpt}</p>
              <div className="blog-hero-footer">
                <span className="blog-card-more accent">
                  Read Full Guide <ArrowRight size={14} aria-hidden />
                </span>
              </div>
            </div>
          </Link>
        )}

        {list.length === 0 ? (
          <EmptyState title={t('lobby.noRooms')} />
        ) : (
          <div className="blog-grid">
            {gridArticles.map((a) => (
              <Link key={a.id} to={path(`/blog/${a.slug}`)} className="panel blog-card">
                <BlogCover cover={a.cover} title={a.title} />
                <div className="blog-card-body">
                  <div className="blog-card-meta">
                    <Badge tone="outline">{a.category}</Badge>
                    <span className="faint">{formatDate(a.publishedAt)}</span>
                  </div>
                  <h2 className="blog-card-title">{a.title}</h2>
                  <p className="muted blog-card-excerpt">{a.excerpt}</p>
                  {a.tags && a.tags.length > 0 && (
                    <div className="blog-card-tags">
                      {a.tags.slice(0, 3).map((item) => (
                        <Badge key={item}>{item}</Badge>
                      ))}
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

        {/* DrawSpace Community Game CTA */}
        <div className="blog-cta-box blog-cta-hub">
          <div className="blog-cta-icon">
            <BookOpen size={28} />
          </div>
          <div className="blog-cta-content">
            <h3 className="blog-cta-title">Looking for a Free Online Drawing Game?</h3>
            <p className="blog-cta-text">
              DrawSpace runs smoothly on all desktop and mobile browsers. Create private rooms for friends,
              office icebreakers, or family game nights with built-in word lists and zero ads during rounds.
            </p>
            <div className="blog-cta-actions">
              <Link to={path('/create')} className="btn btn-primary btn-md">
                Create a Free Room
              </Link>
              <Link to={path('/play')} className="btn btn-secondary btn-md">
                Quick Play
              </Link>
            </div>
          </div>
        </div>

        <AdSlot placement="blog" />
      </div>
    </div>
  );
}
