# DrawSpace MCP Implementation Report

Technical report on the secure MCP server added to DrawSpace (Phase 7), its documentation (Phase 9), the admin management page (Phase 10), and verification (Phases 11-12).

## Objective

Allow compatible AI assistants and MCP clients to retrieve and manage DrawSpace blog articles and words through a secure server-side integration, using Appwrite as the only data source. AI clients never receive an Appwrite API key and never connect to Appwrite directly.

## Implementation summary

| Area | Decision |
| --- | --- |
| SDK | Official `@modelcontextprotocol/sdk` 1.32.2 |
| Transport | Streamable HTTP, stateless mode, JSON responses (`enableJsonResponse`) |
| Placement | Well-isolated module in the existing Express backend, mounted at `POST /mcp` |
| Authentication | Dedicated scoped MCP keys (`ds_mcp_...`), SHA-256 hashed; optional env bootstrap key |
| Authorization | 14 granular scopes; least privilege; read-only available separately |
| Business rules | MCP tools call the same `WordService`/`BlogService` used by the admin API |
| Key storage | `mcp_api_keys` Appwrite table (created by the content schema migration) |
| Audit | `audit_logs` table; MCP operations use actor role `mcp`; key lifecycle events audited |
| Admin UI | `/admin/mcp` page (superadmin/admin only) |

## Files added

Backend (`server/src/`):

- `mcp/scopes.ts` - scope constants, read-only preset, normalization helpers.
- `mcp/keyService.ts` - key generation (`crypto.randomBytes(32)`), SHA-256 hashing, timing-safe bootstrap comparison, authenticate/list/create/revoke/rotate/status, pre-migration fallback, audit.
- `mcp/tools.ts` - `buildMcpServer` registering 19 tools with zod input schemas, scope checks, confirmation gates, and `{success,message,data}` envelopes.
- `mcp/http.ts` - Express router: body parsing (3 MB), rate limit (120/min), bearer-key auth, stateless Streamable HTTP transport per request, 405 for GET/DELETE.
- `routes/mcpAdminApiV1.ts` - admin key management API (status, keys, create, revoke, rotate, audit), restricted to superadmin/admin.
- `mcp/mcp.test.ts` - offline tests (key lifecycle, real MCP handshake, scopes, confirmations, HTTP auth, admin API).

Backend wiring:

- `app.ts` - mounts `/mcp` and `/api/v1/admin/mcp`; skips the global 256 KB body parser for `/mcp`.
- `config/env.ts` - optional `DRAWSPACE_MCP_API_KEY` and `DRAWSPACE_MCP_SCOPES`.

Frontend (`src/`):

- `services/mcp.service.ts` - typed client for the admin MCP API.
- `routes/admin/McpAdmin.tsx` - status, key table, create-key modal with scope selection, shown-once secret modal with copy, revoke/rotate confirmations, audit history.
- `routes/admin/AdminApp.tsx` - nav item and route gated by `settings.manage`.
- `styles/admin.css` - MCP page styles.

Docs: `MCP_SETUP.md`, `MCP_SECURITY.md`, this report, and the MCP sections of `CONTENT_SYSTEM_TEST_REPORT.md`.

## Tools (19)

Blog: `drawspace_list_blogs`, `drawspace_get_blog`, `drawspace_create_blog` (draft by default), `drawspace_update_blog`, `drawspace_publish_blog`, `drawspace_archive_blog`, `drawspace_delete_blog`.

Word: `drawspace_list_words`, `drawspace_add_word`, `drawspace_update_word`, `drawspace_delete_word`, `drawspace_bulk_add_words`, `drawspace_import_words`, `drawspace_export_words`.

Import/export: `drawspace_import_blogs`, `drawspace_export_blogs`.

Analytics: `drawspace_get_blog_stats`, `drawspace_get_word_stats`, `drawspace_get_content_summary` (all from stored data).

Every tool returns a structured envelope with real Appwrite ids and values. Failed operations return `success: false` with a code and never claim a write succeeded. There is no generic query or arbitrary-collection tool.

## Scopes (14)

