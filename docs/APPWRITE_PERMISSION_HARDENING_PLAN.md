# Appwrite Permission Hardening Plan

Status: **live audit complete; proposed changes are not applied**. No Appwrite records, schema, permissions, or authentication settings were modified.

Target was guarded against the configured endpoint/project/database before each live read-only request. A fresh `TablesDB.listTables` response returned 24 tables. Metadata-only row queries selected `$id` and `$permissions` for all 64 existing rows; row content was not selected or logged. For rows with owner grants, checks compared permission principals with the owner ID field in memory and emitted only aggregate counts. The fresh, sanitized baseline is [APPWRITE_PERMISSION_BASELINE.json](./APPWRITE_PERMISSION_BASELINE.json). It contains schema metadata and normalized permission patterns, not row IDs, user IDs, or credentials.

`match_history` is not present. The Phase 5 migration remains separate and must not be run as part of this permissions plan.

## Application access model

The browser Appwrite SDK in `src/lib/appwrite.ts` creates an `Account` client only. No `TablesDB`, `Databases`, or collection/table row calls exist in frontend code. `src/services/db.ts` and the old generic `src/services/index.ts` use local storage/mock state; real profile/progression/match features call the backend API. Backend repositories use the server Appwrite API key. Public and user-specific access is therefore mediated by Express routes, while admin actions additionally check active `admin_roles` entries in backend code.

**Proposal:** all 24 tables become backend-service-only: table permissions `[]`, Row Security enabled, and no row-level permissions. Public catalog/profile/leaderboard/blog/advertisement features continue through existing public APIs, which can return limited projections. Authenticated features continue through routes deriving the owner from a verified Appwrite JWT. Admin reads and writes continue through role-protected routes. Appwrite table permissions do not encode the application's custom admin role; server-side `requireAdmin` remains mandatory.

## Live permission matrix

Permission terms: `any` means anonymous and authenticated public access; `users` means any authenticated Appwrite user; `user:<owner>` means a row grant to that row's owner. Empty table permissions are shown as `—`. Row grant patterns below were observed across all current rows; counts appear in the row-permission column. Row-level grants are not effective while Row Security is disabled, but the proposed script still removes them before completion.

