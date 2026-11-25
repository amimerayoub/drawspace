# DrawSpace SEO Infrastructure Recovery — Engineering Report

**Website:** https://drawspace.cloud · **Backend:** https://server.drawspace.cloud
**Report date:** 2026-11-25
**Baseline commit:** `9f8799ed81dd2c9c2ca92cda739e349303baa0ef`
**Working branch:** `codex/drawspace-seo-recovery` (created from the baseline, uncommitted changes only)
**Status:** implementation complete and verified on generated output. Nothing committed, pushed or deployed.

---

## 1. Baseline commit confirmation

| Check | Result |
|---|---|
| Requested commit exists | Yes — `9f8799ed81dd2c9c2ca92cda739e349303baa0ef` |
| Commit subject | `phase 1 backend rebuild` baseline tip of the requested tree |
| Working tree at the start of this task | Clean, `HEAD` detached/checked out at `9f8799e` |
| Work preserved | Yes — no `git reset --hard`, no `git clean -fd`, no branch or worktree deleted, no force-push, no amend |
| Parent/ancestry inspected | Yes, plus `git show --stat` and the full file tree of the baseline |
| Features later than the baseline | The baseline already contains the 8-locale i18n system, the Studio blog editor, the MCP content module and the full multiplayer stack. No application feature had to be removed to make the baseline build |

Prior work that existed in the repository was **not** discarded: an earlier SEO attempt lives on `backup/seo-prerender-38adbbe` (→ `38adbbe`, also `origin/main`) and was used only as a reference; the implementation described here was re-derived on top of the requested baseline and then corrected against the specification. The pre-existing worktree `phase1-backend-rebuild` and its branch were left untouched.

---

## 2. Git branch/worktree details

| Item | Value |
|---|---|
| Original branch / HEAD (untouched) | `codex/phase1-backend-rebuild` |
| Requested baseline | `9f8799ed81dd2c9c2ca92cda739e349303baa0ef` |
| New branch | `codex/drawspace-seo-recovery`, `HEAD` verified at exactly `9f8799e` before the first edit |
| Worktree path | `C:\Users\space amr\Downloads\test\project scribbl\draw space f\.worktrees\phase1-backend-rebuild` |
| Commits created | **None** (explicitly forbidden by the task) |
| Remote state | Untouched — no push, no tag, no amend |
| Diff size | 27 modified files, 5 new source/script files, 1 new report, +4430 / −367 lines |

Safety rails honoured: no force-push, no `git reset --hard`, no `git clean -fd`, no branch/worktree deletion, `platform_state.json` untouched, no secrets written anywhere in the tree.

---

## 3. Original architecture findings

| Area | What the baseline actually is |
|---|---|
| Frontend | React 18 + TypeScript + Vite 5, single-page app, `BrowserRouter` |
| Routing | `/` → `Navigate` to `/{DEFAULT_LOCALE}`; every public route nested under `/:locale` (`play`, `blog`, `blog/:slug`, `blog/category/:categorySlug`, `rules`, `leaderboard`, `terms`, `privacy`, `sign-in`, `sign-up`, `profile`, `achievements`, `challenges`, `game/:code`, `room/:code`, …); `/join/:code` and `/admin/*` sit outside the locale tree |
| Entry point | `src/main.tsx` → `ReactDOM.createRoot(document.getElementById('root')!)`, no hydration |
| Locales | `en-US` (default), `en-GB`, `fr`, `es`, `de`, `ar` (RTL), `pt-BR`, `ru` — driven by `src/i18n/`, 1000+ dictionary keys per locale |
| Head management | `src/components/SeoHead.tsx`, imperative `document.head` mutation inside `useEffect` |
| Blog data | Appwrite TablesDB via the Express backend; public read endpoints `GET /api/v1/public/blogs?limit=100` and `GET /api/v1/public/blogs/:slug`; 21 published articles and 9 categories at the time of the build |
| Article body format | Two formats share one `content` column: legacy CommonMark-lite markdown, and the newer **Studio doc** (`DS-STUDIO-1` sentinel + JSON blocks). All 21 live articles are Studio docs |
| Sitemap | `public/sitemap.xml`, produced by `scripts/generate-sitemap.mjs` (dev-time, `.env.local`) |
| Index HTML | Static `index.html` with `lang="en-US"`, one title, one description, canonical `https://drawspace.cloud/` |
| Hosting | Cloudflare Pages (static), `public/_headers` (CSP in Report-Only), `public/_redirects` |
| Backend | Express + Socket.IO on Railway, Appwrite Cloud for data/auth/storage |

---

## 4. Verified SEO problems

Every row below was checked against the **raw HTTP response** of the deployed site (not the rendered DOM), and against the source that produces it.

### 4.1 Phase-one audit

