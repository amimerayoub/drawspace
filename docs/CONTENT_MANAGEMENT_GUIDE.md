# DrawSpace Content Management Guide

A practical guide for content managers and admins working in the DrawSpace admin console. It covers blog articles, the word bank, import/export, and the MCP server page. All features described here are implemented in this repository and use Appwrite as the only backend.

## Access and roles

Sign in at `/en-US/sign-in` with an account that has an active staff role, then open `/admin`.

| Role | Content access |
| --- | --- |
| `superadmin`, `admin` | Everything, including MCP key management |
| `content_manager` | Word bank and blog management, import/export |
| `moderator`, `analyst`, `support` | No content management |

The MCP server page (`/admin/mcp`) is restricted to `superadmin` and `admin`.

## Blog management (`/admin/blog`)

The blog page lists every article with search, status/category filters, sorting, and pagination.

- Create article: title, slug (auto-generated from the title if left blank), excerpt, content, category, tags, featured cover, SEO title, SEO description, status, and publish date.
- New articles default to draft. A draft is never visible on the public blog.
- Edit article: change any field; the slug stays unique.
- Preview: review the article before publishing.
- Publish: makes the article public. Requires confirmation. A publish date is set automatically if none was provided.
- Schedule: set status to scheduled with a future publish date; the article becomes public at that time.
- Archive: hides the article from the public blog. Requires confirmation.
- Unpublish: returns a published article to draft.
- Delete: permanently removes the article. Requires confirmation.
- Categories and tags: categories are managed automatically as articles use them; tags are free-form labels.
- SEO fields: seoTitle and seoDescription feed the public article metadata.
- Bulk actions: select multiple articles to publish, archive, or delete (each requires confirmation).
- Import / Export: see the import/export section below.

Public blog endpoints (`/api/v1/public/blogs`, `/api/v1/public/blogs/:slug`) return only published, safe fields. Drafts, archived, and future-scheduled articles are never exposed publicly.

## Word bank management (`/admin/words`)

The word bank page lists words with search and category/difficulty/status filters.

- Add word: word, category, difficulty (easy/medium/hard), language label, optional hint, and active toggle.
- Duplicate detection: words are compared case- and accent-insensitively (Unicode-aware). Adding a duplicate is rejected.
- Edit word: change any field; the duplicate guard still applies.
- Delete word: permanent, requires confirmation.
- Categories: create, rename, and delete categories. Deleting a category in use lets you reassign its words to another category.
- Difficulty and languages: filter by difficulty; the language field is metadata. Gameplay words are English.
- Active toggle: inactive words never appear in matches.
- Bulk actions: select words to activate, deactivate, or delete (confirmation required).
- Bulk add: paste one word per line, optionally `word,category,difficulty`, with a duplicate strategy.
- Import / Export: see below.

Note on non-English words: the word bank accepts Unicode (for example Arabic) for content management, but the game's guess matching is ASCII-based. Words that cannot be guessed in the engine are excluded from live matches automatically. This limitation is documented in `IMPORT_EXPORT_GUIDE.md`.

## Import and export

Both the blog and word pages have Import and Export buttons. The full specification, strategies, limits, and recovery steps are in `IMPORT_EXPORT_GUIDE.md`. Ready-to-use sample files are in `examples/content-import/`.

Import flow:

1. Choose a `.json` or `.csv` file (maximum 2 MB; up to 1000 words or 200 articles per file).
2. Pick a strategy: insert only, skip duplicates, update existing (upsert), or replace selected. Replace requires explicit confirmation and never inserts or deletes unrelated records.
3. Preview (dry run) to see exactly what would change without writing anything.
4. Confirm the import. You receive a per-record report (created/updated/skipped/failed) plus warnings.

Imports are not atomic: Appwrite has no multi-row transactions. The per-record report tells you what succeeded; re-running with skip or upsert is safe.

Export flow:

- Words: export all, by category, by difficulty, or selected records, as JSON or CSV.
- Blogs: export all, published only, draft only, or selected records, as JSON or CSV.
- Word categories can be exported separately.
- JSON exports include a format identifier and schema version. CSV exports are UTF-8 with a BOM and protect against formula injection. Exports never include private user ids.

## MCP server page (`/admin/mcp`)

Admin-only page for managing the MCP integration. It shows:

- Server status: transport (Streamable HTTP at `/mcp`), active and revoked key counts, and the number of tools.
- API keys: name, key id prefix, scopes, status, creation date, expiration date, and last-used timestamp.
- Create key: choose a name, optional expiration (days), and scopes. Use the Read-only preset for least privilege. The generated secret is shown exactly once; copy it immediately. Existing plaintext keys are never displayed.
- Revoke and rotate: both require confirmation. Rotation creates a replacement key with the same scopes and revokes the old one.
- Audit history: recent MCP tool operations and key-management events.

The Appwrite API key is never shown anywhere in this page. For client connection instructions and the full tool list, see `MCP_SETUP.md`. For the security model, see `MCP_SECURITY.md`.

If the page reports that the `mcp_api_keys` table is unavailable, apply the content schema migration first (`CONTENT_SCHEMA_MIGRATION_PROPOSAL.md`). Until then, only an optional environment bootstrap key can authenticate to the MCP endpoint.

## Related documents

- `IMPORT_EXPORT_GUIDE.md` - import/export formats, strategies, limits, recovery.
- `DRAWSPACE_API.md` - public and admin REST API reference.
- `MCP_SETUP.md` - run the MCP server, manage keys, connect a client.
- `MCP_SECURITY.md` - security review and residual risks.
- `CONTENT_SYSTEM_TEST_REPORT.md` - test results and verification status.
- `CONTENT_SYSTEM_AUDIT.md` - initial repository audit.