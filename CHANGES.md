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