| Area | Current behaviour (verified) | Problem | Proposed fix |
|---|---|---|---|
| Homepage HTML | 3,130-byte shell; `<div id="root"></div>` empty; title `DrawSpace · Draw, guess, learn English`; description `DrawSpace is a multiplayer drawing and guessing game…`; canonical `https://drawspace.cloud/`; 0 hreflang; 0 JSON-LD | No content, no headings, generic metadata, no alternates | Build-time prerender of `/en-US` + 7 locales with per-locale head and schema |
| Blog HTML | Byte-identical shell | Same | Prerender `/blog` per locale from real article list |
| Article HTML | Byte-identical shell for all 21 articles — no H1, no body, no dates | 100 % of editorial content invisible to crawlers | Prerender all 21 articles at their canonical locale |
| Category HTML | Byte-identical shell for all 9 categories | Category hubs unusable for search | Prerender 9 categories; `CollectionPage` + breadcrumbs |
| Sitemap | 58 `<url>` entries: 7 static pages × 8 locales = 56, plus only **2 of 21** articles; **0 categories** | Hardcoded subset, silently stale | Generate from the same content list the prerenderer uses; 86 URLs |
| Metadata | One title and one description site-wide; canonical on `/`, `/fr/blog`, `/en-US/blog/<slug>` all pointed at `https://drawspace.cloud/` | Duplicate metadata, wrong canonicals, self-cannibalising | Unique title/description/canonical per indexable URL, 60/155-char budgets |
| Structured data | None anywhere | No entity, no article, no breadcrumb signals | JSON-LD per page type, validated at build time |
| Multilingual SEO | `lang="en-US"` in the static shell for **every** URL, including `/fr/*` and `/ar/*`; 0 alternates; no `dir` | Wrong language declaration, no `hreflang`, RTL not declared | Per-locale `lang`/`dir` in prerendered HTML, 8 alternates + `x-default` |
| Cloudflare deployment | `_redirects` sent every unknown path to the SPA shell (which was the homepage head) | Non-prerendered URLs (admin, invites, typos) would have been indexable | Fallback now points at a **noindex** `200.html` |

### 4.2 Problems found while verifying this implementation (fixed in this pass)

| Problem | Evidence | Fix |
|---|---|---|
| Article JSON-LD published an internal automation id as the author: `"author":{"@type":"Organization","name":"mcp:claude"}` | `dist/en-US/blog/*.html` | Author emitted only when the stored value looks like a public name (`publicAuthorName`) |
| The same id was printed **visibly** in the byline: `By mcp:claude` | Rendered article header | Same guard on the visible byline; byline omitted otherwise |
| Studio-format articles had **no table of contents** — `headings` was computed only for markdown, and 21/21 live articles are Studio docs | `blog-toc` count 0 on a 1,317-word article with 10 H2s | `collectHeadings()` over Studio blocks, anchors match the rendered `s-<blockId>` ids (22 targets, 22 ids, 0 dead) |
| `public/sitemap.xml` still held the older 296-URL all-locale list (noindex pages included) | `Compare-Object` vs `dist/sitemap.xml` | Regenerated; `public/` and `dist/` are now byte-identical (verified by SHA-256) |
| A build without content access silently shipped a blog-less site | `scripts/prerender.mjs` swallowed the API error | `PRERENDER_REQUIRE_CONTENT=1` turns a missing content API into a failed build |
| The SPA fallback shell was indexable | `dist/200.html` had `index, follow` | `scripts/build.mjs` stamps `noindex, follow` on the shell copy; `audit-seo.mjs` now fails if it is missing |

**Distinction:** all rows above are verified from raw output or source. No problem in this report is assumed. The only unverified assumption carried over from the earlier audit — that Appwrite content is English-only — was confirmed by inspecting the 21 returned documents (no localized title/body fields exist).

---

## 5. Rendering solution selected and why

**Choice: build-time prerendering of SEO routes, integrated into the normal Vite build. No framework migration, no Cloudflare SSR, no headless browser.**

Options evaluated:

| Option | Verdict |
|---|---|
| SSG with a new framework (Astro/Next) | Rejected — violates the "do not migrate" constraint, duplicates the i18n and Studio rendering stack |
| Cloudflare Pages Functions SSR | Rejected — adds a runtime, a cold-start path and a second rendering environment for content that changes a few times a week |
| Headless-Chromium prerender (e.g. `puppeteer`) | Rejected — 300 MB dependency, minutes of build time, non-deterministic output; the app already renders to string |
| **Vite SSR loader + `renderToString` + `StaticRouter`** | **Selected** — reuses the real routes, real i18n and real components; deterministic; ~7 s for 312 routes on the Cloudflare build image |

How it works (`scripts/build.mjs` → `vite build` → `node scripts/prerender.mjs`):