| Table | Current table permission / RLS | Current row permissions | Application use and access path | Required/proposed permissions | Breakage and verification |
| --- | --- | --- | --- | --- | --- |
| `profiles` | `read(any)`, `create(users)`; RLS on | 1 row: `read(any)`, `update(owner)`, `delete(owner)`; owner matched `userId` | Profile ensure/read/update; public profile lookup; match username resolution; sockets, leaderboard and admin user views. Backend profile/match/admin routes. | Table `[]`; RLS on; no row grants. Public profile only through sanitized API; self writes through `/api/profiles/me`. | Direct Appwrite profile reads/writes stop. API tests: anonymous denied, owner can update only self through API, public projection omits `userId` and normalized username. |
| `avatars` | `read(any)`; RLS off | Not applicable (RLS off); no row grants observed | Admin catalog repository; frontend avatar assets are static mappings. `/api/admin/catalog` is role-protected. | Table `[]`; RLS on; no row grants. | Any undocumented direct client catalog read stops. Test admin API access and public static avatar rendering. |
| `user_preferences` | `create(users)`; RLS on | 1 row: `read(owner)`, `update(owner)`; owner matched `userId` | Preferences GET/PATCH, authenticated backend routes. | Table `[]`; RLS on; no row grants. | Direct Appwrite self access stops; backend self-service remains. Test user A/B isolation and no unauthenticated writes. |
| `user_statistics` | `read(any)`, `create(users)`; RLS on | 11 rows: 10 with no row grants, 1 with `read(any)`, `update(owner)`; owner matched | Authenticated stats/progression, public leaderboard and admin user views; backend repositories only. | Table `[]`; RLS on; no row grants. | Direct statistics reads/writes stop; public leaderboard remains through projection. Verify stats self API and public leaderboard output. |
| `guest_sessions` | `read(any)`, `create(any)`, `update(any)`; RLS off | 3 rows: `read(owner)`, `update(owner)`; owner matched `guestUserId` (inactive while RLS off) | Guest session creation/migration, backend `GuestRepository`; authenticated `/api/guest` routes. | Table `[]`; RLS on; no row grants. | Direct anonymous read/create/update and owner direct access stop. Verify authenticated guest flow and cross-user migration denial. |
| `guest_migration_records` | `create(users)`; RLS on | 0 rows | Backend-only guest migration ledger writes. | Table `[]`; RLS on; no row grants. | Direct authenticated writes stop. Verify only verified registered user can trigger same-account migration. |
| `player_progression` | `read(any)`; RLS off | Not applicable; no row grants observed | Progression dashboard, XP awards/equipment, public leaderboard, admin users. Backend only. | Table `[]`; RLS on; no row grants. | Direct account progression reads stop. Verify `/api/progression/me` owner filter, leaderboard projection, admin role gate. |
| `xp_transactions` | `read(any)`; RLS off | Not applicable; no row grants observed | Backend XP idempotency, progression rewards/history; no client query. | Table `[]`; RLS on; no row grants. | Direct XP/reason/match data reads stop. Verify transaction idempotency and owner rewards API. |
| `achievements` | `read(any)`; RLS off | Not applicable; no row grants observed | Public achievements API and backend progression evaluation; admin catalog. | Table `[]`; RLS on; no row grants. | Direct reads stop; public achievements API continues. Verify anonymous API returns active public fields only. |
| `user_achievements` | `read(any)`; RLS off | Not applicable; no row grants observed | Backend progression dashboard/unlock writes. | Table `[]`; RLS on; no row grants. | Direct user achievement reads stop. Verify authenticated owner dashboard and no user ID override. |
| `titles` | `read(any)`; RLS off | Not applicable; no row grants observed | Backend progression/dashboard/equip, public leaderboard title projection, admin catalog. | Table `[]`; RLS on; no row grants. | Direct read stops; public fields remain through API. Verify title ownership before equip. |
| `user_titles` | `read(any)`; RLS off | Not applicable; no row grants observed | Backend title unlock/equip ownership checks. | Table `[]`; RLS on; no row grants. | Direct reads stop. Verify cross-user title cannot be equipped. |
| `challenges` | `read(any)`; RLS off | Not applicable; no row grants observed | Backend dashboard/claim progress and admin catalog. | Table `[]`; RLS on; no row grants. | Direct reads stop; authenticated/public API paths remain. Verify only server-calculated progress can be claimed. |
| `user_challenges` | `read(any)`; RLS off | Not applicable; no row grants observed | Backend per-user challenge progress and claims. | Table `[]`; RLS on; no row grants. | Direct reads stop. Verify owner isolation and duplicate claim prevention. |
| `leaderboard_snapshots` | `read(any)`; RLS off | Not applicable; no row grants observed | No active repository query found; live leaderboard currently derives from progression/statistics. Catalog reference checks may query avatar rows, not snapshots. | Table `[]`; RLS on; no row grants. | Any undocumented direct reader stops. Confirm legacy snapshot feature is unused before applying. |
| `admin_roles` | `read(users)`; RLS off | Not applicable; no row grants observed | Backend `requireAdmin` role lookup and admin role management. | Table `[]`; RLS on; no row grants. Admin access is via server role checks only. | Direct authenticated role-list access stops. Verify non-admin 403 and active admin success. |
| `audit_logs` | `read(users)`; RLS off | Not applicable; no row grants observed | Backend audit writes and admin audit views. | Table `[]`; RLS on; no row grants. | Direct audit read stops. Verify admin-only audit route and audit write flows. |
| `blog_posts` | `read(any)`; RLS off | Not applicable; no row grants observed | Public blog API and admin content route; backend only. | Table `[]`; RLS on; no row grants. | Direct table reads stop; public published-only API remains. Verify drafts are not returned publicly. |
| `blog_categories` | `read(any)`; RLS off | Not applicable; no row grants observed | Backend public/admin blog projection. | Table `[]`; RLS on; no row grants. | Direct reads stop; blog API continues. Verify published post category projection. |
| `advertisements` | `read(any)`; RLS off | Not applicable; no row grants observed | Public ad endpoint and admin content route; backend only. | Table `[]`; RLS on; no row grants. | Direct reads stop; active placement API continues. Verify date/status filtering and admin authorization. |
| `moderation_reports` | `create(users)`; RLS on | 0 rows | Authenticated player report creation; admin/moderator list and resolve routes. | Table `[]`; RLS on; no row grants. | Direct Appwrite report creation stops; `/api/reports` stays authenticated and room-membership checked. Verify non-admin cannot read/resolve. |
| `moderation_actions` | `read(users)`; RLS off | Not applicable; no row grants observed | Backend admin user list/detail and moderation history. | Table `[]`; RLS on; no row grants. | Direct authenticated reads stop. Verify admin-only user inspection; moderation action changes still audited. |
| `platform_settings` | `read(any)`; RLS off | Not applicable; no row grants observed | Backend game settings, admin platform settings; no client table access. | Table `[]`; RLS on; no row grants. | Direct read stops. Verify game configuration is server-readable and settings routes require admin. |
| `custom_words` | `read(any)`; RLS off | Not applicable; no row grants observed | Backend game word selection, admin catalog. | Table `[]`; RLS on; no row grants. | Direct reads stop. Verify active words are offered through authorized game flow and admin catalog requires editor role. |

