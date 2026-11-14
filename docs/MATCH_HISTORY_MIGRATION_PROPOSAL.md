# Match history TablesDB migration

Status: implementation and migration script are prepared; schema has not been applied. The script refuses `APPWRITE_ENV=production`. The table has backend-only access: row security enabled and no direct client permissions.

## Final model

Table ID: `match_history`; one row per player per completed match. Appwrite row IDs are deterministic SHA-256-derived IDs from `matchId:playerId` (36 characters). The unique compound index is an additional idempotency guard. `playerId` is the verified Appwrite account ID for registered and guest sessions; no email, JWT, auth token, or private profile data is copied.

| Attribute | Type / size | Required | Meaning |
|---|---|---:|---|
| `matchId` | string(64) | yes | Stable match ID (room UUID) |
| `roomId` | string(36) | yes | Room UUID |
| `roomCode` | string(6) | yes | Room code snapshot |
| `roomName` | string(64) | yes | Public room name snapshot |
| `status` | string(16) | yes | `completed` |
| `startedAt`, `completedAt` | string(32) | yes | ISO-8601 timestamps |
| `durationSeconds` | integer | yes | Elapsed match duration |
| `playerId` | string(36) | yes | Account reference; guest accounts included |
| `username` | string(32) | yes | Public display-name snapshot |
| `avatarId` | string(32) | yes | Public avatar ID snapshot |
| `accountType` | string(16) | yes | `guest` or `registered` |
| `score`, `placement` | integer | yes | Server-calculated final values |
| `isWinner` | boolean | yes | Server-calculated winner flag |
| `playerCount` | integer | yes | Player count snapshot |
| `roundsConfigured`, `roundsCompleted` | integer | yes | Configured and completed turn counts |
| `configuration` | string(2048) | yes | Sanitized JSON snapshot: rounds, timing, difficulty, word mode, capacity, visibility |

Indexes:

- Unique `match_player_unique` on (`matchId`, `playerId`) for one row per participant.
- Key `player_completed` on (`playerId`, `completedAt`) for owner history pages.
- Key `match_placement` on (`matchId`, `placement` ASC) for match detail and reconciliation.

Ownership is enforced by the backend. Authenticated history uses the verified identity; public player history resolves a public username to an account and returns a limited public projection. The service API key is the only database access path. Do not grant client table permissions.

## Migration procedure

The migration uses `node-appwrite` TablesDB methods compatible with the installed SDK (`node-appwrite` 31.2.x). It inspects existing columns/indexes and rejects incompatible attributes or a table without row security. It creates only missing schema components and can be safely rerun.

1. Set `APPWRITE_ENV=development` or `staging`, plus `APPWRITE_ENDPOINT`, `APPWRITE_PROJECT_ID`, `APPWRITE_API_KEY`, and optionally `DATABASE_ID`.
2. Run `node server/scripts/migrate-match-history.mjs` for inspection/dry run.
3. After review, run `node server/scripts/migrate-match-history.mjs --apply` and type the exact environment/project confirmation.
4. Validate the resulting table and indexes in the nonproduction project before enabling history in a deployment.

The script refuses production targets and never prints the API key. No migration was executed during this work.