1. `vite build` produces the normal client bundle **and** an SSR bundle through `vite.ssrLoadModule('src/entry-server')`.
2. The prerenderer seeds the React Query cache server-side with the real public API payloads (`/api/platform/config`, `/api/progression/leaderboard`, `blogs?limit=100`, and one article per slug) so no component suspends into its loading state.
3. Each route is rendered with `renderToString(<StaticRouter location="/<locale>/<path>">…)`. `SeoHead` detects the absence of a DOM and hands its tag list to `HeadCollectorProvider` instead of mutating `document.head`.
4. `buildDocument()` injects the tags into a copy of `index.html`, rewrites `<html lang dir>`, strips the static baseline head, and puts the markup inside `<div id="root">`.
5. Each page is written twice — `dist/<locale>/<path>.html` and `dist/<locale>/<path>/index.html` — so Cloudflare serves it for both `/fr/play` and `/fr/play/`.
6. `dist/index.html` is the prerendered `en-US` page (canonical → `/en-US`); the untouched shell is copied to `dist/200.html` and stamped `noindex, follow` for everything that must stay client-side.
7. A route that renders the React error boundary (`<!--$!-->`) fails the build instead of shipping an empty page.

Interactive routes (canvas, `/game/:code`, `/room/:code`, `/results`, `/join/:code`, `/admin/*`, profile, achievements, challenges) are intentionally **not** prerendered; they keep the SPA shell with `noindex`.

One non-obvious build detail: the article sanitizer uses the browser `DOMParser`. At build time `linkedom` (dev-only, never bundled) supplies it through a fragment shim, so sanitized output is identical in both environments rather than silently diverging.

---

## 6. Files created

| File | Lines | Purpose |
|---|---|---|
| `src/seo/head.ts` | 329 | Single source of truth for the head: `buildHeadTags`, `fitTitle` (60), `fitDescription` (155), `alternateUrls`, `organizationSchema`, `websiteSchema`, `videoGameSchema`, `breadcrumbSchema`, `headTagsToHtml` (build), `applyHeadTags` (browser) |
| `src/seo/HeadCollector.tsx` | 18 | Context that lets `SeoHead` emit tags during `renderToString`, where effects never run |
| `scripts/prerender.mjs` | 265 | Route list, content seeding, SSR render, document assembly, sitemap write, strict-content gate |
| `scripts/sitemap.mjs` | 130 | `STATIC_PAGES`, `localeUrl`, `urlBlock`, `buildSitemap` — shared by the prerenderer and the dev script so they cannot drift |
| `scripts/audit-seo.mjs` | 232 | Post-build gate over `dist/**/*.html` + `sitemap.xml` + `200.html` |
| `docs/SEO_RECOVERY_REPORT.md` | this file | Engineering report |

---

## 7. Files modified

| File | Change |
|---|---|
| `package.json` / `package-lock.json` | `linkedom` devDependency; `prerender` and `seo:audit` scripts |
| `scripts/build.mjs` | Runs the prerenderer after `vite build`; writes the `noindex` fallback shell |
| `scripts/generate-sitemap.mjs` | Now a thin wrapper over `scripts/sitemap.mjs` (86 entries instead of a hardcoded list) |
| `src/components/SeoHead.tsx` | Rewritten on top of `buildHeadTags`; new `translated` prop; collector path for SSR; single tag-signature diff on the client (no duplicate tags after navigation) |
| `src/i18n/en.ts`, `src/i18n/translations.ts` | `seo.*` keys and localized homepage title/description for `fr`, `es`, `de`, `ar`, `pt-BR`, `ru` (written in those languages, not machine placeholders; `en-GB` inherits `en-US`) |
| `src/routes/Landing.tsx` | New homepage title/description, one H1, `VideoGame` + `FAQPage` schema from the 5 FAQs that are actually on the page |
| `src/routes/Blog.tsx` | Derived `isCategoryPage` / `canonicalUrl` / `pageTitle` / `pageDescription`; `Blog` schema on the index, `CollectionPage` on categories; category and non-English variants `noindex` |
| `src/routes/BlogArticle.tsx` | Canonical pinned to `/en-US/blog/<slug>`, non-default locales `noindex`; Studio TOC (`collectHeadings`); `publicAuthorName` guard on byline and `BlogPosting.author`; breadcrumbs from the default locale |
| 21 other route files | Pass page-level metadata to `SeoHead` (2-line changes each), so no public page falls back to the generic title |
| `public/_redirects` | `/* /200.html 200` (was `/index.html`) — static files still win, everything else gets the noindex shell |
| `public/sitemap.xml` | Regenerated: 58 → 86 URLs, byte-identical to `dist/sitemap.xml` |

`server/` was not modified. No feature was removed, no route was deleted, no test was weakened.

---

## 8. Sitemap implementation details

`scripts/sitemap.mjs` builds the file from the same `articles` / `categories` arrays the prerenderer rendered, so a URL is listed only if a page for it exists.

| Source | Rule | URLs |
|---|---|---|
| `STATIC_PAGES` (`/`, `/play`, `/blog`, `/rules`, `/leaderboard`, `/terms`, `/privacy`) × 8 locales | Genuinely translated → `index`, listed with alternates | 56 |
| Categories (9) | English-only → default locale only | 9 |
| Articles (21, `status === 'published'`) | English-only → default locale only | 21 |
| **Total** | | **86** |

