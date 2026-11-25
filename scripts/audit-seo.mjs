/* Post-build SEO audit. Fails when a prerendered page is missing its own
   metadata, ships an empty/errored body, or when the sitemap and the rendered
   route set disagree.

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
  const html = readFileSync(file, 'utf8');
  const title = decode(/<title>([\s\S]*?)<\/title>/.exec(html)?.[1] ?? '');
  const description = decode(/<meta name="description" content="([^"]*)"/.exec(html)?.[1] ?? '');
  const canonical = /<link rel="canonical" href="([^"]*)"/.exec(html)?.[1] ?? '';
  const robots = /<meta name="robots" content="([^"]*)"/.exec(html)?.[1] ?? '';
  const hreflangs = [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)"/g)].map((m) => m[1]);
  const body = /<div id="root">([\s\S]*)<\/div>\s*<script/.exec(html)?.[1] ?? '';
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
  pages.push({ rel, title, description, canonical, robots, hreflangs, body, h1, schemaTypes, brokenJsonLd, html });
}

const problems = [];
const isNoindex = (p) => p.robots.includes('noindex');

for (const page of pages) {
  const where = page.rel;
  if (/<!--\$!-->/.test(page.body)) problems.push(`${where}: rendered an error boundary instead of content`);
  if (!page.title) problems.push(`${where}: missing <title>`);
  if (page.title.length > 60) problems.push(`${where}: title is ${page.title.length} chars (max 60)`);
  if (!isNoindex(page) && !page.description) problems.push(`${where}: missing meta description`);
  if (page.description.length > 155) problems.push(`${where}: description is ${page.description.length} chars (max 155)`);
  if (!isNoindex(page) && page.h1.length === 0) problems.push(`${where}: no <h1> in the rendered body`);
  if (!isNoindex(page) && page.canonical !== `https://drawspace.cloud/${page.rel.replace(/\.html$/, '')}`) {
    problems.push(`${where}: canonical is ${page.canonical || 'missing'}`);
  }
  if (!isNoindex(page) && page.hreflangs.length !== 9) {
    problems.push(`${where}: expected 9 hreflang links (8 locales + x-default), found ${page.hreflangs.length}`);
  }
  if (!isNoindex(page) && !page.schemaTypes.includes('Organization')) problems.push(`${where}: missing Organization JSON-LD`);
  for (const broken of page.brokenJsonLd) problems.push(`${where}: JSON-LD does not parse (${broken})`);
  if (!isNoindex(page) && !page.schemaTypes.includes('WebSite')) problems.push(`${where}: missing WebSite JSON-LD`);
  if (!isNoindex(page) && /\/(rules|leaderboard|terms|privacy|blog)(\/|\.html)/.test(page.rel) && !page.schemaTypes.includes('BreadcrumbList')) {
    problems.push(`${where}: missing BreadcrumbList JSON-LD`);
  }
  if (/(^|\/)play\.html$/.test(page.rel) && !page.schemaTypes.includes('VideoGame')) problems.push(`${where}: missing VideoGame JSON-LD`);
  if (/\/blog\/[^/]+\.html$/.test(page.rel) && !/\/blog\/category\//.test(page.rel) && !page.schemaTypes.includes('BlogPosting')) {
    problems.push(`${where}: missing BlogPosting JSON-LD`);
  }
}

// Duplicate titles/descriptions within one locale mean two pages competing for
// the same query; the same text across locales is expected only when untranslated.
const seenTitle = new Map();
for (const page of pages.filter((p) => !isNoindex(p))) {
  const key = `${page.rel.split('/')[0]}|${page.title}`;
  seenTitle.set(key, [...(seenTitle.get(key) ?? []), page.rel]);
}
for (const [, urls] of seenTitle) {
  if (urls.length > 1) problems.push(`duplicate title: ${urls.join(' , ')}`);
}

const sitemapPath = join(dist, 'sitemap.xml');
const sitemap = existsSync(sitemapPath) ? readFileSync(sitemapPath, 'utf8') : '';
const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const sitemapPaths = new Set(sitemapUrls.map((u) => u.replace('https://drawspace.cloud/', '').replace(/\/$/, '') || 'en-US'));
const indexable = pages.filter((p) => !isNoindex(p));
const renderedPaths = new Set(indexable.map((p) => p.rel.replace(/\.html$/, '')));

for (const path of renderedPaths) if (!sitemapPaths.has(path)) problems.push(`sitemap is missing /${path}`);
for (const path of sitemapPaths) if (!renderedPaths.has(path)) problems.push(`sitemap lists /${path} but no such page was rendered`);
if (sitemap && /<url>/.test(sitemap) && !/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/.test(sitemap)) problems.push('sitemap has no lastmod dates');

const byType = { home: 0, play: 0, article: 0, category: 0, other: 0 };
for (const p of indexable) {
  if (/^(en-US|en-GB|fr|es|de|ar|pt-BR|ru)\.html$/.test(p.rel)) byType.home += 1;
  else if (/\/play\.html$/.test(p.rel)) byType.play += 1;
  else if (/\/blog\/category\//.test(p.rel)) byType.category += 1;
  else if (/\/blog\/[^/]+\.html$/.test(p.rel)) byType.article += 1;
  else byType.other += 1;
}

console.log(`pages audited: ${pages.length} (${indexable.length} indexable, ${pages.length - indexable.length} noindex)`);
console.log(`home ${byType.home}, play ${byType.play}, articles ${byType.article}, categories ${byType.category}, other ${byType.other}`);
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
