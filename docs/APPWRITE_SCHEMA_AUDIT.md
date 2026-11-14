# Appwrite schema audit — Phase 8

## Scope and verification status

The supplied target is Appwrite endpoint `https://fra.cloud.appwrite.io/v1`, project `your_appwrite_project_id`, database `drawspace_db`. No `APPWRITE_*` credential variables or `.env.local` are configured in this worktree, and no Appwrite connector is available. Therefore this phase could not authenticate to, or freshly inspect, that target. **No Appwrite calls or schema/data changes were made.**

The repository contains an earlier read-only TablesDB snapshot, [appwrite-schema-inspection.json](./appwrite-schema-inspection.json), dated 2026-11-13 15:16 UTC. It reports `drawspace_db`, 24 tables, columns, indexes, row-security flags, and permissions. The snapshot does not identify its Appwrite project ID, so its association with the project specified for Phase 8 cannot be independently verified. The inventory below is historical evidence, not a fresh Phase 8 live audit.

## Historical table inventory

The snapshot contains: `profiles`, `avatars`, `user_preferences`, `user_statistics`, `guest_sessions`, `guest_migration_records`, `player_progression`, `xp_transactions`, `achievements`, `user_achievements`, `titles`, `user_titles`, `challenges`, `user_challenges`, `leaderboard_snapshots`, `admin_roles`, `audit_logs`, `blog_posts`, `blog_categories`, `advertisements`, `moderation_reports`, `moderation_actions`, `platform_settings`, and `custom_words`.

Column definitions and index details are preserved in the JSON snapshot. The backend repositories use these existing IDs and fields. Notable historical indexes include unique IDs/user IDs on profiles and progression rows, unique `xp_transactions.transactionId`, and the existing compound indexes for player challenges and leaderboard lookup.

## Known gaps and access observations from that snapshot

- `match_history` is absent. The per-player record model and non-destructive migration plan are in [MATCH_HISTORY_MIGRATION_PROPOSAL.md](./MATCH_HISTORY_MIGRATION_PROPOSAL.md).
- Existing `user_statistics` has no match idempotency field; progression idempotency uses the unique XP transaction ID instead.
- `guest_sessions` historically had row security disabled and direct `read(any)`, `create(any)`, and `update(any)` permissions. Backend routes still derive the guest identity from verified Appwrite JWTs. This audit did not change those permissions.
- Several progression/catalog tables historically allowed public reads and did not enable row security. Backend API projections and user filters are relied on for user-scoped responses. This audit did not alter permissions.
- The `profiles` table historically had row security enabled, unique `userId` and `normalizedUsername` indexes, and fields matching the profile repository.

## Migration plan (not applied)

1. Obtain a test-only API key through a local secret manager/environment variable; never place it in this repository or chat.
2. Re-run the read-only inventory against the specified project and compare the live table, columns, indexes, row security, and permissions with the historical snapshot and repository contracts.
3. If `match_history` is absent, review the proposed table, 19 attributes, three indexes, and backend-only access in [MATCH_HISTORY_MIGRATION_PROPOSAL.md](./MATCH_HISTORY_MIGRATION_PROPOSAL.md).
4. Before any schema creation, obtain explicit confirmation for the exact target project and migration operation. The migration script refuses `APPWRITE_ENV=production`, defaults to dry-run, checks compatibility and permissions, and requires a typed confirmation to apply.
5. Apply only the additive `match_history` table and indexes in the agreed nonproduction target. Do not modify existing tables, permissions, or demo rows.
6. Run the prefixed Appwrite integration tests and confirm their run-owned rows are deleted; keep unrelated demo records untouched.

## Phase 8 outcome

Live table/schema inspection, migration, Appwrite authentication, CRUD, permissions, match-history persistence, and owner/public/admin API checks are **BLOCKED** pending a locally configured test-only API key and fresh confirmation of the inspected project identity. No test records were created or cleaned up because no Appwrite request was made.