- **Excluded:** drafts and deleted posts (API filter + `status === 'published'` re-check), `/admin`, `/sign-in`, `/sign-up`, `/room/*`, `/join/*`, `/game/*`, `/results/*`, profile, achievements, challenges, every `noindex` page, duplicate and redirect URLs, localhost/preview hosts.
- **Alternates:** `<xhtml:link rel="alternate" hreflang="…">` only on entries that exist in all 8 locales (504 links); content entries carry none, which is what makes them consistent with their `noindex` duplicates.
- **`x-default`** → `en-US`.
- **`lastmod`:** articles use `updatedAt || publishedAt` normalised to `YYYY-MM-DD`; static pages use a pinned `CONTENT_UPDATED = '2026-11-18'`. Range in the shipped file: `2026-11-01` … `2026-11-22`. Dates are never invented when the API has none — the pinned constant is used instead.
- `robots.txt` already referenced `https://drawspace.cloud/sitemap.xml` and disallows `/admin`; left as-is (verified).
- No sitemap index: 86 URLs is far below the 50,000 / 50 MB threshold, so a single file is correct.

---

## 9. Homepage metadata changes

| | Baseline | Now |
|---|---|---|
| Title | `DrawSpace · Draw, guess, learn English` (36) | `DrawSpace – Free Online Drawing Game to Play With Friends` (57) |
| Description | `DrawSpace is a multiplayer drawing and guessing game. Draw, guess, and learn English words with friends. No account needed.` | `Play free online drawing and guessing games with friends. Create a room, invite friends, draw, guess, and have fun — no registration required.` (142) |
| Canonical | `https://drawspace.cloud/` for every URL | `https://drawspace.cloud/en-US` (self-referencing per locale) |
| H1 | none in HTML | exactly one: `Draw it. Guess it. Learn it.` |
| hreflang | 0 | 8 locales + `x-default` |
| Schema | none | `Organization`, `WebSite`, `VideoGame` (+`Offer`), `FAQPage` — the FAQ schema uses the five questions that are visibly rendered; collapsed answers stay in the DOM via `hidden`, so accordion behaviour and heights are unchanged |
| Body | empty | 427 words, 12 images, 0 missing `alt` |
| Open Graph / Twitter | static, generic | `og:title`/`og:description`/`og:image`/`og:url`/`og:locale` + `summary_large_image` |

Localized homepages were rewritten per language rather than copied from English: `/fr` = `DrawSpace – Jeu de dessin gratuit à jouer entre amis` (142-char description), `/ar` = `DrawSpace – لعبة رسم مجانية للعب مع الأصدقاء` with `lang="ar" dir="rtl"`, and the same for `es`, `de`, `pt-BR`, `ru`. Claims are limited to what the product does: free, browser-based, multiplayer, no account needed, eight languages.

---

## 10. Blog metadata and schema changes

**Index (`/en-US/blog`)** — title `DrawSpace Blog · Drawing Guides & Tips` (38), description 122 chars, self canonical, 9 alternates, `Blog` + `BreadcrumbList`, 1,286 words prerendered (all article cards), 0 missing `alt`.

**Category (`/en-US/blog/category/online-drawing-games`)** — title `Online Drawing Games · Blog · DrawSpace` (39), 329 words, self canonical, `CollectionPage` + `BreadcrumbList`, 0 hreflang (English-only), indexable.

**Article (`/en-US/blog/tips-to-guess-faster-in-drawing-games`)** — 34,388 bytes, 1,317 words in the initial HTML:

- one H1, 10 H2, 14 H3, real body text, category, publication date visible as `Nov 21, 2026`, reading time;
- **table of contents**: 22 entries linking to 22 rendered heading ids, 0 dead anchors (this was missing for Studio articles and is now fixed for all 21);
- 37 links inside the `<article>` element (22 table-of-contents anchors + 10 same-site links), cover and related-card images present, 0 images without `alt` on the page;
- schema: `BlogPosting`, `WebPage`, `BreadcrumbList` (+`Organization`, `WebSite`), all JSON parsing;
- `author` is **omitted**, because the only stored value is the internal automation id `mcp:claude`. The specification forbids inventing an author identity, so the field is dropped from both JSON-LD and the visible byline rather than faked. Setting a real editorial byline in the CMS restores it automatically with no code change (`publicAuthorName` accepts any plain name without `:`/`@`/digits and without automation keywords, ≤60 chars).

**Duplicate-locale policy for content:** `/fr/blog/<slug>`, `/ar/blog/<slug>`, `/de/blog/category/<slug>` etc. still render (a user can land there by switching language), but they are `noindex, follow`, canonical to the `en-US` URL, advertise no alternates and are absent from the sitemap. This is the "no eight pages that differ only in metadata" requirement, applied to content that exists in exactly one language. Static UI pages, which are genuinely translated, are indexable in all 8 locales with full alternates.

---

## 11. Multilingual SEO changes

| URL | `lang`/`dir` | Canonical | Robots | Alternates |
|---|---|---|---|---|
| `/en-US` | `en-US` / ltr | self | index | 9 |
| `/fr/play` | `fr` / ltr | self | index | 9 |
| `/de/rules` | `de` / ltr | self | index | 9 |
| `/ar/rules` | `ar` / **rtl** | self | index | 9 |
| `/es/leaderboard` | `es` / ltr | self | index | 9 |
| `/en-US/blog/<slug>` | `en-US` | self | index | 0 |
| `/fr/blog/<slug>` | `fr` | `/en-US/blog/<slug>` | **noindex** | 0 |
| `/de/blog/category/<slug>` | `de` | `/en-US/blog/category/<slug>` | **noindex** | 0 |

