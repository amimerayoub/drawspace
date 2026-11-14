# Match History Migration Review

Status: **review only; no migration or schema change was run**.

## Proposed table

Table ID: `match_history`; display name: `Match history`; row security enabled; no table-level client permissions. The backend Appwrite service key is the only writer/reader. One row represents one player in one completed match; row IDs are deterministic SHA-256-derived identifiers for `matchId:playerId`.

| Column | Appwrite type | Required | Constraints / meaning |
| --- | --- | --- | --- |
| `matchId` | string(64) | yes | Stable match identifier |
| `roomId` | string(36) | yes | Room UUID |
| `roomCode` | string(6) | yes | Public room-code snapshot |
| `roomName` | string(64) | yes | Public room-name snapshot |
| `status` | string(16) | yes | `completed` |
| `startedAt` | string(32) | yes | ISO-8601 start time |
| `completedAt` | string(32) | yes | ISO-8601 completion time |
| `durationSeconds` | integer | yes | 0–86400 |
| `playerId` | string(36) | yes | Appwrite account ID (registered or guest); internal, never returned by public projections |
| `username` | string(32) | yes | Public display-name snapshot |
| `avatarId` | string(32) | yes | Public avatar identifier snapshot |
| `accountType` | string(16) | yes | `guest` or `registered` |
| `score` | integer | yes | Server-calculated final score, 0–2147483647 |
| `placement` | integer | yes | Server-calculated place, 1–32 |
| `isWinner` | boolean | yes | Server-calculated winner flag |
| `playerCount` | integer | yes | 1–32 |
| `roundsConfigured` | integer | yes | 1–10 |
| `roundsCompleted` | integer | yes | 0–320 |
| `configuration` | string(2048) | yes | Sanitized JSON configuration snapshot |

Required indexes:

- `match_player_unique`: unique (`matchId`, `playerId`) for per-player idempotency.
- `player_completed`: key (`playerId` ASC, `completedAt` DESC) for owner history ordering.
- `match_placement`: key (`matchId` ASC, `placement` ASC) for match detail ordering.

No email, JWT, password, private profile data, or client-provided result is in the proposed row. API ownership uses the verified identity; public serializers omit account IDs and return only public snapshots. Admin routes additionally resolve an active admin role.

## Compatibility with current schema

The proposal and migration script target the existing `drawspace_db` TablesDB database and do not alter existing table IDs or attributes. The saved schema audit is the repository's snapshot of existing tables. The prior Appwrite integration run reported the match-history-specific test as skipped because `match_history` was absent. This review did not make another live schema call, so the absence is based on that integration result; check the target again with the script's dry run immediately before any future application.

The backend uses `node-appwrite` 31.2.x `TablesDB` APIs (`getTable`, `listColumns`, `listIndexes`, `createTable`, `create*Column`, `createIndex`). Existing columns are checked for type, required status and adequate bounds. The script refuses an existing table unless row security is enabled and direct permissions are empty. It rejects same-name incompatible indexes. It creates only missing components, so a partial apply can be re-run.

## Risks and review findings

- **Existing records:** creating the new table is additive and does not touch demo rows in other tables. Adding the unique compound index can fail if the table was independently populated with duplicate `(matchId, playerId)` pairs; the script stops on failure and does not delete those rows.
- **Partial schema:** Appwrite operations are asynchronous and not one transaction. A network/API failure can leave a partially created table or columns/indexes. Re-run dry run to inspect, then rerun only after reviewing the exact plan.
- **Required fields:** every application column is required. This is safe for an empty new table; do not retrofit these required columns into a non-empty pre-existing table without an explicit backfill/compatibility plan. The current script does not backfill records.
- **Existing-table scope:** script preserves extra existing columns and indexes. It will not remove them; inspect unexpected structures and permissions manually before approving use.
- **Permission model:** row security and no direct table permissions intentionally prevent browser access. Verify service-key scopes are least privilege and backend routes remain the only access path.
- **Retry semantics:** deterministic row ID plus duplicate lookup makes repeated appends idempotent when the existing row has the same match/player identity. A lookup failure remains an error for the async persistence retry worker. Unique index is a second guard. Persistence runs outside the immediate game transition and retries; there is no durable external queue if Redis/Appwrite and the backend remain unavailable beyond the room retention/retry window.

