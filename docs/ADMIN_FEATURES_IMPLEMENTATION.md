# Admin Features Implementation

Per-page implementation status for the admin dashboard. Every page below uses real backend
data; no fake demo functionality remains. Pages whose tables are not yet migrated degrade
to honest empty states (see `APPWRITE_SCHEMA_MIGRATIONS.md`). Nothing has been applied to
production.

## Overview
- Source: `GET /api/admin/overview` (`overviewRoutes.ts`).
- Real metrics: registered/guest players, active rooms, matches, word bank size, recent
  activity. Match counts degrade gracefully when `match_history` is absent.

## Roles & permissions
- Source: `GET /api/admin/permissions` + user role APIs.
- The displayed matrix is the code-defined matrix enforced server-side
  (`permissions.ts`). Role changes are audited and permission-gated (`roles.manage`).

## Users
- Source: `/api/admin/users` (search/status/role filters, pagination).
- Status and role changes are audited; ownership and validation enforced server-side.

## Rooms
- Source: `/api/admin/rooms` (`roomAdminRoutes.ts`, `RoomAdminService`).
- Lists live rooms with players/settings; close room and kick player require a reason and
  are audited. Reads the authoritative game state.

## Moderation
- Source: `/api/admin/reports` (`moderationReportRepository.ts`).
- Resolution flow with a custom moderator note (3–255 chars), resolution action, and
  timestamp surfaced in the list. Already-reviewed reports return `409`. Audited
  `report.resolved` / `report.dismissed`.
- Tests: `moderation.test.ts` (gating, resolve, dismiss, validation, 404/409).

## XP configuration
- Source: `/api/admin/xp-config` (`xpConfigRepository.ts`).
- Editable correct-guess XP, win bonus, challenge multiplier, level base/growth with
  clamped ranges and a live level preview. Returns defaults until the `xp_config` table
  exists; the game keeps working with defaults. Audited `config.xp`.
- Tests: `xpConfig.test.ts`. Needs migration: `xp_config`.

## SEO & redirects
- Source: `/api/admin/seo` and `/api/admin/seo/redirects` (`seoRepository.ts`).
- Per-route metadata (title, description, canonical, Open Graph, robots, JSON-LD) and
  redirect rules (301/302, unique source path). Admin changes drive the live
  `/robots.txt`, `/sitemap.xml`, and public `/api/redirects` — a single source of truth.
- Validation: route paths, length limits, JSON-LD parsed; duplicate redirect → `409`.
- Tests: `seo.test.ts` (gating, upsert/audit/delete, validation, redirect uniqueness,
  public crawler files, missing-table degradation). Needs migration: `seo_records`,
  `redirect_rules`.

## Media library
- Source: `/api/admin/media` (`mediaRepository.ts`) backed by Appwrite Storage.
- Real binary uploads (10 MB cap), rename, delete, and a public view route that proxies
  bytes through the server so the bucket stays private. Metadata in `media_assets`.
- Uploads return `503 STORAGE_UNAVAILABLE` until the bucket exists; listing degrades to
  empty. Audited `media.upload` / `media.rename` / `media.delete`.
- Tests: `media.test.ts` (gating, upload+list+public view, rename/delete, validation,
  storage-unavailable, missing-table). Needs migration: `media_assets` + `media` bucket.

## CRM & messaging
- Source: `/api/admin/crm` (`crmRepository.ts`).
- Campaigns (draft/sent) with live audience sizes computed from `profiles`,
  `player_progression`, and `user_statistics` for five segments: All players, Inactive
  30 days, Level 10+, New this week, Guests. Save/send/delete are audited.
- **Honest delivery:** no email or push provider is connected. "Sent" records a finalized
  campaign and its audience; the UI states clearly that no messages are delivered yet.
- Tests: `crm.test.ts` (gating, real segment counts, draft/send/audit, validation,
  edit/delete, missing-table degradation). Needs migration: `crm_messages`.

## Analytics
- Source: `/api/admin/analytics?days=7..90` (`analyticsRepository.ts`).
- Real aggregation over existing tables: signups, active users, words guessed, XP awarded,
  locale breakdown, account types, top players, and time series. Match-dependent metrics
  report `null` / "not connected" until `match_history` exists. No fabricated metrics
  (retention/avg-match-length omitted because they cannot be honestly computed yet).
- Tests: `analytics.test.ts` (gating, aggregation correctness, missing-table degradation,
  range validation). The fake `ANALYTICS` mock was removed.

## Blog, Words, Ads, Settings, Audit
- Existing content system (`/api/admin/content/*`, `adminDataRepository.ts`), preserved and
  integrated. Blog/words/ads CRUD with audit; settings write the `platform_settings`
  singleton consumed by the public site; audit log reads `audit_logs`.

## MCP keys
- Source: `/api/v1/admin/mcp` (`McpKeyService`). Scoped, hashed, expirable, revocable,
  rotatable keys. See `MCP_API_KEY_MANAGEMENT.md`. Needs migration: `mcp_api_keys`.

## Migration dependency summary

| Feature | Required schema |
| --- | --- |
| XP configuration | `xp_config` |
| SEO & redirects | `seo_records`, `redirect_rules` |
| Media library | `media_assets` + `media` Storage bucket |
| CRM | `crm_messages` |
| Analytics (match metrics) | `match_history` |
| MCP keys | `mcp_api_keys` |
| Platform branding | `platform_settings` extended columns |

All are additive and idempotent; see `APPWRITE_SCHEMA_MIGRATIONS.md` for scripts and the
approval-gated rollout. Features remain usable (with honest empty states) before migration.