- `lang` and `dir` are written into the static `<html>` tag per route (the baseline shipped `lang="en-US"` for all eight).
- Language switching still works and rewrites the URL prefix: clicking `Français` on `/en-US/rules` lands on `/fr/rules` with title `Comment jouer · DrawSpace`, H1 `Comment jouer`, canonical `/fr/rules` and `lang="fr"` — verified in the browser.
- No locale page was canonicalised onto another language except the deliberate duplicate-content rules above.
- No translation was invented: only strings that already exist in `src/i18n/*` are used for UI pages, plus six new homepage title/description pairs written for the languages the site already serves.

---

## 12. Cloudflare Pages compatibility details

| Concern | Handling |
|---|---|
| Build command | `npm run build` → `tsc --noEmit && node scripts/build.mjs` |
| Output directory | `dist` |
| Prerendered files | `dist/<locale>/<path>.html` **and** `dist/<locale>/<path>/index.html`, so `/fr/play` and `/fr/play/` both resolve to real files |
| SPA fallback | `public/_redirects`: `/* /200.html 200`. Cloudflare resolves static files before `_redirects`, so prerendered pages win; only `admin`, invites and unknown URLs reach the fallback — which is now `noindex, follow` and contains the pristine `<div id="root"></div>` |
| No conflicting catch-all | No `index.html` catch-all is configured; if the dashboard's SPA-fallback switch is on, `_redirects` still matches first, but it is cleaner to leave it off |
| Asset paths | Vite emits absolute `/assets/<hash>.js` URLs; prerendered pages live at any depth, so relative paths were never an option |
| Caching / headers | `public/_headers` is copied verbatim into `dist/` (CSP Report-Only, immutable `/assets/*` and `/fonts/*`) |
| sitemap / robots | Copied from `public/` and, for the sitemap, overwritten by the prerenderer with the freshly generated file |
| Routing for `/` | `dist/index.html` is the prerendered `en-US` page whose canonical is `/en-US`; the React app still redirects to `/en-US` on load |
| Node runtime | Cloudflare's default Node 20/22 image is sufficient; no native modules, no browser download |

Nothing in the deployment configuration had to be changed. No Worker, no Pages Function, no `wrangler.toml` was introduced.

---

## 13. Tests and build results

| Check | Command | Result |
|---|---|---|
| TypeScript (app) | `npm run typecheck` | pass, 0 errors |
| Production build | `$env:VITE_GAME_SERVER_URL='https://server.drawspace.cloud'; $env:PRERENDER_REQUIRE_CONTENT='1'; npm run build` | exit 0 — 312/312 routes rendered, 626 files, 86 sitemap URLs |
| SEO audit gate | `node scripts/audit-seo.mjs` | `OK: every page has its own head, rendered body and sitemap entry.` — 312 pages (86 indexable, 226 noindex) |
| Automated tests | `npm test` | **165 tests, 161 pass, 0 fail, 4 skipped**, 31 s |
| Skipped tests | Redis integration (`two Socket.IO nodes…`, `real Redis state store…`, 2 more) | skipped by design — require `REDIS_TEST_URL` pointing at an isolated Redis; not available here. **Reported, not hidden** |
| Server typecheck | — | not run: `server/` is unmodified in this task |
| Tests removed/weakened | none | no test file touched |

Build output, verbatim:

```
origin: https://server.drawspace.cloud
locales: en-US, en-GB, fr, es, de, ar, pt-BR, ru
published articles: 21, categories: 9
routes rendered: 312/312
files written: 626 (86 sitemap URLs)
EXIT=0
```

The audit script is a real gate, not a linter: it fails the build on a missing `<title>`, a title over 60 chars, a description over 155, a page without an H1, a body under 20 words, unparseable JSON-LD, an error-boundary render, a wrong canonical, a missing/extra `hreflang`, an indexable duplicate locale page, a missing schema type per page kind, a duplicate title within a locale, a sitemap URL with no rendered page, a rendered page missing from the sitemap, duplicate sitemap entries, a foreign host, an indexable `200.html`, or a `200.html` that contains prerendered markup.

---

## 14. Raw HTML verification results

Served from a local static server over `dist/` (`http://127.0.0.1:4175`), i.e. the exact bytes Cloudflare would return, inspected with `Invoke-WebRequest`/`fetch` without executing JavaScript.

### 14.1 Evidence table

