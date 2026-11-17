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