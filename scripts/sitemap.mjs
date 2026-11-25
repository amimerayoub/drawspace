/* Single source of truth for public/sitemap.xml and dist/sitemap.xml.

   Both the prerenderer (which knows exactly which routes it wrote) and
   scripts/generate-sitemap.mjs (which runs without a build) call this module,
   so the sitemap and the rendered pages cannot drift apart.

   Every listed URL exists in all published locales and carries the full
   xhtml:link alternate set plus a real lastmod. */

export const SITE_URL = 'https://drawspace.cloud';

/* Date the indexable static copy last changed. Bump it when the copy of the
   page changes; articles and categories take their own dates from the API. */
export const CONTENT_UPDATED = '2026-11-18';

/* Indexable routes shared by every locale. Auth-only, admin and invite/room
   URLs are intentionally absent: they are noindex and must not be crawled. */
export const STATIC_PAGES = [
  { path: '/', changefreq: 'weekly', priority: '1.0' },
  { path: '/play', changefreq: 'weekly', priority: '0.9' },
  { path: '/blog', changefreq: 'weekly', priority: '0.8' },
  { path: '/rules', changefreq: 'monthly', priority: '0.6' },
  { path: '/leaderboard', changefreq: 'daily', priority: '0.6' },
  { path: '/terms', changefreq: 'yearly', priority: '0.3' },
  { path: '/privacy', changefreq: 'yearly', priority: '0.3' },
];

const xmlEscape = (value) =>
  String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** API timestamps are ISO strings; the sitemap wants YYYY-MM-DD. */
export function isoDate(value, fallback = CONTENT_UPDATED) {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(value ?? ''));
  return match ? match[1] : fallback;
}

export function slugify(text) {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Distinct category slugs from published articles, in alphabetical order. */
export function categorySlugs(articles) {
  return [...new Set(articles.map((a) => a.category).filter(Boolean).map(slugify).filter(Boolean))].sort();
}

function localizedUrl(locale, path) {
  return `${SITE_URL}/${locale}${path === '/' ? '' : path}`;
}

/** One <url> per locale variant, each listing every alternate. */
function urlBlock(entry, localeCodes, defaultLocale) {
  const { path, lastmod, changefreq, priority } = entry;
  const lines = ['  <url>', `    <loc>${xmlEscape(localizedUrl(entry.locale, path))}</loc>`];
  for (const code of localeCodes) {
    lines.push(`    <xhtml:link rel="alternate" hreflang="${code}" href="${xmlEscape(localizedUrl(code, path))}"/>`);
  }
  lines.push(
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${xmlEscape(localizedUrl(defaultLocale, path))}"/>`,
    `    <lastmod>${lastmod}</lastmod>`,
    `    <changefreq>${changefreq}</changefreq>`,
    `    <priority>${priority}</priority>`,
    '  </url>',
  );
  return lines.join('\n');
}

/**
 * @param {object} input
 * @param {{code: string}[]} input.locales  published locales, first is x-default
 * @param {Array<{slug: string, category?: string, publishedAt?: string, updatedAt?: string}>} input.articles
 * @returns {string} the complete sitemap document
 */
export function buildSitemap({ locales, articles, defaultLocale }) {
  const codes = locales.map((l) => l.code);
  const primary = defaultLocale ?? codes[0];
  const published = articles.filter((a) => a.slug);

  const entries = [];
  for (const page of STATIC_PAGES) {
    for (const code of codes) {
      entries.push({ ...page, locale: code, lastmod: CONTENT_UPDATED });
    }
  }

  for (const slug of categorySlugs(published)) {
    const owned = published.filter((a) => slugify(a.category) === slug);
    const lastmod = owned
      .map((a) => isoDate(a.updatedAt || a.publishedAt))
      .sort()
      .pop();
    for (const code of codes) {
      entries.push({
        path: `/blog/category/${slug}`,
        changefreq: 'weekly',
        priority: '0.6',
        locale: code,
        lastmod: lastmod ?? CONTENT_UPDATED,
      });
    }
  }

  const sorted = [...published].sort((a, b) =>
    isoDate(b.updatedAt || b.publishedAt).localeCompare(isoDate(a.updatedAt || a.publishedAt)),
  );
  for (const article of sorted) {
    for (const code of codes) {
      entries.push({
        path: `/blog/${article.slug}`,
        changefreq: 'monthly',
        priority: '0.7',
        locale: code,
        lastmod: isoDate(article.updatedAt || article.publishedAt),
      });
    }
  }

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...entries.map((entry) => urlBlock(entry, codes, primary)),
    '</urlset>',
    '',
  ].join('\n');
}
