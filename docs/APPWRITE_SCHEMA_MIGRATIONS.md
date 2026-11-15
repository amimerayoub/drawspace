# Appwrite Schema Migrations — Admin Dashboard Integration

This document describes every schema change required by the admin-dashboard integration
and the production data fixes. **Nothing here has been applied to production.** All
migrations are additive, idempotent, dry-run by default, and refuse to run against
production. Applying any change to a live project requires explicit approval.

Appwrite remains the database and backend platform. No data is migrated to another
provider. No existing records are deleted or overwritten.

## Target

- Endpoint: `https://fra.cloud.appwrite.io/v1`
- Project: `<project-id>` (configured locally via `APPWRITE_PROJECT_ID`; never committed)
- Database: `drawspace_db`
- Credentials live only in the gitignored `.env.local`. Scripts never print secret values.

## Migration scripts

| Script | Covers | Status |
| --- | --- | --- |
| `server/scripts/migrate-content-system.mjs` | `word_categories`, `mcp_api_keys`, `blog_posts.tags`, `custom_words` extended columns + `normalizedWord` backfill/index | Existing, dry-run default |
| `server/scripts/migrate-match-history.mjs` | `match_history` (per-player records, 3 indexes) | Existing, dry-run default |
| `server/scripts/migrate-admin-features.mjs` | `xp_config`, `seo_records`, `redirect_rules`, `media_assets`, `crm_messages`, `platform_settings` branding columns, `media` Storage bucket | New, dry-run default |

All three scripts:

- Require `APPWRITE_ENV` set to `development` or `staging` and **throw on `production`**.
- Require `APPWRITE_ENDPOINT`, `APPWRITE_PROJECT_ID`, `APPWRITE_API_KEY` (values never printed).
- Default to dry-run; `--apply` is required to make changes.
- Inspect live state first, print a plan, and only create what is missing (idempotent).
- Verify existing columns/indexes are compatible and abort without changes on conflict.
- Require a typed confirmation phrase before applying.
- Create row-secured tables with **no client permissions** (backend-only access via the API key).
- Poll each resource until `available`, stopping safely on `failed`/`stuck`/`deleting`.

## New tables (migrate-admin-features.mjs)

All tables are row-secured with no direct client permissions. The backend reads and writes
them with the server API key; the public site never accesses them directly.

### xp_config (singleton)

Backs the XP configuration page. The repository falls back to defaults when the table or
row is absent, so the game keeps working before migration. No seed row is created.

| Column | Type | Range / size | Default |
| --- | --- | --- | --- |
| correctGuessXp | integer | 0..200 | 15 |
| winBonusXp | integer | 0..500 | 30 |
| challengeMultiplier | float | 0.5..5 | 1 |
| levelBase | integer | 10..5000 | 100 |
| levelGrowth | float | 1..2 | 1.18 |
| updatedAt | string | 64 | '' |
| updatedBy | string | 36 | '' |

### seo_records

Backs per-route SEO metadata and the generated `robots.txt` / `sitemap.xml`.

| Column | Type | Size | Notes |
| --- | --- | --- | --- |
| route | string | 200 | required, unique index `idx_route` |
| title | string | 70 | |
| description | string | 170 | |
| canonical | string | 300 | |
| ogTitle | string | 70 | |
| ogDescription | string | 170 | |
| robots | string | 16 | `index` / `noindex` |
| structuredData | string | 5000 | JSON-LD |
| updatedAt | string | 64 | |

### redirect_rules

Backs redirect management and the public `/api/redirects` feed.

| Column | Type | Size / range | Notes |
| --- | --- | --- | --- |
| id | string | 64 | required, unique index `idx_id` |
| fromPath | string | 200 | required, unique index `idx_fromPath` |
| toPath | string | 200 | required |
| code | integer | 301..302 | default 301 |
| hits | integer | 0..2147483647 | default 0 |
| updatedAt | string | 64 | |

### media_assets

Metadata for files stored in the private `media` Storage bucket. The bucket holds the
bytes; this table holds the searchable record. The public view route proxies bytes through
the server so the bucket can stay private.

