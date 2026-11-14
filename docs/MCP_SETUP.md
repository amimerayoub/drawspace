# DrawSpace MCP Setup

This guide explains how to run the DrawSpace MCP server, manage its credentials, and connect an MCP-compatible client. It describes the implementation that ships in this repository. Nothing here claims that any specific AI product connects automatically.

## 1. What DrawSpace MCP is

DrawSpace MCP is a Model Context Protocol server that lets compatible AI assistants and MCP clients manage DrawSpace blog articles and the word bank. It is a well-isolated module inside the existing Express backend (`server/src/mcp/`), mounted at `POST /mcp`.

Every operation goes through the same server-side content services used by the admin dashboard (`WordService`, `BlogService`). The MCP server reads and writes Appwrite using the backend's own server-side key. AI clients never receive an Appwrite API key and never talk to Appwrite directly. They authenticate to the MCP endpoint with a separate, scoped DrawSpace MCP key.

Transport: MCP Streamable HTTP (official `@modelcontextprotocol/sdk`, version 1.32.x), stateless mode with JSON responses. Each POST is handled independently, so the endpoint works behind load balancers and does not require sticky sessions.

## 2. Start the MCP server locally

The MCP endpoint is part of the normal game server. There is no separate process to start.

```bash
npm install
npm run server
```

The server listens on `PORT` (default 3001). The MCP endpoint is then available at:

```
http://localhost:3001/mcp
```

In production it is served from your backend origin, for example `https://server.drawspace.cloud/mcp`. Use HTTPS in production.

## 3. Required environment variables

The MCP server reuses the existing Appwrite configuration:

| Variable | Required | Purpose |
| --- | --- | --- |
| `APPWRITE_ENDPOINT` | yes | Appwrite API endpoint |
| `APPWRITE_PROJECT_ID` | yes | Appwrite project id |
| `APPWRITE_API_KEY` | yes | Server-side Appwrite key. Never sent to MCP clients. |
| `DATABASE_ID` | yes | Appwrite database id (default `drawspace_db`) |
| `DRAWSPACE_MCP_API_KEY` | no | Optional bootstrap MCP key (minimum 16 characters). See below. |
| `DRAWSPACE_MCP_SCOPES` | no | Optional comma-separated scope list for the bootstrap key. Defaults to all scopes. |

`DRAWSPACE_MCP_API_KEY` is a break-glass bootstrap credential. It is independent of `APPWRITE_API_KEY`; never reuse the Appwrite key as the MCP key. Prefer generated, scoped keys (section 4) over the bootstrap key for day-to-day use.

Example `.env.local` additions (placeholders only):

```
DRAWSPACE_MCP_API_KEY=REPLACE_WITH_A_HIGH_ENTROPY_RANDOM_SECRET
DRAWSPACE_MCP_SCOPES=blogs:read,words:read,analytics:read
```

## 4. Generate an MCP API key

Stored keys live in the `mcp_api_keys` Appwrite table. This table is created by the content schema migration (see `docs/CONTENT_SCHEMA_MIGRATION_PROPOSAL.md`). Until that migration is applied, only the optional `DRAWSPACE_MCP_API_KEY` bootstrap key works; the key-management API returns `503 MIGRATION_REQUIRED`.

Keys are generated server-side with a cryptographically secure random generator (`crypto.randomBytes(32)`), prefixed `ds_mcp_`, and stored only as a SHA-256 hash. The plaintext key is returned exactly once, at creation or rotation, and cannot be retrieved afterwards.

Create a key (requires an authenticated `superadmin` or `admin` session):

```bash
curl -X POST https://server.drawspace.cloud/api/v1/admin/mcp/keys \
  -H "Authorization: Bearer YOUR_ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"name":"CI reader","scopes":["blogs:read","words:read","analytics:read"],"expiresInDays":90}'
```

Response (the `key` field is shown only once):

