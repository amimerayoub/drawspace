# DrawSpace full stack rebuild status

## Source and safety

- Verified Phase 1 source: `7ee9aa5400d935824ed9d047d6636243f4585206`.
- Branch: `codex/phase1-backend-rebuild`; this worktree remains based on the Phase 1 commit, with changes uncommitted.
- The backup bundle in the original project worktree passed `git bundle verify`; no history was overwritten.
- Production Appwrite schema was inspected read-only and is captured in `APPWRITE_SCHEMA.md` and `appwrite-schema-inspection.json`.
- No production data, schema, permissions, DNS, deployments, or remotes were modified.

## Progression

- Server computes levels using the original curve: 100 XP for level 2, then a 1.18 growth factor, capped at level 99.
- Match XP is calculated on the backend: 15 XP per correct guess plus 30 XP for the winner.
- Match XP transactions use a SHA-256 idempotency key in the schema’s unique `xp_transactions.transactionId` index.
- Match statistics, achievement evaluation/unlocks, challenge progress/claims, title unlock/equip, and leaderboard reads use existing TablesDB rows.
- Player pages, landing leaderboard/achievement snippets, and game match-end XP feedback read server data.
- Persistent match history is implemented against the approved `match_history` schema specification, but its table must first be created in each nonproduction Appwrite environment using the guarded migration script. Multi-row Appwrite progression updates are not transactional, so a process failure between inserting an XP transaction and updating related counters can leave partial progression bookkeeping.
- Drawing-turn, first-guesser, and day-streak counters are absent from `user_statistics`; the corresponding conditions cannot currently progress accurately.

## Admin and CMS

- Admin routes authorize from the active `admin_roles` row, never a frontend-supplied role.
- Connected features: moderation queue/decisions with audit records, custom-word CRUD, blog post CRUD and public reading, ad CRUD and public placements, supported platform settings, and audit-log reading.
- The Phase 1 settings form’s reset-demo control is disabled in the connected admin.
- Admin role editing, room operations, avatar binary storage, unsupported game/XP rules, CRM, SEO/redirects, and analytics remain unavailable or limited as detailed under Phase 3 below.
- Blog tags, ad device targeting, word definitions/hints/translations, and audit before/after snapshots are not represented in the inspected schema; the UI reports omissions or the feature is disabled.

## Frontend and visual comparison

- Auth, profile, guest session, lobby, create/join, waiting room, multiplayer drawing/guessing, reports, progression, blog, ads, moderation, settings, words, and audit screens use backend APIs or Socket.IO.
- Match results remain available in the game room. The standalone Results route links to the profile's persisted match history and no longer reads local fake match records.
- The original game CSS expects a tabbed `game-side-stack`; the previous server-driven rewrite had removed it. The tabs, player/chat grid, mobile layout, and report modal structure are restored. The source/CSS structure was compared, but no pixel-level screenshot comparison was run.
- Route and admin subpage modules are lazy-loaded. Vite’s largest emitted JavaScript chunk is now 470.60 kB, below the former 500 kB warning threshold.

## Security and remaining limits

- JWT identity is verified server-side; user-scoped routes derive IDs from that identity. Admin access is checked against Appwrite on every protected admin route.
- Browser code contains only public Appwrite configuration; server API keys stay in backend configuration. API validation, CORS allowlists, rate limits, and generic error responses are in place.
- Room state is backed by the selected state store. With `ROOM_STATE_DRIVER=redis`, serialized room snapshots, player presence, TTLs, and engine operations use Redis; Socket.IO broadcasts use the official Redis adapter with dedicated ioredis pub/sub clients. Redis selection requires `REDIS_URL` and startup health checks; errors do not fall back to memory. Passwords are stored as hashes/salts, and auth tokens are not stored in room state.
- Engine transitions are serialized with a short renewable distributed lock, and mutations reload the shared snapshot inside that lock. This prevents duplicate starts, scoring, round claims, and deletion races across engine instances. The current implementation serializes all rooms behind one lock and rewrites a shared snapshot, which is correct for the current scale but limits throughput as room count grows.
- Recovery restores unexpired rooms and deadlines, reconciles player presence against socket presence TTLs, migrates hosts, and sweeps expired/abandoned rounds. Finished rooms are retained for up to 30 days as a retry source for match persistence. Clients allow polling fallback, so deployments using polling must configure load-balancer sticky sessions in addition to the Redis adapter.
- Platform switches are persisted, but Appwrite account registration policy is not automatically changed by this code; production Auth settings still need operational configuration.
- No live Redis service was available locally. Redis state and two-engine tests use a mocked Redis-compatible backend; the real two-node Socket.IO Redis adapter integration test is opt-in via `REDIS_TEST_URL` and restricted to localhost. No Appwrite live integration tests were run.

## Validation

- `npm run typecheck`: passed.
- `npm run build`: passed; largest JavaScript chunk 470.60 kB, no 500 kB warning.
- `npm run server:build`: passed.
- `npm test`: 21 passed, 1 real Redis integration test skipped because `REDIS_TEST_URL` was not set. Coverage includes engine lifecycle, two-engine shared state, duplicate prevention, reconnect/host migration/recovery, mocked Redis adapter behavior, catalog, settings, and repositories.
- `npm run test:redis-integration`: runs the isolated local Redis Socket.IO two-node integration test when `REDIS_TEST_URL` points to a dedicated localhost Redis instance.
- `git diff --check`: passed.

## Phase 3 progress

- Added Appwrite Users SDK integration and protected admin list/detail/profile/status/role endpoints. Profile/status/role changes write audit records; status changes are logged as moderation actions. Self status/role changes and removal of the last active superadmin are rejected server-side. Role assignment remains superadmin-only regardless of client controls.
- The admin Users screen now reads live Appwrite account data, supports search/status filtering, displays account progression/statistics, and edits profile/status/role through the backend. Requires a server Appwrite API key with Users read/update scopes; the browser does not receive that key.
- Catalog APIs and admin screens are connected for avatars, titles, achievements, challenges, and words. They use the existing TablesDB columns, validate updates, audit writes, reject duplicate IDs/words, and block deletion when player data references an item. Avatar binary upload is not supported by a verified Storage bucket.
- Game settings persist and are enforced for room capacity, custom-word rooms, and per-user guess/chat message limits. Round timing/count, scoring/XP, minimum players, drawing rules, and choice timing remain server-defined because the current `platform_settings` schema has no corresponding fields.
- Match history includes a retry-safe Appwrite TablesDB repository, server-owned completion persistence, authenticated and public history/detail APIs, and profile/admin screens. See the finalized schema and guarded migration procedure in [MATCH_HISTORY_MIGRATION_PROPOSAL.md](./MATCH_HISTORY_MIGRATION_PROPOSAL.md). History reads/writes require the table to be created first; this work did not run the migration.
- CRM, SEO/redirect management, and advanced analytics remain pending because existing data tables do not support the screens' requested operations/metrics. The analytics screen remains explicitly unavailable; no metrics are fabricated.
- No new production tables, buckets, permissions, or records were created or changed.
