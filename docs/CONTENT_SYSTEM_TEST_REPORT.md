# DrawSpace Content System Test Report

Phase 12 test report for the content platform: blog management, word bank, JSON/CSV import/export, public content APIs, and the MCP server. Results are reported honestly as PASSED, FAILED, BLOCKED, or SKIPPED. No integration test was faked, and no production content was created during testing.

## How to run

```bash
npm run server:test     # full backend suite (node:test via tsx)
npm run server:typecheck
npm run typecheck       # frontend
```

## Summary

| Metric | Count |
| --- | --- |
| Total tests | 73 |
| PASSED | 69 |
| FAILED | 0 |
| SKIPPED (integration, environment-gated) | 4 |
| BLOCKED (manual/production, see below) | reported separately |

Both typechecks pass with no errors. The frontend MCP admin page compiles under Vite and the `/admin/mcp` route renders without runtime error (verified in a browser; it shows the staff sign-in gate because no admin session is available).

## Blog (Phase 12)

| Required case | Covering test | Result |
| --- | --- | --- |
| Create blog | blog service creates drafts with generated slug, category and audit | PASSED |
| Update blog | blog service updates fields and keeps slug unique | PASSED |
| Publish blog | blog service publish, archive, unpublish and delete lifecycle | PASSED |
| Archive blog | blog service publish, archive, unpublish and delete lifecycle | PASSED |
| Delete blog | blog service publish, archive, unpublish and delete lifecycle | PASSED |
| Public listing | public listing and detail never expose unpublished content; blog listing supports search, category, tag filters and pagination | PASSED |
| Public detail | public listing and detail never expose unpublished content | PASSED |
| Draft privacy | public visibility hides drafts, archived and future scheduled posts; content API v1 enforces auth, confirmations, draft privacy | PASSED |
| Pagination | blog listing supports search, category, tag filters and pagination | PASSED |
| Search | blog listing supports search, category, tag filters and pagination | PASSED |

## Word bank (Phase 12)

| Required case | Covering test | Result |
| --- | --- | --- |
| Add word | word service creates words, detects normalized duplicates and audits | PASSED |
| Duplicate detection | word service creates words, detects normalized duplicates; normalizeWord matches the game engine guess normalization | PASSED |
| Update word | word service updates and deletes with duplicate guard | PASSED |
| Delete word | word service updates and deletes with duplicate guard | PASSED |
| Category filters | word service lists with search, filters, sorting and cursor pagination | PASSED |
| Difficulty filters | word service lists with search, filters, sorting and cursor pagination | PASSED |
| Bulk insertion | word service bulk create supports insert, skip and upsert strategies | PASSED |

## Import/export (Phase 12)

| Required case | Covering test | Result |
| --- | --- | --- |
| Valid JSON | word JSON parsing validates envelope, version and structure; content API v1 import and export | PASSED |
| Invalid JSON | content API v1 import and export enforce limits (INVALID_JSON) | PASSED |
| Valid CSV | word CSV parsing maps columns; parseCsv handles quoted commas, quotes and embedded newlines | PASSED |
| Invalid CSV | parseCsv rejects unterminated quotes; parseCsvTable rejects malformed structure; INVALID_CSV in API test | PASSED |
| Arabic Unicode | unicode words and hints survive import, storage and CSV export round trips; serializeCsv preserves Arabic and French unicode | PASSED |
| French Unicode | serializeCsv preserves Arabic and French unicode round-trip; blog exports preserve unicode | PASSED |
| Duplicate records | word import dry run reports without writing; blog import previews, upserts, gates replace | PASSED |
| Large files | import limits reject oversized files and too many records | PASSED |
| Partial failures | word import dry run reports without writing and replace requires confirmation; blog import per-record results | PASSED |
| Export escaping | serializeCsv escapes commas, quotes, newlines and leading spaces; blog exports preserve quoting | PASSED |
| CSV formula injection | serializeCsv protects against CSV formula injection by default; formula injection is neutralized in word CSV exports | PASSED |

## MCP (Phase 12)

