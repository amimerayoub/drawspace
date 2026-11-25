/* Post-build SEO audit. Verifies the generated output (not component source):
   every routable page has its own head and real HTML, translated pages carry the
   full alternate set, English-only editorial pages have one canonical URL, and
   the sitemap lists exactly the indexable pages.

   Usage:
     node scripts/audit-seo.mjs          # audit dist/
     node scripts/audit-seo.mjs --verbose
*/
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const verbose = process.argv.includes('--verbose');

if (!existsSync(dist)) {
  console.error('dist/ is missing: run `npm run build` first.');
  process.exit(1);
}

const SITE = 'https://drawspace.cloud';
const LOCALES = ['en-US', 'en-GB', 'fr', 'es', 'de', 'ar', 'pt-BR', 'ru'];
const DEFAULT_LOCALE = 'en-US';
const TRANSLATED_ROUTES = new Set(['/', '/play', '/blog', '/rules', '/leaderboard', '/terms', '/privacy']);

const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith('.html')) out.push(full);
  }
  return out;
};

const decode = (value) => value
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>');

const pages = [];
for (const file of walk(dist)) {
  const rel = relative(dist, file).replace(/\\/g, '/');
  // `<locale>/<path>/index.html` and `<locale>/<path>.html` are the same page
  // written twice for host compatibility; audit one copy.
  if (rel === '200.html' || rel === 'index.html') continue;
  if (rel.endsWith('/index.html')) continue;
  // Host-level documents (Cloudflare error pages, SPA shells) are not routes.
  if (rel.startsWith('errors/') || rel === '404.html') continue;
  const html = readFileSync(file, 'utf8');
  const title = decode(/<title>([\s\S]*?)<\/title>/.exec(html)?.[1] ?? '');
  const description = decode(/<meta name="description" content="([^"]*)"/.exec(html)?.[1] ?? '');
  const canonical = /<link rel="canonical" href="([^"]*)"/.exec(html)?.[1] ?? '';
  const robots = /<meta name="robots" content="([^"]*)"/.exec(html)?.[1] ?? '';
  const hreflangs = [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)"/g)].map((m) => m[1]);
  // Vite injects the module script into <head>, so the body runs from #root to </body>.
  const rootStart = html.indexOf('<div id="root">');
  const bodyEnd = html.lastIndexOf('</body>');
  const body = rootStart >= 0 && bodyEnd > rootStart ? html.slice(rootStart, bodyEnd) : '';
  const h1 = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').trim());
  const schemaTypes = [...new Set([...html.matchAll(/"@type":"([A-Za-z]+)"/g)].map((m) => m[1]))];
  const brokenJsonLd = [];
  for (const match of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      JSON.parse(match[1].replace(/\\u003c/g, '<'));
    } catch {
      brokenJsonLd.push(match[1].slice(0, 80));
    }
  }
  const text = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  pages.push({ rel, title, description, canonical, robots, hreflangs, body, text, h1, schemaTypes, brokenJsonLd });
}

/* Which route is this? Determines whether it must be translated or is
   English-only editorial content with a single canonical URL. */
function classify(rel) {
  const path = rel.replace(/\.html$/, '');
  const [locale, ...rest] = path.split('/');
  if (!LOCALES.includes(locale)) return { kind: 'other', locale: null, path };
  const routePath = `/${rest.join('/')}`.replace(/\/$/, '') || '/';
  if (TRANSLATED_ROUTES.has(routePath)) return { kind: 'translated', locale, path: routePath };
  if (routePath.startsWith('/blog/category/')) return { kind: 'category', locale, path: routePath };
  if (/^\/blog\/[^/]+$/.test(routePath)) return { kind: 'article', locale, path: routePath };
  return { kind: 'other', locale, path: routePath };
}

const problems = [];
const isNoindex = (p) => p.robots.includes('noindex');

