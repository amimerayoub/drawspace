# MCP API Key Management

DrawSpace exposes a secure, MCP-compatible HTTP server for content operations (blog and
word bank). Access is controlled by scoped API keys managed from the admin dashboard.

**Connection status:** the MCP server and key management are implemented and tested, but
no external MCP-compatible client (for example ChatGPT) has connected and authenticated
yet. This document does not claim any live client connection.

## Key model

- Keys are independent of Appwrite auth. They authenticate MCP requests only.
- Format: `ds_mcp_` prefix + 32 random bytes (base64url). Generated with a CSPRNG.
- **Only the SHA-256 hash is stored** (`keyHash`). The plaintext key is returned exactly
  once, at creation or rotation, and is never persisted or logged.
- A short `keyPrefix` (first 12 characters) is stored for display/identification.
- Verification uses a constant-time comparison (`timingSafeEqual`) to avoid timing leaks.

Implementation: `server/src/mcp/keyService.ts`, `server/src/mcp/scopes.ts`.

## Scopes

Granular, least-privilege scopes (`server/src/mcp/scopes.ts`):

- Blogs: `blogs:read`, `blogs:create`, `blogs:update`, `blogs:publish`, `blogs:delete`,
  `blogs:import`, `blogs:export`
- Words: `words:read`, `words:create`, `words:update`, `words:delete`, `words:import`,
  `words:export`
- Analytics: `analytics:read`

A read-only preset is `blogs:read`, `words:read`, `analytics:read`. Each key carries an
explicit scope list; requests are checked against the key's scopes. Unknown scopes are
dropped on normalization, and a key must have at least one valid scope.

## Lifecycle

Managed via `/api/v1/admin/mcp` (admin/superadmin only) and the `McpAdmin` page:

- **Create** — name (1–64 chars), scopes, optional expiry (1–3650 days). Returns the
  plaintext key once plus a metadata view. Audited `mcp_key.create`.
- **Rotate** — issues a new key with the same name/scopes and revokes the old one.
  Returns the new plaintext once. Audited `mcp_key.rotate`. Only active keys rotate.
- **Revoke** — marks a key revoked with a timestamp; idempotent. Audited `mcp_key.revoke`.
- **List / status** — shows prefix, scopes, status, created/last-used/expiry/revoked
  timestamps, and whether the key table and env bootstrap are available.

Authentication rejects missing, unknown, revoked, or expired keys. Successful table-key
auth updates `lastUsedAt` (best effort).

## Storage and bootstrap

- Keys live in the `mcp_api_keys` table (row-secured, backend-only). Created by
  `server/scripts/migrate-content-system.mjs` (unique `keyHash`, `status` index).
- Before that migration is applied, key storage is unavailable: list/create/rotate/revoke
  return `503 MIGRATION_REQUIRED`, and the admin page shows the migration requirement.
- An optional environment bootstrap key (`DRAWSPACE_MCP_API_KEY`, scopes via
  `DRAWSPACE_MCP_SCOPES`) works without the table for initial setup. It is compared by
  hash and never printed. If no bootstrap scopes are set, it defaults to all scopes.

## Transport

Streamable HTTP at `/mcp`. The admin status endpoint reports `transport:
"streamable-http"`. Requests authenticate with the MCP key (bearer), independent of the
Appwrite JWT used by the rest of the admin API.

## Security properties

- No plaintext key storage; SHA-256 hashes only.
- Plaintext shown once; constant-time verification.
- Scoped, expirable, revocable, rotatable keys with audit trail.
- The Appwrite API key is never exposed to MCP clients or the frontend.
- Admin key management is permission-gated and rate-limited.

## Verification

`server/src/mcp/mcp.test.ts` covers hashing, scope normalization, create/rotate/revoke,
expiry, bootstrap fallback, and missing-table degradation. These pass in the full server
suite. End-to-end authentication against a real external MCP client is **not yet
performed** (no client has connected).