**Per-table rollback for each matrix row:** use the secured backup to restore that table's original table permissions, Row Security flag, and captured row permission arrays. The script refuses to overwrite the backup or rollback an unexpected target state.

`match_history` is absent from the 24-table live inventory and is not part of this permission change.

## Authorization requirements

- Table permissions remain empty for every table. Appwrite table permissions will no longer be used for public, authenticated, owner, or admin access.
- Row Security will be enabled for every table, with no row-level user/team grants. This gives direct Appwrite clients no table or row access; the server API key continues to read/write.
- Public routes may return only explicit projections: public profiles, active achievements, leaderboard fields, published blog posts, and active ads. No route may return raw Appwrite rows.
- Authenticated routes must derive `userId` from verified JWT identity, never request body/query values. Match `/me`, profile, preferences, stats, and progression remain owner-scoped.
- Admin routes must call `requireAuth` and `requireAdmin` against active `admin_roles`. Appwrite permissions do not replace this check.
- Room mutations must verify active room membership and socket ownership; nonmembers must not be able to ready/start/draw/guess/report against a room. A valid JWT alone is not room membership.

## Potential breakage

Repository search found no browser-side TablesDB/Databases calls. The frontend Appwrite client uses `Account` for authentication; database-backed features call the backend API, and avatar art is bundled static content. Thus the checked-in application has no direct table consumer that should break.

Any undocumented external client, Appwrite Function, admin script, dashboard workflow, or legacy build that reads/writes these tables directly will lose that access. This must be confirmed with the project owner before approval. Enabling RLS and clearing row grants does not remove records, but Appwrite may update row `$updatedAt` metadata when row permissions are changed.

## Verification and rollback

The migration script is [harden-appwrite-permissions.mjs](../server/scripts/harden-appwrite-permissions.mjs). It defaults to dry-run, accepts only the guarded test target, validates the live table set/schema/permissions and every row's permission template before any change, refuses drift/unknown table IDs, and displays planned table and row grants. `--apply` requires a separately supplied secure backup path and a typed target confirmation. It changes only table permissions, Row Security flags, and row permission arrays; it does not delete or alter application column data. It verifies the post-state.

Before approval, run the dry-run and review its exact table list/counts:

```powershell
npm run appwrite:permissions:dry-run
```

After approval, set an absolute backup path outside the repository and run apply:

```powershell
$env:APPWRITE_PERMISSION_BACKUP_PATH = 'C:\Secure\DrawSpace\appwrite-permissions-before.json'
node --env-file-if-exists=.env.local server/scripts/harden-appwrite-permissions.mjs --apply
```

The apply script requires the exact project/database phrase printed by the script. The backup contains row IDs and original permission arrays; store it in an access-controlled location and never commit it. Rollback is:

```powershell
node --env-file-if-exists=.env.local server/scripts/harden-appwrite-permissions.mjs --rollback --backup-file 'C:\Secure\DrawSpace\appwrite-permissions-before.json'
```

Rollback requires a typed confirmation and restores previous table permissions, RLS flags, and captured row permissions without deleting records. It can re-expose the same broad grants and should be used only to recover an application outage.

Post-apply tests must include: anonymous Appwrite table read/create/update/delete denied; authenticated non-owner direct read/write denied; owner direct CRUD denied; backend service-key CRUD still works; public API projections remain available; cross-user API access is denied; room members can perform allowed game actions and nonmembers cannot; admin routes accept active admin and reject non-admin; match owner sees only own history; all existing data row counts remain unchanged. Run against an isolated test project before requesting any production approval.

## Approval required

No Appwrite permission change is approved or applied by this task. Before applying, obtain explicit approval for:

1. Removing all direct Appwrite table permissions from the 24 listed tables.
2. Enabling Row Security on the tables where it is currently disabled and clearing existing row-level permissions on all rows.
3. Accepting that undocumented direct Appwrite clients/integrations will stop working.
4. The exact guarded target: Appwrite endpoint `https://fra.cloud.appwrite.io/v1`, project `your_appwrite_project_id` (supplied via `APPWRITE_TEST_PROJECT_ID`), database `drawspace_db`.
5. The secured backup location and approved rollback operator.