for (const page of pages) {
  const where = page.rel;
  const { kind, locale, path } = classify(page.rel);
  const selfUrl = `${SITE}/${page.rel.replace(/\.html$/, '')}`;
  const defaultUrl = `${SITE}/${DEFAULT_LOCALE}${path === '/' ? '' : path}`;

  if (/<!--\$!-->/.test(page.body)) problems.push(`${where}: rendered an error boundary instead of content`);
  if (!page.title) problems.push(`${where}: missing <title>`);
  if (page.title.length > 60) problems.push(`${where}: title is ${page.title.length} chars (max 60)`);
  if (!page.description) problems.push(`${where}: missing meta description`);
  if (page.description.length > 155) problems.push(`${where}: description is ${page.description.length} chars (max 155)`);
  if (!page.h1.length) problems.push(`${where}: no <h1> in the rendered body`);
  if (page.text.split(' ').length < 20) problems.push(`${where}: rendered body has almost no text (${page.text.length} chars)`);
  for (const broken of page.brokenJsonLd) problems.push(`${where}: JSON-LD does not parse (${broken})`);

  if (kind === 'translated') {
    if (isNoindex(page)) problems.push(`${where}: translated page must be indexable`);
    if (page.canonical !== selfUrl) problems.push(`${where}: canonical is ${page.canonical || 'missing'}, expected ${selfUrl}`);
    if (page.hreflangs.length !== LOCALES.length + 1) {
      problems.push(`${where}: expected ${LOCALES.length + 1} hreflang links, found ${page.hreflangs.length}`);
    }
    if (!page.schemaTypes.includes('Organization')) problems.push(`${where}: missing Organization JSON-LD`);
    if (!page.schemaTypes.includes('WebSite')) problems.push(`${where}: missing WebSite JSON-LD`);
  }

  if (kind === 'article' || kind === 'category') {
    if (page.hreflangs.length !== 0) {
      problems.push(`${where}: English-only content must not advertise alternates (found ${page.hreflangs.length})`);
    }
    if (locale === DEFAULT_LOCALE) {
      if (isNoindex(page)) problems.push(`${where}: canonical content page must be indexable`);
      if (page.canonical !== selfUrl) problems.push(`${where}: canonical is ${page.canonical || 'missing'}, expected ${selfUrl}`);
    } else {
      if (!isNoindex(page)) problems.push(`${where}: duplicate locale page must be noindex`);
      if (page.canonical !== defaultUrl) problems.push(`${where}: canonical is ${page.canonical || 'missing'}, expected ${defaultUrl}`);
    }
  }

  if (kind === 'other' && !isNoindex(page)) problems.push(`${where}: ${path} must be noindex`);

  if (isNoindex(page)) continue;

  if (kind === 'translated' && path === '/blog' && !page.schemaTypes.includes('Blog')) {
    problems.push(`${where}: missing Blog JSON-LD`);
  }
  if (kind === 'category' && !page.schemaTypes.includes('CollectionPage')) {
    problems.push(`${where}: missing CollectionPage JSON-LD`);
  }
  if (kind === 'category' && !page.schemaTypes.includes('BreadcrumbList')) {
    problems.push(`${where}: missing BreadcrumbList JSON-LD`);
  }
  if (kind === 'article' && !page.schemaTypes.includes('BlogPosting')) {
    problems.push(`${where}: missing BlogPosting JSON-LD`);
  }
  if (kind === 'article' && !page.schemaTypes.includes('BreadcrumbList')) {
    problems.push(`${where}: missing BreadcrumbList JSON-LD`);
  }
  if ((kind === 'translated') && path === '/' && !page.schemaTypes.includes('FAQPage')) {
    problems.push(`${where}: missing FAQPage JSON-LD`);
  }
  if (kind === 'translated' && path === '/' && !page.schemaTypes.includes('VideoGame')) {
    problems.push(`${where}: missing VideoGame JSON-LD`);
  }
  if (kind === 'translated' && path === '/play' && !page.schemaTypes.includes('VideoGame')) {
    problems.push(`${where}: missing VideoGame JSON-LD`);
  }
  if (kind === 'translated' && ['/rules', '/leaderboard', '/terms', '/privacy'].includes(path) && !page.schemaTypes.includes('BreadcrumbList')) {
    problems.push(`${where}: missing BreadcrumbList JSON-LD`);
  }
}

