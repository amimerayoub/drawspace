# DrawSpace Content System — Schema Migration Proposal

Status: PROPOSAL. Nothing here is applied. Applying requires explicit user approval and is done via `server/scripts/migrate-content-system.mjs` (dry-run by default; `--apply` needs a typed confirmation; refuses production).

Appwrite remains the only backend. All changes are additive and idempotent. Existing columns/indexes/rows are preserved. Live schema is re-inspected by the script before any change.

## Why a migration is needed

The existing schema (see `docs/CONTENT_SYSTEM_AUDIT.md` §2) supports basic blog/word CRUD but lacks fields the content platform requires. Code is written to target the post-migration schema with graceful fallbacks, so it builds and unit-tests offline before this migration is approved.

## Proposed changes

### 1. blog_posts — add `tags`
- `tags`: string array, element size 32, default `[]`, not required. Stores lowercase tag slugs.
- `archived` status needs NO change (`status` is a free string(16)).
- No index change (tags filtered in memory after the published filter; dataset is small).

### 2. custom_words — add language, hint, normalized uniqueness, timestamps
- `language`: string(8), default `en`, not required. Game stays English-first.
- `hint`: string(255), default `''`, not required.
- `normalizedWord`: string(64), default `''`, not required. Backfilled to `trim().toLowerCase()` of `word`.
- `createdAt`, `updatedAt`: string(64), default `''`, not required. Backfilled to now on first write.
- New unique index `idx_normalizedWord` on `normalizedWord` for case-insensitive duplicate detection.
  - PRECONDITION: backfill all rows first. If existing rows contain case-insensitive duplicates (e.g. `Cat` and `cat`), the script REPORTS them in dry-run and SKIPS creating the unique index until resolved (no destructive dedupe). The existing case-sensitive `idx_word` is left intact.
- Game compatibility preserved: `id/word/category/difficulty/isActive` unchanged; difficulty stays `easy|medium|hard`.

### 3. New collection `word_categories` (configurable word categories)
- Row-secured, no client permissions (admin-only via server).
- Columns: `id` string(32) req, `name` string(64) req, `slug` string(64) req, `description` string(255) default `''`, `isActive` boolean default true, `sortOrder` integer(0..1000) default 0.
- Unique index `idx_slug` on `slug`.
- Seed (optional, on apply): Animals, Food, Objects, Technology, Nature, Sports, Countries, Professions, Entertainment, General. Words may still reference a category by name; this collection provides the managed list.

### 4. New collection `mcp_api_keys` (MCP credential store)
- Row-secured, NO client permissions (server-only). Plaintext keys are NEVER stored.
- Columns: `id` string(64) req, `name` string(64) req, `keyHash` string(128) req (SHA-256 hex of the secret), `keyPrefix` string(16) req (first 8 chars for display), `scopes` string array (element 32) default `[]`, `status` string(16) default `active` (`active|revoked`), `createdBy` string(36) req, `createdAt` string(64) req, `expiresAt` string(64) default `''`, `lastUsedAt` string(64) default `''`, `revokedAt` string(64) default `''`.
- Unique index `idx_keyHash` on `keyHash`; index `idx_status` on `status`.
- Audit of key create/revoke/rotate and MCP tool calls reuses the existing `audit_logs` collection (resourceType `mcp_key` / `mcp_tool`).

## What is NOT changed
- No existing column is removed or retyped. No existing index is removed.
- `blog_posts`/`custom_words` `read("any")` permission is left as-is here; tightening it is a separate permission-hardening decision (see `docs/APPWRITE_PERMISSION_HARDENING_PLAN.md`) requiring its own approval. The content API never exposes drafts publicly regardless.
- No data is deleted. Backfills only set new, previously-empty fields.

## Apply procedure
1. `node --env-file-if-exists=.env.local server/scripts/migrate-content-system.mjs` (dry-run; prints plan + any normalized-word collisions).
2. Review the plan. Resolve any reported case-insensitive word duplicates if the unique index is desired.
3. With approval: `APPWRITE_ENV=development node --env-file-if-exists=.env.local server/scripts/migrate-content-system.mjs --apply` and type the confirmation phrase.
4. Re-run dry-run to confirm the schema is complete.

## Rollback
Additive columns/collections can be left in place (code falls back gracefully). A `--rollback` mode is intentionally NOT provided for column drops to avoid destructive data loss; removal, if ever needed, is a manual approved operation.