| URL | HTTP | Bytes | Words | Title (len) | Desc (len) | Canonical | Robots | hreflang | Schema |
|---|---|---|---|---|---|---|---|---|---|
| `/` | 200 | 30,430 | 427 | DrawSpace – Free Online Drawing Game… (57) | 142 | `/en-US` | index, follow | 9 | Organization, WebSite, FAQPage, VideoGame, Offer |
| `/en-US` | 200 | 30,430 | 427 | same (57) | 142 | `/en-US` | index, follow | 9 | same |
| `/fr` | 200 | — | 420 | DrawSpace – Jeu de dessin gratuit… (52) | 142 | `/fr` | index, follow | 9 | Organization, WebSite, FAQPage, VideoGame |
| `/ar` | 200 | — | 332 | DrawSpace – لعبة رسم مجانية… (44) | 115 | `/ar` | index, follow | 9 | Organization, WebSite, FAQPage, VideoGame |
| `/en-US/blog` | 200 | 55,550 | 1,286 | DrawSpace Blog · Drawing Guides & Tips (38) | 122 | self | index, follow | 9 | Organization, WebSite, Blog, BreadcrumbList |
| `/fr/blog` | 200 | — | 1,280 | Blog DrawSpace · Guides et astuces de dessin (44) | 139 | `/fr/blog` | index, follow | 9 | Organization, WebSite, Blog, BreadcrumbList |
| `/en-US/blog/tips-to-guess-faster-in-drawing-games` | 200 | 34,388 | 1,317 | How to Get Better at Skribbl.io: 11 Pro Tips… (58) | 152 | self | index, follow | 0 | BlogPosting, WebPage, BreadcrumbList |
| `/en-US/blog/welcome-to-drawspace-2` | 200 | — | 144 | Welcome to DrawSpace 2.0 · DrawSpace (36) | 91 | self | index, follow | 0 | BlogPosting, WebPage, BreadcrumbList |
| `/fr/blog/tips-to-guess-faster-in-drawing-games` | 200 | 34,325 | 1,312 | (inherited) (58) | 152 | `/en-US/blog/tips-…` | **noindex, follow** | 0 | BlogPosting, WebPage, BreadcrumbList |
| `/en-US/blog/category/online-drawing-games` | 200 | 20,233 | 329 | Online Drawing Games · Blog · DrawSpace (39) | 91 | self | index, follow | 0 | CollectionPage, BreadcrumbList |
| `/de/blog/category/online-drawing-games` | 200 | — | 318 | (inherited) (39) | 93 | `/en-US/blog/category/…` | **noindex, follow** | 0 | CollectionPage |
| `/en-US/play` | 200 | — | 102 | Play Free: Multiplayer Drawing Game (47) | 139 | self | index, follow | 9 | VideoGame, BreadcrumbList |
| `/de/rules` | 200 | — | 149 | Spielanleitung · DrawSpace (26) | 130 | self | index, follow | 9 | BreadcrumbList |
| `/es/leaderboard` | 200 | — | 245 | Clasificación · DrawSpace (25) | 132 | self | index, follow | 9 | BreadcrumbList |
| `/en-US/terms` | 200 | 12,534 | 176 | Terms of use · DrawSpace (24) | 129 | self | index, follow | 9 | BreadcrumbList |
| `/en-US/privacy` | 200 | — | 129 | Privacy policy · DrawSpace (26) | 136 | self | index, follow | 9 | BreadcrumbList |
| `/ar/rules` | 200 | 12,571 | 142 | طريقة اللعب · DrawSpace (23) | 113 | `/ar/rules` | index, follow | 9 | BreadcrumbList |

Every JSON-LD block on every row parses as valid JSON. Every `<img>` on the audited pages has a non-empty `alt` (12/12 on the homepage, 2/2 on the article). `x-default` resolves to the `en-US` URL on every translated page.

### 14.2 Baseline vs. now

| Metric | Baseline | Now |
|---|---|---|
| Bytes of `/en-US/blog/<slug>` | 3,130 (empty shell) | 34,388 |
| Distinct titles site-wide | 1 | 1 per indexable URL, 0 duplicates within a locale |
| hreflang links on `/fr/play` | 0 | 9 |
| JSON-LD blocks site-wide | 0 | 1 merged block per page (7 types on the article) |
| Words in `/en-US` initial HTML | 0 | 427 |
| Table of contents on articles | absent | 22 links / 22 ids, 0 dead |

### 14.3 Application verification (browser, JS enabled)

| Check | Result |
|---|---|
| Homepage loads, one `<div id="root">`, no duplicated head tags | pass |
| Direct load `/en-US/blog`, `/en-US/rules`, `/ar/rules` | pass |
| Refresh on a nested route | pass (static files, no rewrites needed) |
| Language switch `/en-US/rules` → `/fr/rules` | pass — title, H1, canonical, `lang` all switch |
| RTL Arabic page | pass — `dir="rtl"`, translated H1 |
| FAQ accordion on the homepage | pass — 5 items, first expanded, heights unchanged |
| Canvas / rooms / Socket.IO | not exercised live: the public API rejects the local preview origin via CORS, so the lobby cannot load rooms on `127.0.0.1:4175`. Game code is untouched and 161/165 backend tests (including the multiplayer canvas-reset and match-persistence suites) pass |
| `/admin` gate | shell served, `noindex` |

---

## 15. Sitemap verification results

