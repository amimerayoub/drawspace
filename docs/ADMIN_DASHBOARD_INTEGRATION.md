# Admin Dashboard Integration

The admin dashboard is fully integrated with the main website against a single source of
truth in Appwrite. Admin changes flow to the public site through backend APIs; the public
site never reads admin-only data directly. Existing functionality, UI identity, game
mechanics, authentication, and architecture are preserved.

## Architecture

- **Frontend:** React 18 + TypeScript (strict) + Vite. The admin console lives under
  `/admin` (`src/routes/admin/AdminApp.tsx`) with lazy-loaded pages.
- **Backend:** Express 5 + Socket.IO, TypeScript, zod validation. Admin APIs are mounted
  under `/api/admin/*` and `/api/v1/admin/*`.
- **Database:** Appwrite TablesDB (`drawspace_db`) accessed server-side with the API key.
  The frontend uses Appwrite only for authentication (JWT) and calls the backend for data.
- **API client:** `src/services/apiClient.ts` attaches an Appwrite JWT
  (`appwriteAccount.createJWT()`) to each request and unwraps `{ data }` responses.
  `src/services/backendAdmin.service.ts` is the typed admin API surface.

## Single source of truth

Each domain has one backend repository reading/writing one Appwrite table; both the admin
UI and the public site consume that same data through APIs.

| Domain | Admin write | Public read | Table |
| --- | --- | --- | --- |
| Platform branding/settings | `PUT /api/admin/content/settings` | `GET /api/platform/config` | `platform_settings` |
| Blog | `PUT /api/admin/content/blog/:id` | `GET /api/blog`, `/api/blog/:slug` | `blog_posts` |
| Ads | `PUT /api/admin/content/ads/:id` | `GET /api/ads/:placement` | `advertisements` |
| Words | `PUT /api/admin/content/words/:id` | game word selection | `custom_words` |
| SEO / redirects | `PUT /api/admin/seo`, `/seo/redirects` | `/robots.txt`, `/sitemap.xml`, `/api/redirects` | `seo_records`, `redirect_rules` |
| XP config | `PUT /api/admin/xp-config` | game scoring | `xp_config` |

### Public platform config

`src/context/PlatformConfigContext.tsx` fetches `GET /api/platform/config` (no auth) once
at startup and exposes it via `usePlatformConfig()`. `Header`, `Footer`, `SeoHead`, `App`,
and `SignUp` render site name, tagline, logo, announcement, and SEO from this config. The
backend `AdminDataRepository.getPublicConfig()` reads the `platform_settings` singleton
and caches it for 30 seconds.

### Cache invalidation

- Writing settings clears the backend public-config cache immediately
  (`updateSettings` sets `publicConfigCache = null`), so the next public read is fresh.
- The frontend context exposes `refresh()` to re-fetch on demand.
- XP config uses a short 5-second cache that is replaced on update.

## Authorization (server-enforced)

The permission matrix is code-defined in `server/src/auth/permissions.ts` (18 permissions,
6 roles) and enforced by `requirePermission` middleware. The admin UI reads the same matrix
via `GET /api/admin/permissions`, and `useAdmin()` in `src/routes/admin/shared.tsx` mirrors
it for gating, so displayed permissions match enforcement.

- `superadmin`, `admin`: all permissions.
- `moderator`: users.view, moderation.handle, rooms.view, audit.view.
- `content_manager`: words.manage, content.blog, content.ads, content.media.
- `analyst`, `support`: analytics.view, audit.view.

Routes return 401 without a valid JWT and 403 without the required permission. Pages render
`NoAccess` when the role lacks the permission, and `AdminApp` gates routes with `<Gate
perm=...>`. Notable gates: `content.seo` (admin only), `crm.send` (admin only),
`content.media` (content_manager and above), `analytics.view`.

## Admin pages and data sources

| Page | Backend | Notes |
| --- | --- | --- |
| Overview | `/api/admin/overview` | Real counts from players, rooms, matches |
| Roles & permissions | `/api/admin/permissions`, users role API | Matrix matches enforcement |
| Users | `/api/admin/users` | Search, status, role changes (audited) |
| Rooms | `/api/admin/rooms` | Live rooms, close/kick (audited) |
| Moderation | `/api/admin/reports` | Moderator notes, resolution, 409 on re-review |
| XP configuration | `/api/admin/xp-config` | Defaults until `xp_config` migration |
| SEO & redirects | `/api/admin/seo` | Drives live crawler files; needs migration |
| Media library | `/api/admin/media` | Appwrite Storage; needs bucket + table |
| CRM & messaging | `/api/admin/crm` | Live audiences; needs `crm_messages`; no delivery provider |
| Analytics | `/api/admin/analytics` | Real aggregation; match metrics need `match_history` |
| Blog / Words / Ads / Settings / Audit | `/api/admin/content/*` | Existing content system |
| MCP keys | `/api/v1/admin/mcp` | Scoped keys; needs `mcp_api_keys` |

## Graceful degradation

Features whose tables are not yet migrated show honest empty states and keep the rest of
the app working: XP defaults, empty SEO/media/CRM lists, safe crawler defaults, and
`null`/"not connected" analytics for match-dependent metrics. No fake demo data is shown.

## Verification

Backend behavior is covered by route tests (permissions, CRUD, audit, validation,
degradation) in `server/src/routes/*.test.ts`. The frontend passes `tsc --noEmit` and a
production Vite build. See `ADMIN_TEST_REPORT.md` for results and blockers.