// Two indexable pages with the same title compete for the same query.
const seenTitle = new Map();
for (const page of pages.filter((p) => !isNoindex(p))) {
  const key = `${page.rel.split('/')[0]}|${page.title}`;
  seenTitle.set(key, [...(seenTitle.get(key) ?? []), page.rel]);
}
for (const [, urls] of seenTitle) {
  if (urls.length > 1) problems.push(`duplicate title: ${urls.join(' , ')}`);
}

// The fallback shell serves non-prerendered routes (admin, invite links,
// unknown URLs) and must never be indexable.
const shellPath = join(dist, '200.html');
if (!existsSync(shellPath)) {
  problems.push('dist/200.html is missing: unknown routes would 404 instead of booting the app');
} else {
  const shell = readFileSync(shellPath, 'utf8');
  if (!/<meta name="robots" content="[^"]*noindex/.test(shell)) problems.push('dist/200.html is indexable; the fallback shell must be noindex');
  if (!shell.includes('<div id="root"></div>')) problems.push('dist/200.html is not a pristine shell (it contains prerendered markup)');
}

const sitemapPath = join(dist, 'sitemap.xml');
const sitemap = existsSync(sitemapPath) ? readFileSync(sitemapPath, 'utf8') : '';
const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const duplicates = sitemapUrls.filter((url, i) => sitemapUrls.indexOf(url) !== i);
if (duplicates.length) problems.push(`sitemap has duplicate URLs: ${[...new Set(duplicates)].slice(0, 3).join(', ')}`);
for (const url of sitemapUrls) {
  if (!url.startsWith(`${SITE}/`)) problems.push(`sitemap URL is not on the production domain: ${url}`);
  if (/localhost|127\.0\.0\.1|\.pages\.dev/.test(url)) problems.push(`sitemap contains a preview URL: ${url}`);
}
const sitemapPaths = new Set(sitemapUrls.map((u) => u.slice(SITE.length + 1).replace(/\/$/, '') || DEFAULT_LOCALE));
const indexable = pages.filter((p) => !isNoindex(p));
const renderedPaths = new Set(indexable.map((p) => p.rel.replace(/\.html$/, '')));

for (const path of renderedPaths) if (!sitemapPaths.has(path)) problems.push(`sitemap is missing /${path}`);
for (const path of sitemapPaths) if (!renderedPaths.has(path)) problems.push(`sitemap lists /${path} but it is not an indexable rendered page`);
if (sitemap && /<url>/.test(sitemap) && !/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/.test(sitemap)) problems.push('sitemap has no lastmod dates');

const counts = { translated: 0, article: 0, category: 0, other: 0, noindex: 0 };
for (const page of pages) {
  if (isNoindex(page)) counts.noindex += 1;
  else counts[classify(page.rel).kind] += 1;
}

console.log(`pages audited: ${pages.length} (${indexable.length} indexable, ${counts.noindex} noindex)`);
console.log(`translated ${counts.translated}, articles ${counts.article}, categories ${counts.category}, other ${counts.other}`);
console.log(`sitemap URLs: ${sitemapUrls.length}`);
if (verbose) {
  for (const page of pages) console.log(`${page.rel} | ${page.title} | ${page.description.slice(0, 60)}`);
}

if (problems.length === 0) {
  console.log('\nOK: every page has its own head, rendered body and sitemap entry.');
} else {
  console.error(`\n${problems.length} problem(s):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exitCode = 1;
}
