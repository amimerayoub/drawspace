# Live Appwrite TablesDB schema

Inspected read-only from the configured Appwrite project on 2026-11-13. The complete machine-readable snapshot, including each table's attributes, indexes, row security, and permissions, is [appwrite-schema-inspection.json](./appwrite-schema-inspection.json). No rows were read, and no schema or permission operations were issued.

Database ID: `drawspace_db`. The database contains 24 tables. Repository code uses the existing table IDs and column names from this inspection.

## Important compatibility and access notes

- `profiles` has unique indexes on `userId` and `normalizedUsername`; its public API DTO excludes raw Appwrite metadata and exposes only profile fields.
- `user_preferences` stores notification and privacy settings as strings, so repository code serializes and parses JSON.
- `user_statistics` has counters and timestamps but no match ID or idempotency key.
- `guest_sessions` currently grants `read("any")`, `create("any")`, and `update("any")`. The backend does not expose unrestricted table operations; guest endpoints derive the user ID from verified Appwrite JWTs.
- Several progression tables have public read permissions and lack row security. Protected endpoints must filter by the verified user ID before returning user records.
- No match-history table exists in the inspected schema. The game engine can compute and return match results, but durable match archives and robust cross-restart result idempotency require a separately approved schema migration.
- No migration or production write was run as part of schema inspection.