`blogs:read`, `blogs:create`, `blogs:update`, `blogs:publish`, `blogs:delete`, `words:read`, `words:create`, `words:update`, `words:delete`, `words:import`, `words:export`, `blogs:import`, `blogs:export`, `analytics:read`.

Each tool checks its scope before acting. Creating a non-draft article additionally requires `blogs:publish`. Publish, archive, and delete require `confirm: true`; the import `replace` strategy requires `confirm: true`.

## Key lifecycle

1. Create: `POST /api/v1/admin/mcp/keys` (superadmin/admin) generates a high-entropy key, stores only its SHA-256 hash, and returns the plaintext once.
2. Use: client sends `Authorization: Bearer ds_mcp_...` to `/mcp`. The server hashes the presented key, looks it up, checks status and expiration, and updates `lastUsedAt` best-effort.
3. Revoke: `POST /api/v1/admin/mcp/keys/:id/revoke` with `confirm: true` immediately invalidates the key.
4. Rotate: `POST /api/v1/admin/mcp/keys/:id/rotate` with `confirm: true` creates a replacement with the same scopes, revokes the old key, and returns the new plaintext once.

Before the `mcp_api_keys` migration is applied, only the optional `DRAWSPACE_MCP_API_KEY` bootstrap key works (all scopes, or `DRAWSPACE_MCP_SCOPES` if set), and key management returns 503 `MIGRATION_REQUIRED`. Authentication fails closed otherwise.

## Security properties

- Appwrite key stays server-side; never returned, sent to clients, or logged.
- MCP keys hashed at rest; plaintext shown once; timing-safe bootstrap comparison.
- Revoked and expired keys rejected; scope enforcement; confirmation gates.
- Rate limiting, zod validation, input sanitization, CSV formula-injection protection, file-size limits, safe JSON parsing, duplicate protection, audit logging.
- No arbitrary database queries, no code execution, no filesystem access through MCP.
- Public content APIs expose only published, safe fields; drafts never public.

Full review: `MCP_SECURITY.md`.

## Verification

- `npm run server:test`: 73 tests, 69 passed, 0 failed, 4 skipped (environment-gated Appwrite/Redis integration).
- MCP tests drive a real SDK client/server handshake (in-memory transport) and real HTTP requests for auth and the admin key API, against the actual content services backed by an isolated database double.
- Both typechecks pass; the admin MCP page compiles and its route renders.
- Live read-only probes: `/mcp` fails closed (401) without a valid key; admin MCP routes require auth; public blogs unaffected.

BLOCKED: live authenticated MCP writes against production (requires the migration, a real key, and authorization). Admin interactive flows (no credentials). These are reported honestly in `CONTENT_SYSTEM_TEST_REPORT.md`; no integration result was faked and no production content was created.

## How to create an MCP key

1. Apply the content schema migration to create `mcp_api_keys` (see `CONTENT_SCHEMA_MIGRATION_PROPOSAL.md`). This is a cloud schema change and requires explicit approval.
2. Sign in as superadmin/admin and open `/admin/mcp`, or call `POST /api/v1/admin/mcp/keys` with a name and scopes.
3. Copy the returned secret immediately; it is shown only once.

## How to connect an MCP client

Configure a Streamable-HTTP-capable MCP client to POST to `https://server.drawspace.cloud/mcp` (or `http://localhost:3001/mcp` locally) with `Authorization: Bearer YOUR_DRAWSPACE_MCP_API_KEY`. The client must explicitly support the transport and be authorized by the user. No AI product connects automatically. See `MCP_SETUP.md` for a placeholder configuration and example commands.

## Remaining configuration requirements

- Apply the content schema migration (creates `word_categories`, `mcp_api_keys`, optional content columns, and the normalized-word index). Proposed, not applied; requires approval.
- Optionally set `DRAWSPACE_MCP_API_KEY` / `DRAWSPACE_MCP_SCOPES` for bootstrap access; remove or restrict once scoped keys exist.
- For production: HTTPS, `FRONTEND_ORIGINS` allowlist, and a shared rate limiter if running multiple instances.