```json
{
  "data": {
    "id": "actual-key-id",
    "name": "CI reader",
    "keyPrefix": "ds_mcp_AbCdEf",
    "scopes": ["blogs:read", "words:read", "analytics:read"],
    "status": "active",
    "createdBy": "admin-user-id",
    "createdAt": "2026-11-14T12:00:00.000Z",
    "expiresAt": "2027-02-12T12:00:00.000Z",
    "lastUsedAt": "",
    "revokedAt": ""
  },
  "key": "ds_mcp_REPLACE_WITH_RETURNED_SECRET",
  "message": "Store this key now. It is shown only once and cannot be retrieved later."
}
```

The admin dashboard MCP page (Phase 10) wraps these same endpoints.

## 5. Assign scopes

Scopes enforce least privilege. Read-only access is separate from write access. Available scopes:

| Scope | Grants |
| --- | --- |
| `blogs:read` | List and read articles, including drafts |
| `blogs:create` | Create articles (draft by default) |
| `blogs:update` | Edit article fields |
| `blogs:publish` | Publish and archive articles |
| `blogs:delete` | Permanently delete articles |
| `words:read` | List and read words |
| `words:create` | Add words and bulk add |
| `words:update` | Edit words |
| `words:delete` | Permanently delete words |
| `words:import` | Import words from JSON/CSV |
| `words:export` | Export words |
| `blogs:import` | Import articles |
| `blogs:export` | Export articles |
| `analytics:read` | Blog stats, word stats, content summary |

A read-only integration should receive only `blogs:read`, `words:read`, and `analytics:read`. A key with no write scopes cannot create, update, publish, delete, or import. Creating an article with a non-draft status additionally requires `blogs:publish`.

## 6. Revoke and rotate keys

Revoke (immediately invalidates the key):

```bash
curl -X POST https://server.drawspace.cloud/api/v1/admin/mcp/keys/KEY_ID/revoke \
  -H "Authorization: Bearer YOUR_ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"confirm":true}'
```

Rotate (creates a replacement key with the same name and scopes, revokes the old one, and returns the new plaintext once):

```bash
curl -X POST https://server.drawspace.cloud/api/v1/admin/mcp/keys/KEY_ID/rotate \
  -H "Authorization: Bearer YOUR_ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"confirm":true}'
```

Both actions require `confirm: true` and are recorded in the audit log. List keys with `GET /api/v1/admin/mcp/keys` (hashes and plaintext are never returned). Review MCP activity with `GET /api/v1/admin/mcp/audit`.

## 7. Connect an MCP-compatible client

An MCP-compatible client must explicitly support the Streamable HTTP transport and must be configured to connect to this server. The user must authorize that connection. DrawSpace does not register itself with any AI product, and no client connects automatically.

The client sends the MCP key on every request:

```
Authorization: Bearer YOUR_DRAWSPACE_MCP_API_KEY
```

The server also accepts the key in an `X-MCP-API-Key` header for clients that cannot set `Authorization`.

Requests are JSON-RPC 2.0 POSTs to `/mcp`. A client normally performs the MCP `initialize` handshake, then `tools/list` and `tools/call`. The endpoint returns `405` for GET and DELETE because it is stateless.

## 8. Example MCP configuration

Placeholders only. Adapt the shape to your specific client; consult that client's documentation for the exact field names it expects.

```json
{
  "mcpServers": {
    "drawspace": {
      "url": "https://server.drawspace.cloud/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_DRAWSPACE_MCP_API_KEY"
      }
    }
  }
}
```

For a local server, replace the URL with `http://localhost:3001/mcp`. Some clients label the transport `streamable-http` or `http`; select the Streamable HTTP option, not the legacy SSE-only option.

## 9. Available MCP tools

All tools return a structured envelope `{ "success": boolean, "message": string, "data": ... }` with real Appwrite ids and values. Failed operations return `success: false` with a `code` and never claim a write succeeded.