| Required case | Covering test | Result |
| --- | --- | --- |
| Authentication | MCP HTTP endpoint authenticates; MCP key service authenticate (env + table) | PASSED |
| Invalid API key | MCP HTTP endpoint (401 MCP_INVALID_KEY); key service authenticate wrong key returns null | PASSED |
| Revoked key | MCP key service revokes; HTTP revoked key returns 401 | PASSED |
| Expired key | MCP key service expired key returns null | PASSED |
| Insufficient scope | MCP tools enforce scopes (read-only FORBIDDEN) | PASSED |
| Blog listing | MCP tools drawspace_list_blogs and drawspace_get_blog | PASSED |
| Blog creation | MCP tools drawspace_create_blog defaults to draft | PASSED |
| Word creation | MCP tools drawspace_add_word | PASSED |
| Word export | MCP tools drawspace_export_words | PASSED |
| Unauthorized deletion | MCP tools delete without confirm (CONFIRM_REQUIRED) and read-only delete (FORBIDDEN) | PASSED |
| Audit logging | MCP tools blog.create audited with role mcp; admin audit shows mcp_key.create | PASSED |

The MCP tests drive a real MCP client/server handshake over the SDK in-memory transport, plus real HTTP requests against the Express app for authentication and the admin key API. Tool logic runs against the actual `WordService`/`BlogService` backed by an isolated in-memory database double.

## Existing project tests

All existing backend tests were run as part of `npm run server:test` (game engine, auth middleware, authorization, repositories, socket state, HTTP e2e, configuration). All pass except the four environment-gated integration tests below.

## SKIPPED (environment-gated integration tests)

These tests skip themselves unless dedicated, isolated credentials are provided. They are not failures and were not run against production.

| Test | Reason skipped |
| --- | --- |
| Appwrite test target inspection and prefixed profile CRUD/ownership | Requires test-only `APPWRITE_TEST_*` for an authorized demo project. The configured Appwrite target is the live project; running write integration tests there is not authorized. |
| Appwrite match-history persistence is idempotent, paginated, and owner-scoped | Same as above. |
| Two Socket.IO nodes broadcast across nodes (isolated local Redis) | Requires `REDIS_TEST_URL` pointing at an isolated localhost Redis instance, which is not configured. |
| Real Redis state store, locks, presence, TTL, engine concurrency, reconnect | Requires `REDIS_TEST_URL`, not configured. |

## BLOCKED (manual / production verification)

| Item | Why blocked | What was done instead |
| --- | --- | --- |
| Interactive admin UI flows (blog/word/MCP pages) | No admin credentials are available, and creating content in production during testing is not authorized. | Frontend typecheck, Vite compilation, browser route smoke test (sign-in gate renders), and offline HTTP tests covering the exact admin APIs the pages call. |
| Live authenticated MCP tool calls against real Appwrite | Requires the `mcp_api_keys` migration to be applied and a real key, plus authorization for production writes. | Full offline MCP handshake/tool/scope/confirmation tests; live read-only probes confirming the endpoint fails closed (401) without a valid key. |
| Live key creation/rotation in production | Production write, not authorized. | Offline admin key API tests (create shown-once, list excludes secrets, revoke/rotate confirmations, audit). |

## Live read-only probes (no writes)

Performed against the local backend connected to the configured Appwrite project:

- `GET /api/v1/public/blogs?limit=1` -> 200 (published article returned).
- `POST /mcp` without a key -> 401 `MCP_UNAUTHORIZED`.
- `POST /mcp` with an invalid key -> 401 `MCP_INVALID_KEY`.
- `GET /mcp` -> 401 (auth precedes method handling).
- `GET /api/v1/admin/mcp/status` without auth -> 401 `AUTH_REQUIRED`.

These confirm the MCP endpoint is mounted and fails closed pre-migration with no bootstrap key configured.

## Honesty statement

No integration test result was fabricated. The four skipped tests require isolated environments that are not configured, and production write tests were not authorized. Admin interactive verification is blocked by the absence of credentials; it is reported as BLOCKED, not PASSED.