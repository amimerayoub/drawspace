/* Regenerate public/sitemap.xml from the public blog API.

   Uses scripts/sitemap.mjs, the same module scripts/prerender.mjs uses to write
   dist/sitemap.xml, so both files list exactly the same URLs. Safe to re-run
   after every publish; only published articles are ever listed.

   Usage:
     node scripts/generate-sitemap.mjs                 # rewrite public/sitemap.xml
     node scripts/generate-sitemap.mjs --dry           # print what would change
     VITE_GAME_SERVER_URL=http://localhost:3001 node scripts/generate-sitemap.mjs
*/
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildSitemap } from './sitemap.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sitemapPath = join(root, 'public', 'sitemap.xml');
// Node resolves localhost to ::1 first, which the dev server does not bind.
const origin = (process.env.VITE_GAME_SERVER_URL || 'https://server.drawspace.cloud')
  .replace(/\/+$/, '')
  .replace('//localhost', '//127.0.0.1');
const dryRun = process.argv.includes('--dry');

/* Locales come from the i18n registry so a new locale cannot be forgotten.
   The source is plain TypeScript with a single array literal, so it is read as
   text rather than importing the module graph into a Node script. */
const i18n = await import('node:fs').then((fs) =>
  fs.readFileSync(join(root, 'src', 'i18n', 'I18nContext.tsx'), 'utf8'),
);
const localeCodes = [...i18n.matchAll(/\{\s*code:\s*'([^']+)'\s*,\s*label:/g)].map((m) => m[1]);
const DEFAULT_LOCALE = /DEFAULT_LOCALE[^=]*=\s*'([^']+)'/.exec(i18n)?.[1] ?? localeCodes[0];

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

const published = articles.filter((article) => article.slug && article.status === 'published');
const next = buildSitemap({
  locales: localeCodes.map((code) => ({ code })),
  articles: published,
  defaultLocale: DEFAULT_LOCALE,
});
const urlCount = (next.match(/<url>/g) ?? []).length;
console.log(`origin: ${origin}`);
console.log(`locales: ${localeCodes.join(', ')}`);
console.log(`published articles: ${published.length}`);
console.log(`total <url> entries: ${urlCount}`);

if (dryRun) {
  console.log('\n--dry: public/sitemap.xml was not written.');
  for (const match of next.matchAll(/<loc>([^<]+)<\/loc>/g)) console.log(`  ${match[1]}`);
} else {
  writeFileSync(sitemapPath, next, 'utf8');
  console.log('public/sitemap.xml updated.');
}
