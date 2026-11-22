/* Regenerate the blog article entries in public/sitemap.xml from the public API.

   The static routes in the file are left untouched, so this is safe to re-run
   after every publish. Only published articles are ever listed: the public
   endpoint does not return drafts, archived, or future-scheduled posts.

   Usage:
     node scripts/generate-sitemap.mjs                 # rewrite public/sitemap.xml
     node scripts/generate-sitemap.mjs --dry           # print what would change
     VITE_GAME_SERVER_URL=http://localhost:3001 node scripts/generate-sitemap.mjs
*/
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sitemapPath = join(root, 'public', 'sitemap.xml');
const siteUrl = 'https://drawspace.cloud';
// Node resolves localhost to ::1 first, which the dev server does not bind.
const origin = (process.env.VITE_GAME_SERVER_URL || 'https://server.drawspace.cloud')
  .replace(/\/+$/, '')
  .replace('//localhost', '//127.0.0.1');
const dryRun = process.argv.includes('--dry');

const xmlEscape = (value) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* Locales come from the sitemap itself so the file stays the single source of
   truth and a new locale does not require editing this script. */
function readLocales(xml) {
  const firstUrl = /<url>[\s\S]*?<\/url>/.exec(xml)?.[0] ?? '';
  const codes = [...firstUrl.matchAll(/hreflang="([^"]+)"/g)].map((m) => m[1]).filter((c) => c !== 'x-default');
  return codes.length > 0 ? codes : ['en-US'];
}

function articleUrl(slug, locales, lastmod) {
  const primary = `${siteUrl}/${locales[0]}/blog/${slug}`;
  const alternates = locales
    .map((code) => `    <xhtml:link rel="alternate" hreflang="${code}" href="${siteUrl}/${code}/blog/${slug}"/>`)
    .concat([`    <xhtml:link rel="alternate" hreflang="x-default" href="${primary}"/>`])
    .join('\n');
  return [
    '  <url>',
    `    <loc>${primary}</loc>`,
    alternates,
    `    <lastmod>${lastmod}</lastmod>`,
    '    <changefreq>monthly</changefreq>',
    '    <priority>0.8</priority>',
    '  </url>',
  ].join('\n');
}

const current = readFileSync(sitemapPath, 'utf8');
const locales = readLocales(current);

/* The public list caps limit at 100 and pages with a cursor. */
const articles = [];
let cursor = '';
for (let page = 0; page < 50; page += 1) {
  const url = `${origin}/api/v1/public/blogs?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`The public blog API returned ${response.status} from ${origin}.`);
  const payload = await response.json();
  articles.push(...(payload.data ?? []));
  cursor = payload.pagination?.nextCursor ?? '';
  if (!cursor) break;
}

// Drop existing article entries; /blog and /blog/category/* index pages are kept.
const blocks = current.match(/[ \t]*<url>[\s\S]*?<\/url>\n?/g) ?? [];
const isArticle = (block) => /<loc>[^<]*\/blog\/(?!category\/)[^<]+<\/loc>/.test(block);
const kept = blocks.filter((block) => !isArticle(block));
const removed = blocks.length - kept.length;

const generated = articles
  .filter((article) => article.slug && article.status === 'published')
  .sort((a, b) => String(b.publishedAt ?? '').localeCompare(String(a.publishedAt ?? '')))
  .map((article) => articleUrl(
    article.slug,
    locales,
    String(article.updatedAt || article.publishedAt || '').slice(0, 10),
  ));

const head = current.slice(0, current.indexOf(blocks[0] ?? ''));
const tail = '</urlset>\n';
const next = `${head}${kept.join('')}${generated.map((entry) => `${entry}\n`).join('')}${tail}`;

console.log(`origin: ${origin}`);
console.log(`locales: ${locales.join(', ')}`);
console.log(`published articles: ${generated.length}`);
console.log(`article entries removed: ${removed}, written: ${generated.length}`);
console.log(`total <url> entries: ${kept.length + generated.length}`);

if (dryRun) {
  console.log('\n--dry: public/sitemap.xml was not written.');
  for (const article of generated) console.log(`  ${article.match(/<loc>([^<]+)</)[1]}`);
} else if (next === current) {
  console.log('public/sitemap.xml is already up to date.');
} else {
  writeFileSync(sitemapPath, next, 'utf8');
  console.log('public/sitemap.xml updated.');
}
