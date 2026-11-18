# DrawSpace performance & security overhaul — change log

One commit per task (T1–T10). Build + full test suite run after each task.
No secrets, tokens, or `.env` files are committed. Appwrite project id is scrubbed from committable files.

## T6 — Cloudflare RUM beacon (`/cdn-cgi/rum`)

Finding: the beacon is **not** present in `index.html`, any source file, or the built bundle.
It is injected by Cloudflare at the edge. Verified on the live site: the served DOM contains
`<script data-cf-beacon='{"version":"2024.11.0","token":"…","r":1,"spa":2}'>` plus
`https://static.cloudflareinsights.com/beacon.min.js/…`. Because `spa:2` is set, the beacon
POSTs to `/cdn-cgi/rum` on every client-side route change, which explains the ~53 POSTs observed.

Since it is edge-injected, it cannot be removed from code. It is a Cloudflare dashboard setting
and is listed here as a **user decision**:

- Keep it (free Real User Monitoring / Web Analytics): no action needed. The T8 CSP Report-Only
  policy allows `static.cloudflareinsights.com` so the beacon keeps working while enforced CSP is evaluated.
- Disable it (fewer requests, less third-party JS): Cloudflare Dashboard → **Analytics & Logs → Web Analytics**
  → select `drawspace.cloud` → **Settings / Manage site** → turn off automatic RUM injection (or remove the site
  from Web Analytics). Alternatively zone → **Speed → Optimization** → disable the Web Analytics / RUM auto-inject
  toggle. After disabling, the `static.cloudflareinsights.com` entries can be dropped from the CSP.

No code change was required for T6; this section documents the location and the manual disable path.

## T8 — Security headers + self-hosted fonts

Fonts: Inter and Manrope are now self-hosted variable woff2 (latin subset) in `public/fonts/`
(48.3 kB + 24.5 kB, one file per family covers all weights). `src/styles/fonts.css` declares them
with `font-display: swap`; `index.html` preloads both and the Google Fonts stylesheet + preconnects
were removed. Verified in a browser against the built bundle: `document.fonts.check` passes for both
families, headings compute to Manrope and body to Inter, and zero requests go to
`fonts.googleapis.com` / `fonts.gstatic.com`.

Headers (`public/_headers`, applied by Cloudflare Pages to every response):