| Tool | Scope | Notes |
| --- | --- | --- |
| `drawspace_list_blogs` | `blogs:read` | status, category, search, limit, cursor |
| `drawspace_get_blog` | `blogs:read` | by slug or id |
| `drawspace_create_blog` | `blogs:create` | defaults to draft; non-draft needs `blogs:publish` |
| `drawspace_update_blog` | `blogs:update` | id plus fields |
| `drawspace_publish_blog` | `blogs:publish` | requires `confirm: true` |
| `drawspace_archive_blog` | `blogs:publish` | requires `confirm: true` |
| `drawspace_delete_blog` | `blogs:delete` | requires `confirm: true` |
| `drawspace_list_words` | `words:read` | category, difficulty, language, search, limit, cursor |
| `drawspace_add_word` | `words:create` | word, category, difficulty, language, hint |
| `drawspace_update_word` | `words:update` | id plus fields |
| `drawspace_delete_word` | `words:delete` | requires `confirm: true` |
| `drawspace_bulk_add_words` | `words:create` | array plus duplicate strategy |
| `drawspace_import_words` | `words:import` | JSON/CSV content, strategy, dryRun |
| `drawspace_import_blogs` | `blogs:import` | JSON/CSV content, strategy, dryRun |
| `drawspace_export_words` | `words:export` | format, category, difficulty |
| `drawspace_export_blogs` | `blogs:export` | format, status |
| `drawspace_get_blog_stats` | `analytics:read` | real stored statistics |
| `drawspace_get_word_stats` | `analytics:read` | real stored statistics |
| `drawspace_get_content_summary` | `analytics:read` | combined stats and category counts |

Destructive tools (publish, archive, delete) require an explicit `confirm: true` argument. The import `replace` strategy also requires `confirm: true`. Use `dryRun: true` on import tools to preview without writing.

## 10. Example natural-language commands

Once a client is connected and authorized, prompts such as these map to the tools above:

- "List the published DrawSpace blog articles." -> `drawspace_list_blogs` with `status: published`.
- "Create a draft article titled 'Weekend drawing tips' about warm-up sketches." -> `drawspace_create_blog` (draft).
- "Publish the article with id abc123." -> `drawspace_publish_blog` with `confirm: true` (the client should ask you to confirm).
- "Add the word 'otter' to the Animals category, easy difficulty." -> `drawspace_add_word`.
- "Export the word bank as CSV." -> `drawspace_export_words` with `format: csv`.
- "How many words and articles do we have?" -> `drawspace_get_content_summary`.

The assistant decides which tool to call. Destructive actions still require the confirmation argument, and a well-behaved client should confirm with you before sending it.

## 11. Security limitations

- The MCP key is a bearer secret. Anyone who holds it can use its scopes until it is revoked or expires. Store it in a secret manager, never in source control, and rotate it periodically.
- Stored, scoped keys require the `mcp_api_keys` table. Before the migration is applied, only the env bootstrap key works, and it carries all scopes (or `DRAWSPACE_MCP_SCOPES` if set). Apply the migration to use least-privilege stored keys.
- The bootstrap key is powerful. Remove `DRAWSPACE_MCP_API_KEY` from the environment once scoped keys are in use, or restrict it with `DRAWSPACE_MCP_SCOPES`.
- The endpoint is rate limited (120 requests per minute per instance, in-memory). This is per-process, not a global quota.
- Browser-based MCP clients are subject to the backend CORS allowlist (`FRONTEND_ORIGINS`). Server-to-server clients that send no `Origin` header are allowed. Add a browser origin explicitly if you need one.
- The MCP server can read draft articles (with `blogs:read`). Drafts are never exposed through the public blog API; only authenticated MCP keys and admin sessions can read them.
- Appwrite has no multi-row transactions. Imports report per-record results and are not atomic; see `docs/IMPORT_EXPORT_GUIDE.md`.
- This server does not connect to ChatGPT or any other product automatically. A compatible client must support Streamable HTTP, be pointed at this endpoint, and be authorized by you with a valid key.