## Backup and rollback

Before applying in a non-production environment, export the target database schema and any existing rows; record the project/database/table IDs and timestamp. Preserve the export outside the repository and verify it is readable. This new table is additive, so preferred rollback is to disable match-history reads/writes in the backend while retaining the table and records. If removal is later required, first export the table, confirm it contains only the intended test/development data, obtain explicit approval, and delete only `match_history` through a separately reviewed operation. Do not drop the database or other tables. No rollback operation is included or executed by the migration script.

## Exact future commands (not run)

Use an ignored local env file such as `.env.migration.local` with `APPWRITE_ENV`, `APPWRITE_ENDPOINT`, `APPWRITE_PROJECT_ID`, `APPWRITE_API_KEY`, and `DATABASE_ID`; do not put credentials in source control or shell history. Select only a development/staging target and verify the project/database in the dry-run output. `APPWRITE_ENV=production` is refused by the script.

PowerShell:

```powershell
node --env-file=.env.migration.local server/scripts/migrate-match-history.mjs --dry-run
node --env-file=.env.migration.local server/scripts/migrate-match-history.mjs --apply
```

The second command prompts for the exact text `CREATE match_history IN <APPWRITE_ENV> PROJECT <APPWRITE_PROJECT_ID>`. Apply only after reviewing the dry-run plan and receiving explicit approval for the structural migration. This review did not run either command.

## Security review

| Area | Finding | Severity |
| --- | --- | --- |
| Authentication | Protected API routes require a Bearer token and call the configured JWT verifier; invalid/expired tokens return 401. The E2E suite uses the existing verifier dependency injection with fixed test tokens. | Good; low residual risk |
| Ownership | `/matches/me` derives the account ID from verified request identity; profile patch targets that same identity. Public username/match serializers omit `playerId`. | Good; low residual risk |
| Admin access | `/matches/admin` requires authentication and an active `admin` or `superadmin` role; missing role returns 403. | Good; low residual risk |
| Validation | Profile patch, pagination, username, match IDs, and socket room payloads have strict Zod validation and bounded lengths. | Good; low residual risk |
| Rate limiting | HTTP routes have global and route-specific process-local limits. These limits do not coordinate across multiple backend instances, so distributed deployments can exceed the intended per-client aggregate rate. | **Medium** |
| Rate-limit identity | Limiter keys `request.ip`; production trusts one proxy hop. Confirm deployment proxy topology prevents client IP spoofing or accidental shared-IP amplification. | **Medium** |
| Match public endpoints | Public history/details expose username/avatar/score/placement/room name and timestamps, but not account ID or private profile fields. Username lookup is case-normalized by the repository. | Good; low residual risk |
| Public profile lookup | The prior endpoint serialized internal account ID, normalized username, account type, and timestamps. It now returns only username, display name, bio, and avatar ID; the E2E test checks that account ID and normalized username are absent. | **Resolved in this change** |
| Guest lifecycle | Guest APIs require verified guest identity; guest session profile values are validated and rate limited. | Good; low residual risk |
| Secrets/errors | Environment validation names missing variables without values; request errors log only error class and return generic internal errors. Redis startup does not print URLs. | Good; low residual risk |
| E2E scope | HTTP/Socket E2E uses local in-memory data and test identities; it does not verify real Appwrite JWT/key permissions, production proxy behavior, or Redis multi-instance broadcast. | Coverage limitation |

No production Appwrite data, schema, or permissions were changed in this review.