- `Content-Security-Policy-Report-Only` built from real usage: `default-src 'self'`;
  `script-src 'self'` + sha256 hash of the inline theme bootstrap + `static.cloudflareinsights.com`
  (only while the T6 beacon is kept); `style-src 'self' 'unsafe-inline'` (React inline styles);
  `img-src 'self' data: blob: https://fra.cloud.appwrite.io`; `font-src 'self'`;
  `connect-src 'self' https://server.drawspace.cloud wss://server.drawspace.cloud https://fra.cloud.appwrite.io`
  plus `http(s)://localhost:3001` / `127.0.0.1:3001` for local preview;
  `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`.
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`
- `/fonts/*` cached `public, max-age=31536000, immutable` (rename files when updating fonts).

Verified by serving `dist/` with the `_headers` rules applied and playing the full flow
(landing → guest sign-in → create room): all headers present, fonts immutable-cached,
**zero CSP violations** and zero console errors.

Manual steps (user action, not code):

1. **HSTS**: Cloudflare Dashboard → zone `drawspace.cloud` → **SSL/TLS → Edge Certificates →
   Enable HSTS**. Recommended: max-age 31536000 (1 year), includeSubDomains on, preload optional
   (only submit to hstspreload.org once confident). HSTS is deliberately set at the edge, not in
   `_headers`, so Cloudflare manages it consistently across all responses.
2. **Enforce CSP**: after a few days of production traffic with zero reported violations
   (DevTools console shows Report-Only violations), rename the header in `public/_headers` from
   `Content-Security-Policy-Report-Only` to `Content-Security-Policy`. Optionally drop the
   localhost/127.0.0.1 `connect-src` entries at that point.
3. If the RUM beacon is disabled (T6), remove `https://static.cloudflareinsights.com` from `script-src`.

Ambiguity choice (simplest option): no `report-uri` endpoint is configured (would require a new
service); Report-Only violations surface in the browser console instead.

## T9 — API abuse protection

Rate limits (per IP, in-memory sliding/fixed windows, `server/src/middleware/rateLimit.ts`):

| Surface | Limit |
| --- | --- |
| `POST /api/guest/*` (guest sessions) | 5 / hour |
| `/api/auth/*` | 10 / 15 min |
| `/api/*` (whole API) | 120 / min |
| Socket connections | 30 / min per IP |
| Socket events per socket | 120 / min (600 / min for `game:stroke`, which fires once per finished stroke) |

Every API response now carries `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`;
429 responses also carry `Retry-After` (seconds). Socket floods are disconnected
(`socket.disconnect(true)`), and reconnect storms then hit the per-IP connection limit.
Guess/chat/join floods were already limited per user by game settings and remain so.

Helmet 8 replaces the hand-rolled header middleware on the API with the same values
(nosniff, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`,
`Cross-Origin-Resource-Policy: same-site`) plus its extra defaults. CSP and HSTS stay off in
Helmet because they are managed at the Cloudflare edge (T8).

Usernames are now 3–20 characters everywhere they are accepted or parsed: guest session creation,
profile patch, public match-history lookup, and client-side guards in `signUp` / `continueAsGuest`
before any Appwrite session is created. Guest input `maxLength` raised 16 → 20 to match.

IDOR audit of `/api/profiles`, `/api/matches`, `/api/statistics`: **no issues found**.
All mutations and personal reads are scoped to the verified JWT identity (`/me` routes);
`PATCH /api/profiles/me` rejects unknown fields such as `userId` (strict schema, covered by e2e);
public reads (`/api/profiles/username/:username`, `/api/matches/player/:username`,
`/api/matches/:matchId`) return only public projections (no userId, email, or internal fields);
`/api/matches/admin` requires the `matches.inspect` permission.

Skipped (per spec "profanity if exists"): no profanity filter exists anywhere in the codebase,
so none was applied. Adding a word list would be a new product decision.

Tests: e2e now asserts all three HTTP limits (5/h guest, 10/15min auth, 120/min API) including
`RateLimit-*` and `Retry-After` headers, the socket event-flood disconnect, and the per-IP
connection limit; new unit tests cover the sliding window. 130 pass / 0 fail / 4 skipped.
Live verification: guest sign-in + room creation still pass under the new limits.

Note for local development: the guest limit is per IP, so repeated manual guest sign-ins from
one machine can exhaust 5/hour; restart the dev server to reset the in-memory windows.
## Brush-style display writing ("style ecrit like pincel")

Interpretation: handwritten brush lettering for the brand and display moments, not body text.
Chosen face: **Caveat Brush** (Google Fonts, OFL), a marker/brush script that matches the
draw-and-guess subject. Self-hosted like the T8 fonts: `public/fonts/caveat-brush-latin.woff2`
(67 KB, latin subset, `font-display: swap`, immutable cache via the existing `/fonts/*` rule,
preloaded in `index.html` because the logo and hero use it above the fold).

Applied through a new `--font-brush` token to: the `DrawSpace` logo wordmark (header + footer),
the landing hero title, landing/section titles, the in-game word-choice options and the
round-reveal word. Sizes were raised where the brush face replaced Manrope (logo 17 → 22px,
hero clamp 34–52 → 42–66px, reveal 30 → 40px) because script faces read smaller at equal em;
weight is 400 (the face ships one weight, no faux bold). UI headings, forms, tables, blog
article titles and admin surfaces keep Manrope/Inter for readability.

Verified in headless Chrome: `document.fonts.check('16px "Caveat Brush"')` true, computed
family on logo/hero/section titles is the brush stack, only the three self-hosted woff2 files
are requested (zero Google Fonts traffic), no horizontal overflow at 390px, guest flow into
the lobby still passes, zero console errors. Screenshots: desktop + mobile landing, lobby.
Typecheck, 130 tests, and production build all pass.

## T10 — Final verification and before/after metrics

Gates: `npm run typecheck`, `npm run server:typecheck`, `npm test` (130 pass / 0 fail / 4 skipped),
`npm run build` (tsc + `scripts/build.mjs` with NODE_ENV=production + 200.html copy).
The repo has no ESLint configuration; the two tsc typechecks are the static-analysis gate.

Method: controlled local A/B. BEFORE = pre-overhaul commit `049508a` extracted with `git archive`
and built with NODE_ENV=production; AFTER = branch HEAD. Both dists served on localhost:5173 by the
same gzip-capable static server applying each dist's own `_headers`, against the same local backend.
Headless Chrome 1440x900. Flow: `/en-US` first load (measurement window), then SPA navigation
leaderboard -> home -> play -> guest sign-in -> lobby -> home. Bytes = CDP `encodedDataLength`
(gzip both legs; the Cloudflare edge uses brotli, a few percent smaller). A reference run against
live drawspace.cloud (deploy predates this branch) is included for context.

| Metric | Before (049508a) | After (HEAD) |
| --- | --- | --- |
| `/en-US` first load transfer | 277,984 B / 34 requests | 403,259 B / 43 requests |
| `/account/jwts` calls in session | 8 | 2 |
| leaderboard network GETs (4 views) | 1 (a 500 stored and replayed from browser cache, see fix below) | 1 (200; revisits served from query cache) |
| failed API requests in session | 5 (`/api/blog` 404 x3, `/api/admin/me` 403, leaderboard 500) | 0 |
| document security headers | none | CSP Report-Only, Permissions-Policy, nosniff, Referrer-Policy, X-Frame-Options DENY |

Live reference run: 297,039 B / 36 requests, 7 jwt calls, `/api/admin/me` 403 for a guest,
Cloudflare RUM beacon present.

Why first load grew, itemized:
- +68.5 KB brush font (the requested "pincel" feature), preloaded and immutable-cached.
- +23.4 KB of achievement emblem WebP: the baseline landing's `Promise.all` rejected on the
  `/api/blog` 404, so its leaders/achievements/posts sections rendered empty; after T4 the
  landing renders real data and therefore real images.
- +12.6 KB TanStack Query chunk (the dedupe/cache runtime).
- Eager JS gzip: baseline single index 139.1 KB + route chunks ~146 KB; after, split eager
  chunks ~164 KB including Query. Excluding Query the chunk-split overhead is ~5 KB.
  T7's -43% total-JS figure and the dev-React fix are measured across all routes
  (socket chunk is lazy and room-only); first-load eager JS is roughly flat vs a prod baseline.
- Fonts: Google-hosted 73.5 KB + a CSS request became 143.2 KB self-hosted (three families
  including brush), zero third-party font origins, immutable year-long cache.
Net effect: in-session and repeat-visit traffic drops (jwt 8 -> 2, zero refetches on revisits,
zero failed requests); first load pays for the new brush face, the now-working landing
sections, and the query runtime.

Defect found and fixed during T10: the T5 cache middleware applied `max-age` to error responses
too. Observed consequence: a browser stored a 500 on `/api/progression/leaderboard` for 30 s and
replayed it to later views. Any >=400 response on `/api` GETs now gets `Cache-Control: no-store`
(writeHead guard in `server/src/app.ts`). e2e asserts 404 -> no-store and 200 -> public max-age=30;
the platformConfig cache test now expects no-store on the unauthenticated 401. Verified live:
404 no-store, 200 public max-age=30, stale-while-revalidate=60.

Manual Cloudflare steps (consolidated from T6/T8, still pending user action):
1. RUM beacon: keep (free analytics) or disable via Dashboard -> Analytics & Logs -> Web Analytics
   (exact path in the T6 section). Edge-injected; cannot be removed from code.
2. HSTS: zone -> SSL/TLS -> Edge Certificates -> enable HSTS, max-age 31536000, includeSubDomains
   (preload optional). Not set from code so it survives any origin change.
3. CSP: after a violation-free observation window, rename
   `Content-Security-Policy-Report-Only` to `Content-Security-Policy` in `public/_headers`;
   optionally drop the localhost connect-src entries and `static.cloudflareinsights.com`
   if the beacon was disabled.

Skipped / notes:
- Profanity filter: none exists anywhere in the codebase (T9), so none was applied.
- CSP `report-uri`: no collector endpoint exists; Report-Only plus console violation monitoring
  was the simplest option (T8).
- No ESLint config in the repo; typecheck serves as the lint gate.
- Dev guest limit is 5/h per IP; restarting the dev server resets the in-memory windows.
- Nothing was pushed or deployed: the live site remains pre-overhaul until explicitly authorized.

## BW1: custom_words in-memory cache (bandwidth task 1)

Measured source: `custom_words` was the top Appwrite consumer at 8.2 MB. `WordRepository.active()`
ran a 500-row full-metadata `listRows` on every word offer (once per turn, plus intermissions).

Changes:
- `server/src/repositories/wordRepository.ts` rewritten as a cache module: loads all active words
  once, paging `Query.limit(100)` + `Query.cursorAfter`, `Query.select(['$id','id','word','category',
  'difficulty','language'])` (TablesDB still returns system metadata; select trims user attributes:
  measured 45,184 B -> 32,219 B per 100-row page). Words are grouped by language + difficulty in
  memory; random picks stay in the socket handler (it already copies before shuffling). TTL 1 h,
  single-flight shared promise, generation counter so an invalidation mid-load forces a fresh load,
  stale-on-failure with a guarded 60 s retry, dedupe guard against backends that ignore cursorAfter.
- Warm at startup: `words.warm()` in `createSocketHandlers` (server/src/socket/handlers.ts:52).
- `invalidateWords()` exported and called from every word mutation: `adminDataRepository.saveWord/
  deleteWord` and `wordService` create/update/delete/bulk/import/setActive/deleteMany/renameCategory/
  deleteCategory (10 points). Admin edits reach the next round immediately.
- Public word pool closed per spec ("Do not send the full word list to the client"): removed
  `GET /api/v1/words` and `GET /api/v1/words/categories` (server/src/routes/contentApiV1.ts).
  Contract exception, explicitly instructed by the bandwidth spec; neither route was used by the
  SPA. Authenticated admin/MCP word management is unchanged. docs/DRAWSPACE_API.md updated.
- Tests: new `server/src/repositories/wordRepository.test.ts` (7 tests: paging + select, grouping,
  single-flight, TTL refresh, stale-on-failure + retry, invalidation incl. mid-load, cursorAfter
  dedupe guard). contentApiV1 test now asserts 404 for the removed public routes.

Verification: typecheck (app + server), 137 tests pass / 0 fail / 4 skipped, build. Live smoke on a
second dev instance (port 3002): two guests -> room -> start -> 3 word choices from the warm cache
-> choose -> round-start + your-word broadcast (probe-bw1.cjs, PASS). Public /api/v1/words and
/words/categories answer 404; /api/v1/public/blogs and /api/rooms still 200.

Estimated effect: ~181 KB per turn before -> ~129 KB per hour (400 active words, 4 pages) plus
admin invalidations. Over the measured window this removes >99% of the 8.2 MB.

Notes: the port-3001 dev backend still runs pre-BW1 code until restarted (process kill was not
authorized in this session); verification used port 3002. Retry-after-failure also happens on the
next call, not only on the 60 s timer. Nothing pushed or deployed.

## BW2: stop per-request /v1/account calls (bandwidth task 2)

Measured sources: `/v1/account` 4.4 MB (server-side `accountForJwt(jwt).get()` on every
authenticated request, plus client `account.get()` probes) and `/v1/account/jwts` 3.9 MB.

Changes:
- `server/src/auth/verifyJwt.ts` rewritten as a cached verifier. Appwrite Cloud does not expose a
  JWT signing secret, so local signature verification is impossible; per spec the validation
  result is cached instead: `sha256(token) -> identity` until the token's decoded `exp`, capped at
  10 min (default), max 5000 entries with expired-first then oldest-first eviction, single-flight
  per token, expired tokens rejected locally with zero Appwrite calls, failures never cached.
  Identity shape unchanged (`userId`, `name`, `email`, `emailVerified`, `isGuest`), so every route
  and the socket handshake keep the same contract.
- `src/services/backendAuth.service.ts`: the signed-in account (`{id, email}`) is kept in memory
  for the session. `account.get()` now runs once at app start / sign-in instead of on every
  session refresh; `updateProfile` drops its `account.get()` ownership probe (checks the cached
  account locally; the server still enforces identity-scoped `/api/profiles/me`). Sign-out and
  session switches clear it. The jwtCache/apiClient modules already met the spec (in-memory
  `{token, exp}`, refresh under 60 s, single-flight, one 401 refresh + retry then clean sign-out,
  never localStorage) and were left unchanged.
- Tests: new `server/src/auth/verifyJwt.test.ts` (7 tests: cache reuse + guest identity,
  concurrent single-flight, local expiry rejection, maxCacheMs cap + short-lived exp,
  failures not cached, entry eviction, no-exp tokens).

Verification: typecheck (app + server), 144 tests pass / 0 fail / 4 skipped, build. Live socket
round on port 3003 (probe-bw1.cjs, PASS). Browser session against the BW2 stack (vite 5174 ->
backend 3004, probe-bw2.cjs): landing -> guest sign-in -> profile edit + save -> achievements ->
challenges -> leaderboard. `/v1/account` calls: 2, both during landing (React.StrictMode dev
double-effect; production runs 1), zero afterwards including after the profile save.
`/v1/account/jwts`: 2 total for the whole session. No failed requests, no console errors.

Estimated effect: `/v1/account` drops from once per authenticated API call + socket handshake to
at most once per token per 10 min (typically once per 15-min token lifetime) plus once per app
start client-side: >95% of the 4.4 MB. `/v1/account/jwts` stays at the T3 level (2/session).

Trade-off (spec-permitted): a revoked session stays valid until its cache entry expires (<=10 min
or token exp, whichever is first). Notes: the 3001 dev backend still runs pre-BW2 code until
restarted; verification used ports 3003/3004. The profile-save phase still fetches
`/api/profiles/me` + `/api/statistics/me` + `/api/progression/me` separately; BW3 merges those.
Nothing pushed or deployed.

## BW3: per-user read caches + /api/me/bootstrap (bandwidth task 3)

Measured sources: `player_progression` 1.5 MB, `user_statistics` 1.3 MB, `profiles` 0.7 MB.
`/api/progression/me` ran 9 listRows per call (dashboard), and the SPA fetched profiles/me +
statistics/me + progression/me as three separate round trips on every sign-in and refresh.

Changes:
- New `server/src/repositories/userReadCache.ts`: in-memory read cache, 30 s TTL, max 5000
  entries (expired-first then oldest-first eviction), single-flight per key, generation counter
  so a write landing mid-load forces a reload instead of caching stale data. Invalidation
  broadcasts to every live cache instance because the HTTP app and the socket handlers own
  separate repository instances.
- `profiles`, `user_statistics`, `player_progression` reads: `Query.equal('userId', id)` +
  `Query.limit(1)` + `Query.select(only the fields each repository maps)`, cached per userId.
  Write paths (profile update, recordMatch, award, equipTitle) always read fresh (cached rows
  lack `$id` and may be 30 s old) and invalidate the user's keys after writing.
- `ProgressionRepository.dashboard` is cached per user (30 s); the active achievements/titles/
  challenges catalogs are cached 60 s and shared by dashboard, publicAchievements, and the
  end-of-match unlock/challenge passes. `CatalogRepository.save/delete` now invalidates those
  catalogs (and dashboards, which embed them). Also fixed a BW1 gap: catalog word saves/deletes
  now call `invalidateWords()`.
- End-of-match writes skip unchanged state: `updateChallenges` no longer inserts zero-progress
  rows for challenges the player did not advance, and skips patches when progress is unchanged
  (already capped at the target). Match writes still happen once per player per finished match.
- New `GET /api/me/bootstrap` (server/src/routes/meRoutes.ts): one call returning
  `{ profile (incl. adminRole), statistics, progression }` from the same caches. The three old
  /me routes keep working unchanged. Frontend `toUser` now makes this single call; the separate
  profiles/me, statistics/me and progression/me fetches are gone from the auth flow.
- Tests: new userReadCache.test.ts (8: TTL, single-flight, per-user invalidation, mid-load write
  race, cross-instance broadcast, catalog invalidation, eviction order, failures not cached),
  statisticsRepository.test.ts (1), progressionCache.test.ts (3: dashboard cache, recordMatch
  invalidation + skip-unchanged, catalog edit invalidation); profileRepository.test.ts extended
  (select-only + cache + invalidation); httpE2e asserts the bootstrap payload and its 401.

Verification: typecheck (app + server), 157 tests pass / 0 fail / 4 skipped, build. Browser
session on the BW3 stack (vite 5175 -> backend 3005, probe-bw3.cjs): landing -> guest sign-in ->
profile edit + save -> achievements -> challenges -> leaderboard -> profile revisit. Per-user
API calls for the whole session: bootstrap 2 (sign-in + post-save refresh), progression/me 1
(achievements page; challenges reuses it via the query cache), profiles/me GET 0, statistics/me
0, profiles/me PATCH 1 (the save itself). Before BW3 the same session made 7 per-user GETs
(2 profiles + 2 statistics + 3 progression). accountGet stays 2 (landing only), jwts 2, zero
failed requests, zero console errors. Live socket round on 3005 PASS (probe-bw1; the first
attempt hit a transient 401 on a freshly minted Appwrite JWT and passed on retry - verification
failures are never cached).

Estimated effect: the three tables drop from per-request reads to at most one select-only read
per user per 30 s (plus write invalidations), and catalog scans from per-request/per-player to
once per 60 s: >90% of the 3.5 MB over the measured window. Sign-in/refresh drops from 3 HTTP
round trips to 1.

Notes: write paths intentionally bypass the cache; a dashboard may lag an xp-config change by
up to 30 s (catalog edits invalidate immediately). Leaderboard compute caching is BW5.
Admin/analytics full-table reads are untouched (admin-only surfaces). New dev instances:
backend 3005, vite 5175. Nothing pushed or deployed.

## BW4 - Frontend request hygiene (platform config polling, ad slots)

Changes:
- `usePlatformConfigQuery` (src/hooks/useQueries.ts): removed `refetchInterval: 5 min` and
  `refetchOnWindowFocus: true`. The 5 min staleTime stays; the admin-triggered manual
  `refresh()` in PlatformConfigContext still works via `refetch()`. The query client default
  `refetchOnWindowFocus: false` now applies to config too.
- `AdSlot` (src/components/AdSlot.tsx) previously fetched `/api/ads/:placement` in a bare
  `useEffect` on every mount (landing, blog list, blog article each refetched). It now uses a
  new `useActiveAd(placement)` TanStack query (key `['ads', placement]`, staleTime 5 min), so
  repeat mounts and blog list <-> article navigation reuse the cached response. Errors resolve
  to no data and render nothing, same as before.
- Already compliant from earlier tasks, re-verified: leaderboard 60 s, blogs 5 min, public
  achievements 5 min, progression 30 s staleTimes; shared query keys dedupe leaderboard across
  landing/leaderboard page; no network polling timers anywhere (remaining setIntervals are
  local UI/game ticks); no frontend caller of /api/admin/me for non-admins.

Verification: typecheck (app + server), 157 tests pass / 0 fail / 4 skipped, build. Browser
probe (probe-bw4.cjs, vite 5175 -> backend 3005): landing -> blog list -> blog article -> blog
list -> landing revisit, then a synthetic window focus event. Whole-session counts:
/api/platform/config 1, /api/ads/landing 1, /api/ads/blog 1, zero page errors. Before BW4 the
same navigation fetched config on every focus/5 min timer and ads on each of the 4 mounts
(2 landing + 2 blog).

Deliberately left uncached (noted per spec): Lobby `/api/rooms` (in-memory game state served by
the Node process, not Appwrite; room lists must be fresh) and Profile match history (players
expect a just-finished match to appear immediately). Both are cheap Node-side reads.

Estimated effect: removes the recurring config polling entirely and cuts ad fetches to one per
placement per 5 min per browser session. Nothing pushed or deployed.

## BW5 (part 1) - Stop the recovery sweep re-persisting finished matches

Found while verifying BW5: finished rooms stay in the in-memory state store for 30 days
(engine.ts extends expiresAt on finish), and the 1 s recovery sweep called
persistCompletedMatch for every finished room on every tick. Persistence is idempotent, but
each re-run still cost ~4 Appwrite calls per player (match_history createRow conflict + getRow,
xp_transactions lookup + player_progression read) - roughly 8 calls/second for a 2-player
match, for as long as the room lived. This was a continuous background bandwidth leak.

Changes (server/src/socket/handlers.ts):
- `persistedMatches` Set marks matches whose persistence fully succeeded; the sweep and
  finishRound skip them. Entries are removed when a room is closed; a server restart re-runs
  persistence once per recovered finished room (idempotent, same as before).
- The sweep now isolates failures per room (try/catch inside the loop, logging the room code)
  so one stuck room can no longer block recovery of every other room. The recurring
  `[room-recovery-sweep] GameError` log line (present since before BW1) was this: one bad room
  aborted the whole sweep every second.

Verification: new matchPersistenceSweep.integration.test.ts drives a full 2-turn match over
real socket.io with a call-counting TablesDB double, then asserts zero additional Appwrite
calls across 2+ sweep ticks (and zero duplicate-conflict getRows). Confirmed the test fails
with the fix removed. Full gates: typecheck x2, 158 tests pass / 0 fail / 4 skipped, build.

## BW5 (part 2) - ETag/304 revalidation, leaderboard compute cache, gzip

Changes:
- `/api/me/*` GETs now send `Cache-Control: private, max-age=0` instead of `no-store`
  (server/src/app.ts). The browser may store the response but must revalidate every use;
  Express's built-in weak ETag + If-None-Match handling then answers 304 with no body.
  Public GETs keep `public, max-age=30, stale-while-revalidate=60` (from T5) and now also
  revalidate via ETag after expiry. Other authenticated routes stay `private, no-store`.
  Access-Control-Max-Age 86400 was already set in T5.
- Leaderboard compute cache (server/src/repositories/progressionRepository.ts): the four
  500-row scans (player_progression, profiles, user_statistics, titles) now run at most once
  per 30 s per period, single-flight, and are select-only (userId/level/xp/title, username/
  avatar, gamesWon, title name/description/icon). The HTTP response stays `private` because
  it embeds per-viewer `isMe`. Catalog edits (e.g. renaming a title) invalidate the cached
  board immediately via invalidateCatalogCaches; player writes refresh it on TTL expiry.
- gzip compression: added the standard `compression` middleware (7 tiny packages, most
  already in the express tree; no Redis, no infrastructure). JSON over 1 KB is gzipped when
  the client accepts it; images and other incompressible types are skipped. Measured live:
  leaderboard 2324 -> 254 bytes (-89%), /me/bootstrap 3067 -> 851 bytes (-72%).

Verification: typecheck x2, 159 tests pass / 0 fail / 4 skipped, build. New tests:
leaderboard cache + select-only + title-edit invalidation (progressionCache.test.ts);
httpE2e asserts public 304, /me `private, max-age=0` + 304, and raw gzip bytes on the
leaderboard. Test note: conditional requests use raw node:http because undici fetch injects
`cache-control: no-cache`, which Express's freshness check treats as stale - browsers
revalidate without it (confirmed live with curl and raw http: 304, zero bytes).
Live probe (probe-bw5.cjs, 12 checks on backend 3006): all pass. Browser probes on the BW5
stack (vite 5177 -> backend 3007): BW4 navigation still 1 config + 1 ad per placement; the
full BW3 guest session shows identical request counts (bootstrap 2, progression/me 1, zero
per-user GETs, zero errors); live socket round PASS.

Notes: the first BW5 dev instance (3006) was started without the 5176 origin and its wrapper
was stopped but the node process survived (port kept); killing it was blocked, so the verified
BW5 stack runs on 3007 + 5177. 3006 is idle and can be closed during instance consolidation.
Nothing pushed or deployed.

## BW6: Appwrite call counter + admin-only stats (TASK 6)

Goal: make Appwrite usage observable without adding infrastructure, and confirm the guest
abuse guard from T9.

- In-memory counter (server/src/monitoring/appwriteStats.ts): a module singleton counts
  every Appwrite SDK call grouped by table and method, in per-minute buckets (rolling
  60-minute window) plus lifetime totals. No request bodies, tokens, or keys are stored -
  only table name, method name, and counts. Memory is bounded (60 minutes x tables x methods).
- Counting wrapper (server/src/database/appwrite.ts): a `counted()` Proxy wraps the TablesDB,
  Users, Account, and Storage SDK objects. Tables are labeled by tableId argument;
  users.createJWT is labeled `jwts`, account calls `account`, storage calls `storage`.
  The Proxy only observes - arguments and results pass through unchanged (verified against
  a local fake Appwrite HTTP server in appwriteStats.test.ts).
- Admin route: GET /api/admin/appwrite-stats behind requireAuth + requireAdmin (same guard
  as the rest of /api/admin). Returns totals + per-minute breakdown, sorted by call count.
  Unauthenticated -> 401, authenticated non-admin -> 403.
- Minute logger (started from server/src/index.ts): an unref'd 60 s interval logs one line
  per minute with activity, e.g. `[appwrite-stats] <minute> custom_words=4 profiles=2`.
  Idle minutes log nothing. No secrets in the output.
- Guest-session rate limit: already implemented in T9 (`/api/guest` -> 5 requests/hour/IP,
  server/src/app.ts). Re-verified live below; no code change needed.

Verification: typecheck x2, 161 tests pass / 0 fail / 4 skipped, build. New tests:
appwriteStats.test.ts (bucket grouping, reset, Proxy pass-through against a fake server);
httpE2e asserts 401 unauthenticated, 403 guest, and 200 + totals/minutes shape for admin.
Live probe (probe-bw6.cjs on backend 3008, real Appwrite): all 8 checks pass - guest session
201 through the counted Proxy, stats 401 unauthenticated, stats 403 guest, guest calls 2-5
allowed, call 6 -> 429. The admin 200 path is covered by httpE2e with a fake database to
avoid writing admin_roles rows to production. Nothing pushed or deployed.

## BW7: before/after session measurement + bandwidth report (TASK 7)

### Method

Live A/B, no mocks. A counting reverse proxy (Temp/drawspace-test/counting-proxy.cjs) sat
between each backend and Appwrite, logging every request's method, path, table, status, and
response byte count. Two backends ran the SAME full-session probe
(Temp/drawspace-test/probe-bw7.cjs): landing (config + ad + blog list) -> two guest sign-ins ->
lobby rooms -> create room -> play a full 1-round match (2 turns, both guessed) -> profile +
match history -> leaderboard.

- BEFORE: commit 30cb2e3 (STEP 0 audit, pre-BW1 code) in a scratch worktree
  (Temp/drawspace-bw7-baseline), backend port 3013.
- AFTER: commit d891603 (BW1-BW6), backend port 3012.
- Guest users + JWTs were minted directly to Appwrite as probe setup (outside the counted
  window). The current backend's startup word-cache warm (5 paged reads) also falls outside
  the window - it is a one-time cost, not per-session.
- Two word modes were run: `custom` (words supplied in-room, no DB) and `easy` (words read
  from custom_words). The `easy` run is the representative one because it exercises BW1.

### Measured results (easy mode, full session)

151 -> 83 calls (-45%); 107,080 -> 28,766 bytes (-73%). Bytes fall faster than calls because
the removed calls were the fat ones (500-row full-metadata scans).

| table | before calls | after calls | before bytes | after bytes | byte change |
|---|---|---|---|---|---|
| custom_words | 2 | 0 | 46186 | 0 | -100% |
| match_history | 23 | 3 | 13067 | 2509 | -81% |
| player_progression | 27 | 18 | 9470 | 5815 | -39% |
| xp_transactions | 21 | 11 | 7519 | 2457 | -67% |
| profiles | 9 | 7 | 7561 | 5559 | -26% |
| account | 12 | 2 | 7080 | 1180 | -83% |
| achievements | 4 | 2 | 2836 | 1418 | -50% |
| user_statistics | 11 | 9 | 2798 | 1761 | -37% |
| titles | 5 | 3 | 2585 | 1441 | -44% |
| user_achievements | 8 | 7 | 2219 | 1352 | -39% |
| platform_settings | 2 | 2 | 1384 | 1384 | 0% |
| blog_categories | 1 | 1 | 1010 | 1010 | 0% |
| guest_sessions | 4 | 4 | 892 | 892 | 0% |
| blog_posts | 1 | 1 | 831 | 831 | 0% |
| xp_config | 6 | 3 | 762 | 381 | -50% |
| user_titles | 6 | 5 | 691 | 671 | -3% |
| challenges | 4 | 2 | 84 | 42 | -50% |
| user_challenges | 2 | 1 | 42 | 21 | -50% |
| admin_roles | 2 | 1 | 42 | 21 | -50% |
| advertisements | 1 | 1 | 21 | 21 | 0% |
| TOTAL | 151 | 83 | 107080 | 28766 | -73% |

The remaining "after" calls are legitimate once-per-player end-of-match writes
(progression/xp/history) and first-fetch leaderboard/catalog reads - not leaks.

### The idle leak (the dominant production cost)

Finished rooms linger in the state store for 30 days. BEFORE, the 1 s recovery sweep
re-persisted every finished room every tick. Measured idle traffic AFTER the session ended:

- BEFORE: 83 calls / 38,743 bytes in 10 s (~8.3 calls/s, ~3.9 KB/s) - and it never stops.
  Per finished 2-player match that is ~330 MB/day, compounding with every match and the
  30-day retention. This is almost certainly the largest real-world sink.
- AFTER: 0 calls / 0 bytes. Fixed in BW5 via the persistedMatches marker.

### Estimated production bandwidth savings

Extrapolated from the audit's measured MB (BANDWIDTH_AUDIT.md) times the per-table reductions
above and the call-site analysis. This is an ESTIMATE - confirm against Appwrite Usage and the
BW6 /api/admin/appwrite-stats route after deploy.

| consumer | audited MB | main fix | est. reduction | est. MB saved |
|---|---|---|---|---|
| custom_words | 8.2 | BW1 1 h cache (per-round scan -> warm once) | ~100% | 8.2 |
| /v1/account | 4.4 | BW2 cached verification + single account.get | ~85% | 3.7 |
| /v1/account/jwts | 3.9 | T3/BW2 jwtCache (mint per ~14 min, not per request) | ~90% | 3.5 |
| player_progression | 1.5 | BW3/BW5 select-only + 30 s cache + leak fix | ~70% | 1.05 |
| user_statistics | 1.3 | BW3/BW5 cache + bootstrap + leak fix | ~70% | 0.91 |
| profiles | 0.7 | BW3 cache + bootstrap | ~50% | 0.35 |
| TOTAL | 20.0 | | | ~17.7 (~88%) |

Point estimate ~85-90%, comfortably above the >=80% goal. The idle-leak fix alone removes a
cost that scales with finished-match count x retention, so real-world savings are likely
higher than this session-weighted estimate. Note: /v1/account/jwts savings come from the
frontend jwtCache (T3); this server-side probe mints JWTs as setup, so jwts is not in the
counted window - its reduction is reasoned from the call site, not measured here.

### Skipped / left as-is (and why)

- Lobby GET /api/rooms: not cached - it reflects live in-memory game state and must be fresh.
- Profile match history (GET /api/matches/me): not cached - must show the just-finished match.
- jwts minting: already handled by T3 jwtCache; no further change needed.
- NO_DRAWER sweep spam: a fully-disconnected room stuck in round_end retries nextRound every
  second. This is pure in-memory (zero Appwrite calls, confirmed by the 0-byte idle window)
  and only cosmetic log noise. Left as-is to avoid touching round-lifecycle logic; noted here.
- Public word listing (GET /api/v1/words): removed in BW1 per spec (it leaked the word pool).
- Admin/MCP word reads: low frequency, admin-only; left uncached.

### Manual steps

1. Deploy the backend (commit d891603) and frontend to production. No migration needed - BW1-BW7
   add no tables/columns; they only cache and count existing reads.
2. After deploy, watch Appwrite Usage -> Bandwidth and GET /api/admin/appwrite-stats (admin only)
   or the `[appwrite-stats]` minute log lines to confirm the per-table drop.
3. Consolidate dev instances when convenient (ask first): 3001 old code; 3002-3005 older BW
   stacks; orphaned 3006 (PID 26380), 3009/3010 (wrong-endpoint orphans), 3011/3013 (baseline
   orphans, one still leaking); 3007+5177 and 3008 are usable current stacks; 3012 is the
   measured current backend. The scratch baseline worktree Temp/drawspace-bw7-baseline and the
   counting proxies (3108-3112) can be removed; none of this is committed.
4. Nothing was pushed or deployed. Per-task commits are local on codex/phase1-backend-rebuild.

Verification: typecheck x2, 161 tests pass / 0 fail / 4 skipped, build (unchanged from BW6 -
BW7 adds no source code, only this report and Temp scratch probes). Both A/B sessions passed
all 17 probe checks.

## Frontend routing + error-page SEO (Cloudflare Pages SPA fallback)

Problem: direct loads/refreshes of every client route (e.g. https://drawspace.cloud/en-US)
returned a hard 404 ("Not found"); only `/` worked. Root cause: commit 6750c5b added a
top-level `public/404.html` to serve real 404s for missing assets. Cloudflare Pages treats a
top-level 404.html as "not a single-page application" (Serving Pages doc: "If your project
does not include a top-level 404.html file, Pages assumes that you are deploying a
single-page application"), so it stopped falling back to index.html and served 404.html for
ALL unmatched routes. The `_redirects` `/* /index.html 200` rewrite no longer rescued them.

Fix:
- Moved `public/404.html` -> `public/errors/not-found.html` (off the top level) so Pages
  resumes SPA mode. `_redirects` now: `/assets/* /errors/not-found.html 404` (real 404 for
  missing assets preserved) and `/* /index.html 200` (SPA fallback).
- Error-page SEO schema: `SeoHead` gained a `noindex` prop that sets
  `<meta name="robots" content="noindex, follow">` and resets to `index, follow` on every
  other route, so it never leaks across SPA navigation. `NotFound.tsx` passes `noindex`. The
  static `errors/not-found.html` also carries `noindex, follow` plus minimal markup.

Tradeoff (simplest option): unknown client routes are now soft-404 (HTTP 200 + the SPA
NotFound page) rather than hard-404, because a static SPA host cannot know valid client
routes server-side. `noindex, follow` tells search engines not to index them - the standard
SPA approach. Missing /assets/* still return a real HTTP 404.

Verification: build + tsc --noEmit clean; dist has NO top-level 404.html, includes
errors/not-found.html (noindex) and the updated _redirects; backend suite 161 pass / 0 fail /
4 skipped; local preview + browser confirmed /en-US renders Landing (robots index,follow), an
unknown route renders NotFound (robots noindex,follow), and client-side navigation home
resets robots to index,follow.

Manual step: takes effect live only after the FRONTEND is rebuilt and redeployed to
Cloudflare Pages (dist is gitignored; Pages builds from source). Commit + push to the branch
Pages builds from, then trigger/await the Pages deploy. Not committed/pushed/deployed here.