| Column | Type | Size / range | Notes |
| --- | --- | --- | --- |
| id | string | 64 | required, unique index `idx_id` |
| name | string | 255 | |
| kind | string | 16 | `image` / `avatar` / `document` |
| size | integer | 0..2147483647 | bytes |
| mimeType | string | 128 | |
| fileId | string | 64 | Storage file id |
| createdAt | string | 64 | key index `idx_createdAt` (desc) |
| uploadedBy | string | 36 | |

### crm_messages

Backs CRM campaigns. Audience sizes are computed live from `profiles`,
`player_progression`, and `user_statistics`; no delivery provider is connected, so a
`sent` campaign records intent and audience, not external delivery.

| Column | Type | Size / range | Notes |
| --- | --- | --- | --- |
| id | string | 64 | required, unique index `idx_id` |
| segment | string | 32 | |
| subject | string | 90 | |
| body | string | 5000 | |
| status | string | 16 | `draft` / `sent` |
| recipients | integer | 0..2147483647 | audience at save/send time |
| sentAt | string | 64 | |
| createdAt | string | 64 | |
| updatedAt | string | 64 | |

## Extended columns on platform_settings

Additive optional columns on the existing `platform_settings` singleton, used by the
public platform config (branding/SEO). Existing rows and columns are untouched.

| Column | Type | Size | Default |
| --- | --- | --- | --- |
| logoUrl | string | 500 | '' |
| faviconUrl | string | 500 | '' |
| announcement | string | 500 | '' |
| seoTitle | string | 70 | '' |
| seoDescription | string | 170 | '' |

## Storage bucket

| Bucket | File security | Enabled | Max file size | Client permissions | Encryption | Antivirus |
| --- | --- | --- | --- | --- | --- | --- |
| `media` (or `STORAGE_BUCKET_ID`) | yes | yes | 10 MB | none | yes | yes |

The bucket id must match the server's `STORAGE_BUCKET_ID` (default `media`). Until the
bucket exists, media uploads return a clear `503 STORAGE_UNAVAILABLE`; listing degrades to
an empty library. An existing bucket is left unchanged (idempotent, non-destructive).

## Graceful degradation before migration

Every new feature works against the current production schema without these tables:

- XP config returns defaults; saving requires the table.
- SEO/redirects list empty; crawler files serve safe defaults; saving requires the tables.
- Media lists empty; uploads return `503` until the bucket and table exist.
- CRM lists empty campaigns; audience sizes still compute from existing player tables.
- Analytics match-dependent metrics report `null` / "not connected" until `match_history` exists.

## Rollout steps (manual, approval-gated)

1. Configure a test-only API key in `.env.local` (never committed) and set
   `APPWRITE_ENV=development` (or `staging`).
2. Dry-run each script and review the printed plan:
   ```bash
   node --env-file-if-exists=.env.local server/scripts/migrate-content-system.mjs --dry-run
   node --env-file-if-exists=.env.local server/scripts/migrate-match-history.mjs --dry-run
   npm run appwrite:admin-features:dry-run
   ```
3. Confirm the target project identity matches the intended nonproduction project.
4. Apply in the nonproduction target with `--apply` and the typed confirmation phrase.
5. Re-run dry-run to confirm the plan reports "already complete and compatible".
6. Run the integration tests against the nonproduction target and verify run-owned rows
   are cleaned up; leave unrelated records untouched.
7. **Production:** obtain explicit approval for the exact project and operations. The
   scripts refuse `APPWRITE_ENV=production`; use the approved production migration
   process to apply the same additive changes. Do not modify existing tables, permissions,
   or records.

## Safety guarantees

- Additive only: new tables, new optional columns, new indexes, new bucket. No drops, no
  renames, no permission changes to existing tables, no record deletion or overwrite.
- Idempotent: safe to re-run; only missing resources are created.
- Compatibility-checked: incompatible existing columns/indexes abort the run before any
  change is applied.
- Secret-safe: credentials are read from the environment and never printed or committed.