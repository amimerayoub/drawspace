/* Prerender the public routes to static HTML so crawlers receive a fully
   rendered document instead of the empty SPA shell.

   Uses Vite's built-in SSR loader, so there is no browser and no extra
   dependency: Cloudflare's build image does not ship Chromium, which rules out
   puppeteer-based prerenderers.

   Runs after `vite build` and reads dist/index.html as the document template.
   Data is fetched once and seeded into the query cache; if the API is
   unreachable the static routes are still emitted and the build does not fail.

   Usage:
     node scripts/prerender.mjs            # write dist/<route>.html
     node scripts/prerender.mjs --dry      # report what would be written
*/
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server.js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createServer, loadEnv } from 'vite';

/* The studio sanitizer (src/studio/sanitize.ts) parses author HTML with
   DOMParser, which exists in browsers but not in Node. Polyfilling it here —
   instead of branching inside the app — means the prerenderer runs the exact
   same sanitizer the browser runs, so the static HTML cannot contain markup the
   client would have stripped. linkedom is a devDependency: it never ships.

   linkedom's own DOMParser only accepts whole documents and throws on fragment
   input, so the shim builds the document wrapper itself; the Sanitizer then
   reads .body exactly as it does in a browser. */
if (typeof globalThis.DOMParser === 'undefined') {
  const { parseHTML } = await import('linkedom');
  globalThis.DOMParser = class DOMParserShim {
    parseFromString(html) {
      return parseHTML(`<!doctype html><html><body>${String(html ?? '')}</body></html>`).document;
    }
  };
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const dryRun = process.argv.includes('--dry');

// Node resolves localhost to ::1 first, which the dev server does not bind.
const env = loadEnv('production', root, 'VITE_');
// An explicit environment variable wins over .env files so CI (and a local run
// without .env.local) can point the build at the public API.
const origin = (process.env.VITE_GAME_SERVER_URL || env.VITE_GAME_SERVER_URL || 'https://server.drawspace.cloud')
  .replace(/\/+$/, '')
  .replace('//localhost', '//127.0.0.1');
process.env.VITE_GAME_SERVER_URL = origin;
process.env.NODE_ENV = 'production';

const template = readFileSync(join(dist, 'index.html'), 'utf8');

const server = await createServer({
  root,
  configFile: join(root, 'vite.config.ts'),
  mode: 'production',
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
  logLevel: 'error',
});

const load = (file) => server.ssrLoadModule(file);

try {
  const { default: App } = await load('/src/App.tsx');
  const { LOCALES, DEFAULT_LOCALE } = await load('/src/i18n/I18nContext.tsx');
  const { ThemeProvider } = await load('/src/theme/ThemeContext.tsx');
  const { ToastProvider } = await load('/src/context/ToastContext.tsx');
  const { AuthProvider } = await load('/src/context/AuthContext.tsx');
  const { PlatformConfigProvider } = await load('/src/context/PlatformConfigContext.tsx');
  const { HeadCollectorProvider } = await load('/src/seo/HeadCollector.tsx');
  const { headTagsToHtml } = await load('/src/seo/head.ts');
  const { queryKeys } = await load('/src/hooks/useQueries.ts');
  const { contentService } = await load('/src/services/content.service.ts');
  const { apiGet } = await load('/src/services/apiClient.ts');

  // App.tsx loads every route through React.lazy. Warming the modules first
  // means the lazy promises resolve from cache instead of waiting on a cold
  // Vite transform, which would otherwise emit the Suspense fallback.
  const appSource = readFileSync(join(root, 'src', 'App.tsx'), 'utf8');
  const lazyRoutes = [...appSource.matchAll(/import\('@\/routes\/([^']+)'\)/g)].map((m) => `/src/routes/${m[1]}.tsx`);
  for (const file of lazyRoutes) await load(file);

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });

  const warnings = [];
  const seed = async (label, key, fetcher) => {
    try {
      queryClient.setQueryData(key, await fetcher());
      return true;
    } catch (error) {
      warnings.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  };

  await seed('platform config', queryKeys.platformConfig, () => apiGet('/api/platform/config', { auth: 'none' }));
  // auth:'none' skips the Appwrite JWT round-trip; the endpoint is public.
  await seed('leaderboard', queryKeys.leaderboard, () => apiGet('/api/progression/leaderboard', { auth: 'none' }));

  let articles = [];
  const listOk = await seed('blog list', queryKeys.blogList({ limit: 100 }), async () => {
    const payload = await contentService.publicBlogs({ limit: 100 });
    articles = (payload.data ?? []).filter((a) => a.slug && a.status === 'published');
    return payload;
  });
  if (!listOk) articles = [];
  // A missing API does not break the build, but it does silently drop every
  // article and category page: a deploy would then ship a site whose blog URLs
  // fall back to the empty shell. CI can set PRERENDER_REQUIRE_CONTENT=1 to turn
  // that into a failed build instead of a quiet SEO regression.
  const requireContent = process.env.PRERENDER_REQUIRE_CONTENT === '1';
  if (!listOk && requireContent) {
    console.error('blog API unreachable and PRERENDER_REQUIRE_CONTENT=1: refusing to ship without article pages');
    process.exitCode = 1;
  }

  for (const article of articles) {
    await seed(`blog article ${article.slug}`, queryKeys.blogArticle(article.slug), () => contentService.publicBlog(article.slug));
  }

  const toSlug = (text) => String(text).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const categories = [...new Set(articles.map((a) => a.category).filter(Boolean))].map(toSlug).filter(Boolean);

  const STATIC_ROUTES = ['', '/play', '/rules', '/leaderboard', '/blog', '/terms', '/privacy', '/sign-in', '/sign-up'];
  const routes = [];
  for (const locale of LOCALES) {
    for (const route of STATIC_ROUTES) routes.push({ locale: locale.code, dir: locale.dir, path: route });
    for (const category of categories) routes.push({ locale: locale.code, dir: locale.dir, path: `/blog/category/${category}` });
    for (const article of articles) routes.push({ locale: locale.code, dir: locale.dir, path: `/blog/${article.slug}` });
  }

  function tree(location, collector) {
    return React.createElement(StaticRouter, { location },
      React.createElement(QueryClientProvider, { client: queryClient },
        React.createElement(ThemeProvider, null,
          React.createElement(ToastProvider, null,
            React.createElement(AuthProvider, null,
              React.createElement(PlatformConfigProvider, null,
                React.createElement(HeadCollectorProvider, { collector },
                  React.createElement(App))))))));
  }

  async function render(location) {
    let tags = null;
    const collector = { set: (next) => { tags = next; } };
    const element = tree(location, collector);
    let html = '';
    // React.lazy suspends until its chunk resolves and renderToString emits the
    // Suspense fallback instead, which collects no head. Retry until the route
    // has actually rendered; a cold Vite transform can take several ticks.
    for (let attempt = 0; attempt < 12; attempt += 1) {
      html = renderToString(element);
      if (tags) break;
      // A cold dynamic import settles on the next macrotask; give it one.
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    // A component error is swallowed into the markup: React writes <!--$!-->,
    // aborts that subtree and puts the stack in a <template data-msg>. The head
    // tags are still collected, so without this check the route would look
    // prerendered while shipping an empty page.
    if (/<!--\$!-->/.test(html)) {
      const raw = /data-msg="([^"]*)"/.exec(html)?.[1] ?? 'unknown render error';
      const message = raw
        .replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
      throw new Error(`component error: ${message.split('\n')[0]}`);
    }
    return { html, tags };
  }

  const STRIP = [
    /[ \t]*<title>[\s\S]*?<\/title>\r?\n?/g,
    /[ \t]*<meta\s+name="description"[^>]*>\r?\n?/g,
    /[ \t]*<meta\s+name="robots"[^>]*>\r?\n?/g,
    /[ \t]*<link\s+rel="canonical"[^>]*>\r?\n?/g,
    /[ \t]*<meta\s+(?:property|name)="(?:og:|twitter:)[^"]*"[^>]*>\r?\n?/g,
    /[ \t]*<link\s+rel="alternate"[^>]*>\r?\n?/g,
    /[ \t]*<script\s+type="application\/ld\+json"[\s\S]*?<\/script>\r?\n?/g,
  ];

  function buildDocument(route, html, tags) {
    let head = template;
    for (const pattern of STRIP) head = head.replace(pattern, '');
    if (tags.some((tag) => tag.kind === 'link' && tag.rel === 'icon')) {
      head = head.replace(/[ \t]*<link\s+rel="icon"[^>]*>\r?\n?/g, '');
    }
    const headHtml = headTagsToHtml(tags);
    head = head.replace('  </head>', `${headHtml}\n  </head>`);
    head = head.replace(/<html lang="[^"]*"([^>]*)>/, `<html lang="${route.locale}" dir="${route.dir}"$1>`);
    return head.replace('<div id="root"></div>', `<div id="root">${html}</div>`);
  }

  const written = [];
  const skipped = [];
  const broken = [];
  let sitemapUrls = 0;
  const write = (file, contents) => {
    written.push(file);
    if (dryRun) return;
    const target = join(dist, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, contents, 'utf8');
  };

  let firstRender = null;
  for (const route of routes) {
    const location = `/${route.locale}${route.path}`;
    let result;
    try {
      result = await render(location);
    } catch (error) {
      broken.push(`${location} (${error instanceof Error ? error.message : String(error)})`);
      continue;
    }
    const { html, tags } = result;
    if (!tags) {
      skipped.push(location);
      continue;
    }
    const doc = buildDocument(route, html, tags);
    if (route.path === '') {
      // `/` client-redirects to the default locale; serve that page's markup so
      // the root URL is not an empty document, with a canonical pointing at it.
      if (route.locale === DEFAULT_LOCALE) firstRender = doc;
      write(`${route.locale}.html`, doc);
      write(`${route.locale}/index.html`, doc);
    } else {
      write(`${route.locale}${route.path}.html`, doc);
      write(`${route.locale}${route.path}/index.html`, doc);
    }
  }

  if (firstRender) write('index.html', firstRender);

  // Generated from the same article list these pages were rendered from, so
  // every prerendered URL is listed and nothing else is. When the blog API was
  // unreachable the article pages were not rendered either; keep the sitemap
  // copied from public/ rather than overwriting it with a shorter list.
  if (listOk) {
    const { buildSitemap } = await import('./sitemap.mjs');
    const sitemap = buildSitemap({ locales: LOCALES, articles, defaultLocale: DEFAULT_LOCALE });
    write('sitemap.xml', sitemap);
    sitemapUrls = (sitemap.match(/<url>/g) ?? []).length;
  }

  const uniqueUrls = routes.length;
  console.log(`origin: ${origin}`);
  console.log(`locales: ${LOCALES.map((l) => l.code).join(', ')}`);
  console.log(`published articles: ${articles.length}, categories: ${categories.length}`);
  console.log(`routes rendered: ${uniqueUrls - skipped.length - broken.length}/${uniqueUrls}`);
  console.log(`files written: ${written.length} (${sitemapUrls} sitemap URLs)`);
  if (skipped.length > 0) console.log(`no head collected (skipped): ${skipped.join(', ')}`);
  for (const warning of warnings) console.log(`warning: ${warning}`);
  if (dryRun) console.log('\n--dry: dist was not written.');
  if (broken.length > 0) {
    console.error(`\n${broken.length} route(s) failed to render; refusing to ship empty pages:`);
    for (const entry of broken) console.error(`  ${entry}`);
    process.exitCode = 1;
  }
} finally {
  await server.close();
}