Parsed as XML (`[xml]` / `XmlDocument.LoadXml`), not by string matching:

| Check | Result |
|---|---|
| Well-formed XML | pass |
| URLs | 86 |
| Unique URLs | 86 (0 duplicates) |
| Host | `drawspace.cloud` only — no localhost, preview or staging host |
| Published articles included | 21 / 21 |
| Categories included | 9 / 9 |
| Static translated pages | 56 (7 × 8 locales) |
| Blog indexes | 8 |
| Non-default-locale content URLs | 0 |
| `noindex` pages listed | 0 |
| `/admin`, `/sign-in`, `/sign-up`, `/room/*`, `/join/*`, `/game/*` | 0 |
| `<lastmod>` present on every entry | 86 / 86 (`2026-11-01` … `2026-11-22`) |
| `<xhtml:link>` alternates | 504, only on fully translated pages |
| `x-default` | `https://drawspace.cloud/en-US…` |
| File size | 61,300 bytes |
| `public/sitemap.xml` vs `dist/sitemap.xml` | byte-identical (verified by SHA-256) |
| `robots.txt` | references `https://drawspace.cloud/sitemap.xml`, disallows `/admin` |

---

## 16. Remaining issues and limitations

Stated plainly; none of these is hidden behind a "done" claim.

1. **`createRoot`, not `hydrateRoot`.** `src/main.tsx` still mounts with `createRoot`, so the prerendered markup is painted and then thrown away when React boots. There is **no** duplicate content (React clears the container) and crawlers see the full page, but it costs a second render on load and works against INP/LCP. Switching to `hydrateRoot` requires proving the server and client trees match exactly (React Query caches, dates, `Intl` output); half-done hydration would be worse than none, so it is left as a deliberate follow-up.
2. **No author identity.** The stored blog author is an automation id, so `BlogPosting.author` and the visible byline are omitted. This is correct per the "no fake author identities" rule but loses a recommended property for article rich results. Fix in the CMS: set a real editorial name on the articles.
3. **Content changes need a rebuild.** Publishing an article does not yet trigger a Cloudflare build. Documented workflow: deploy hook (below) called from an Appwrite Function / backend webhook, or a manual rebuild. No public endpoint was added — an arbitrary build trigger is exactly the insecure path the spec forbids.
4. **Static-page `lastmod` is a pinned constant** (`2026-11-18`) because those pages have no content-level timestamp. Articles use real timestamps. Overstating freshness is worse than a coarse date.
5. **Local preview cannot fetch the content API.** The backend's CORS allowlist serves `https://drawspace.cloud`, not `http://127.0.0.1:4175`, so client-side blog/leaderboard data is empty on a local static preview. Server-rendered HTML is unaffected. To test locally, run the backend on `:3001` (`npm run server`) with `VITE_GAME_SERVER_URL=http://localhost:3001`, or temporarily allow the preview origin.
6. **`/` and `/en-US` both return 200.** `/` canonicalises to `/en-US` and is not in the sitemap, which is the standard pattern, but a 301 at the CDN would be marginally cleaner. Not changed, because a redirect rule for `/` risks shadowing the prerendered `index.html`.
7. **Prerendering does not shrink JavaScript.** SEO pages carry the full SPA bundle; a future step could ship a lighter entry for prerendered content. Out of scope here (would touch routing).
8. **`dist/` is gitignored.** Prerendered HTML is a build artifact by design — it must never be committed, or it will drift from content.
9. **`alt` quality, not just presence.** Coverage is 100 % on the audited pages, but some images are decorative; that is an authoring concern, not a code one.
10. **Article language coverage.** 21 articles and 9 categories exist only in English. If real translations are added, set `translated` and `noindex` accordingly and they become indexable automatically — the machinery is already per-page.
11. **No sitemap index.** Correct at 86 URLs; revisit only past ~45,000.

---

## 17. Exact instructions for deploying the frontend to Cloudflare Pages

Do **not** run any of this until you have reviewed the diff. Nothing has been committed or pushed.

**Step 0 — get the code onto a branch you control (you must do this; it was forbidden here).**

```bash
git status                       # expect the 27 modified + 5 new files
git add -A
git commit -m "seo: prerender public routes, fix metadata, sitemap and multilingual signals"
git push -u origin codex/drawspace-seo-recovery
```

**Step 1 — Cloudflare Pages project settings.**

| Setting | Value |
|---|---|
| Production branch | the branch you merge into (e.g. `main`) |
| Framework preset | `None` (Vite is auto-detected; do not let it override the command) |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | repository root |
| Node version | `NODE_VERSION=20` (or 22) if you pin one; default is fine |
| SPA fallback / "single-page app" toggle | leave **off** — `public/_redirects` already provides `/* /200.html 200` |

**Step 2 — environment variables (Production and Preview).**

| Variable | Value | Why |
|---|---|---|
| `VITE_GAME_SERVER_URL` | `https://server.drawspace.cloud` | API origin baked into the bundle **and** used by the prerenderer to fetch content |
| `PRERENDER_REQUIRE_CONTENT` | `1` (recommended) | Makes the build **fail** if the content API is unreachable, instead of silently shipping a blog-less site |
| `NODE_VERSION` | `20` | optional pin |

