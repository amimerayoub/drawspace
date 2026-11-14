# DrawSpace MCP Security Review

Phase 11 security review of the content platform additions: advanced blog/word management, JSON/CSV import/export, public content APIs, and the MCP server. This document records what was checked, the evidence, and the residual risks. It is a review of the implementation in this repository, not a penetration test.

## Architecture and trust boundaries

```
MCP client (AI assistant)
   |  Authorization: Bearer ds_mcp_...   (scoped MCP key, never an Appwrite key)
   v
Express backend  /mcp  (Streamable HTTP, stateless)
   |  McpKeyService.authenticate -> scope context
   v
MCP tools (19 explicit operations)
   |  same business rules as the admin API
   v
WordService / BlogService  ->  Appwrite TablesDB (server-side key only)
```

The Appwrite API key lives only in server environment configuration. It is never returned by any endpoint, never sent to an MCP client, and never logged. MCP clients authenticate with a separate DrawSpace MCP key. The public blog/word APIs require no key at all and expose only published, safe fields.

## Requirement-by-requirement review

| Requirement | Status | Evidence |
| --- | --- | --- |
| Server-side admin authorization | PASS | `requireAuth` + `requireAdmin` on all admin routes. MCP key management restricted to `superadmin`/`admin` (`server/src/routes/mcpAdminApiV1.ts`). Verified: unauthenticated 401, content_manager 403 in `mcp.test.ts`. |
| Secure Appwrite API key storage | PASS | Loaded from env by `loadConfig` (`server/src/config/env.ts`); errors name missing variables without echoing values. Never serialized into responses. |
| Hashed MCP keys | PASS | SHA-256 hex stored in `mcp_api_keys.keyHash`; plaintext returned once at create/rotate. `keyService.ts`, asserted in `mcp.test.ts` (stored row has hash, no plaintext; views omit hash). |
| Cryptographically secure key generation | PASS | `crypto.randomBytes(32)` base64url, prefix `ds_mcp_` (`generateMcpKey`). |
| Rate limiting | PASS | `/mcp` 120/min; admin MCP 60/min; import 20/min; export 30/min; `/api/v1` 120/min. In-memory per instance (`middleware/rateLimit`). |
| Request validation | PASS | zod schemas on every admin/MCP input; MCP tool `inputSchema` validated by the SDK before handlers run. |
| Input sanitization | PASS | Service-level validation rejects markup/unsafe text (`validateBlogInput`, `validateWordInput`); slug pattern enforced. |
| CSV formula injection protection | PASS | Export cells beginning `= + - @ tab CR` are prefixed with `'` (`content/csv.ts`); asserted in `importExport.test.ts`. |
| File size restrictions | PASS | `IMPORT_MAX_BYTES` 2 MB (413), 1000 words / 200 blogs per file (400), extensions `.json`/`.csv` only. MCP import content capped at 3,000,000 chars with a 3 MB body parser. |
| Safe JSON parsing | PASS | `JSON.parse` wrapped, mapped to `INVALID_JSON` (`importExport.ts`). |
| Duplicate protection | PASS | Unicode-aware `normalizeWord` dedup; unique `normalizedWord` index in the migration proposal; bulk strategies report duplicates. |
| Audit logs | PASS | Content writes audit to `audit_logs`; MCP operations use actor role `mcp`; key create/revoke/rotate audited. Asserted in `mcp.test.ts`. |
| Scope-based MCP permissions | PASS | 14 scopes; each tool checks its scope before acting; read-only keys cannot write. Asserted in `mcp.test.ts`. |
| No arbitrary database queries through MCP | PASS | Only 19 fixed tools; no generic query/collection tool exists. |
| No arbitrary code execution | PASS | Tools call typed service methods only; no eval, no shell, no dynamic code. |
| No unrestricted filesystem access | PASS | MCP tools never touch the filesystem; imports accept inline content strings, not paths. |
| No private user data in content APIs | PASS | Blog export excludes `authorId` (keeps display name); public endpoints return safe fields only; drafts never public. |
| Explicit confirmation for sensitive operations | PASS | publish/archive/delete require `confirm: true`; import `replace` requires `confirm: true`; admin revoke/rotate require `confirm: true`. |
| All writes share admin business rules | PASS | MCP tools call the same `WordService`/`BlogService` methods used by the admin API. |

## MCP authentication details

- Keys are looked up by SHA-256 hash, so the stored credential is never compared in plaintext and never returned.
- The optional env bootstrap key is compared with `crypto.timingSafeEqual` over fixed-length hashes to avoid timing leaks.
- Revoked (`status: revoked`) and expired (`expiresAt` in the past) keys fail authentication. Both are covered by tests.
- Authentication fails closed: if the `mcp_api_keys` table is unavailable, only the bootstrap key (if configured) works; otherwise every request is rejected with 401.
- `lastUsedAt` is updated best-effort and never blocks or fails authentication.

## Transport hardening

- Streamable HTTP, stateless mode, JSON responses. No session fixation surface; each POST is independent.
- GET and DELETE return 405. The endpoint accepts POST only.
- The backend security headers apply (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Cross-Origin-Resource-Policy`).
- CORS uses the existing `FRONTEND_ORIGINS` allowlist. Server-to-server MCP clients that send no `Origin` are allowed; browser origins must be explicitly allowed.
- The MCP body parser is limited to 3 MB and is separate from the global 256 KB parser.

## Residual risks and limitations

1. Bootstrap key power. `DRAWSPACE_MCP_API_KEY` carries all scopes unless `DRAWSPACE_MCP_SCOPES` restricts it. Remove or restrict it once scoped stored keys are in use.
2. Migration dependency. Stored, least-privilege keys require the `mcp_api_keys` table from the content schema migration. Before it is applied, only the bootstrap key works and key management returns 503 `MIGRATION_REQUIRED`.
3. Bearer secret handling. A leaked MCP key grants its scopes until revoked or expired. Use a secret manager, set expirations, and rotate. Keys are shown once and cannot be recovered.
4. Per-instance rate limits. Limits are in-memory per process, not a global quota; multiple instances multiply the effective limit. Add a shared limiter (for example Redis) if you scale out.
5. Non-atomic imports. Appwrite has no multi-row transactions. Imports report per-record results; a failure mid-file leaves earlier records written. Recovery is documented in `IMPORT_EXPORT_GUIDE.md`.
6. Draft read scope. `blogs:read` intentionally includes drafts for authorized integrations. Drafts remain hidden from the public API. Grant `blogs:read` only to trusted clients.
7. No automatic client trust. The server does not connect to ChatGPT or any product automatically. A compatible client must support Streamable HTTP and be authorized by the user with a valid key.

## Verification

The security properties above are exercised by offline tests in `server/src/mcp/mcp.test.ts`, `server/src/content/importExport.test.ts`, and `server/src/contentApiV1.test.ts`, run with `npm run server:test`. Live read-only probes confirmed the MCP endpoint fails closed without a valid key and that admin MCP routes require authentication. No production content was created during testing. See `CONTENT_SYSTEM_TEST_REPORT.md` for the full PASSED/BLOCKED/SKIPPED breakdown.