No secret is needed at build time: only the *public* content endpoints are called, from Cloudflare's build network (server-side `fetch`, so CORS does not apply).

**Step 3 — deploy and verify the real response.**

```bash
# must be the article, not the homepage shell
curl -s https://drawspace.cloud/en-US/blog/tips-to-guess-faster-in-drawing-games | grep -o '<title>[^<]*</title>'
curl -s https://drawspace.cloud/en-US/blog/tips-to-guess-faster-in-drawing-games | grep -c 'application/ld+json'   # expect 1
curl -s https://drawspace.cloud/fr/play | grep -o 'hreflang="[^"]*"' | wc -l                                    # expect 9
curl -s https://drawspace.cloud/fr/blog/tips-to-guess-faster-in-drawing-games | grep -o 'name="robots" content="[^"]*"'  # expect noindex, follow
curl -s https://drawspace.cloud/sitemap.xml | grep -c '<loc>'                                                   # expect 86
curl -sI https://drawspace.cloud/admin | head -5                                                                # 200 + shell
```

Then confirm in the build log that it printed `routes rendered: 312/312` and `files written: 626 (86 sitemap URLs)`; a smaller number means content was missing at build time.

**Step 4 — search-console follow-up (recommended, not automated).**
Submit `https://drawspace.cloud/sitemap.xml` in Google Search Console and Bing Webmaster Tools; use "URL Inspection → Test live URL" on one article and one `/fr/play` to confirm the prerendered HTML is what Google fetches. Expect a few days of consolidation while the previous single-title URLs are recrawled.

**Step 5 — regeneration.** Create a Cloudflare **Deploy Hook** for the project (Settings → Builds & deployments → Deploy hooks), store the URL as a secret in Appwrite/backend, and `POST` it from the article-publish path. Do not expose that URL publicly and do not add a client-callable build endpoint.

---

## 18. Backend deployment requirements for Railway

**No backend change is required for this work, and no Railway deploy is needed.** `server/` was not modified; the diff is entirely frontend, scripts and one report. If Railway redeploys for unrelated reasons, nothing here breaks.

The backend must keep satisfying these contracts, which the build now depends on:

| Requirement | Detail |
|---|---|
| `GET /api/v1/public/blogs?limit=100` | unauthenticated, returns `{ data: [...] }` with at least `slug`, `title`, `excerpt`, `content`, `status`, `publishedAt`, `updatedAt`, `category`, `cover` |
| `GET /api/v1/public/blogs/:slug` | unauthenticated, single published article |
| Published-only semantics | `status === 'published'` remains the only public filter; drafts must never be returned by these endpoints (the build also re-filters) |
| Category list | the same payload's category values feed the 9 category pages and the sitemap |
| Reachability from the build | the endpoints must be public on the internet, without IP allowlisting or Cloudflare-specific workarounds |
| CORS | `https://drawspace.cloud` must stay allowed. If you want blog data to load on Pages preview deployments, add the `*.pages.dev` preview origin; this is a runtime-only concern and does not affect what crawlers see |
| Rate limits | the build makes ~25 requests (1 config, 1 leaderboard, 1 list, 21 articles); keep the public limit above that or the build degrades (and, with `PRERENDER_REQUIRE_CONTENT=1`, fails loudly instead) |

Optional future backend work (not part of this task): emit a publish event to the Cloudflare deploy hook so articles are prerendered within minutes of publication.

---

## Appendix A — Specification acceptance criteria (Phase Ten)

| Criterion | Status | Evidence |
|---|---|---|
| A. Raw HTML: title, description, canonical, H1, real text, JSON-LD, meaningful before JS | pass | §14.1 |
| B. Sitemap: XML-parseable, all published articles/categories, no drafts, no duplicates, production domain, only real localized URLs | pass | §15 |
| C. App: direct loads, refresh, navigation, language switch, canvas/rooms intact | pass except live game play (CORS on preview origin) | §14.3 |
| D. Build and code checks; no test weakened | pass | §13 |
| E. SEO validation table on generated output | pass | §14.1 |
| No deploy, no push, no commit, no draft published, no secret exposed, no destructive git | pass | §2 |

## Appendix B — Reproduce the verification

```bash
# build with real content (needs the public API reachable)
VITE_GAME_SERVER_URL=https://server.drawspace.cloud PRERENDER_REQUIRE_CONTENT=1 npm run build

# gate on the generated files
node scripts/audit-seo.mjs

# serve the exact bytes Cloudflare would serve
npx vite preview --port 4175 --strictPort
# then inspect raw HTML, e.g. curl -s http://127.0.0.1:4175/en-US/blog/tips-to-guess-faster-in-drawing-games

# other checks
npm run typecheck
npm test
npm run sitemap   # regenerates public/sitemap.xml from the live API
```

---

*Report prepared on the `codex/drawspace-seo-recovery` branch at baseline `9f8799e`. All changes are uncommitted and undeployed, exactly as instructed.*
