# DrawSpace content API (v1)

Reference for the DrawSpace content API: public blog and word retrieval, staff content management, and import/export. The API lives in the existing Express game server (`server/src/routes/contentApiV1.ts`) and uses the existing Appwrite-backed authentication and authorization. Appwrite API keys never leave the server.

Base URL (local development): `http://localhost:3001`

## Conventions

### Authentication

- Public endpoints (`/api/v1/blogs`, `/api/v1/blogs/:slug`, `/api/v1/public/blogs`, `/api/v1/public/blogs/:slug`, `/api/v1/words`, `/api/v1/words/categories`) require no authentication.
- Admin endpoints (`/api/v1/admin/**`) require `Authorization: Bearer <Appwrite JWT>` for a user whose `admin_roles` row is active with role `superadmin`, `admin`, or `content_manager`. Authorization is checked server-side against the database on every request.
- Missing or invalid session: `401`. Authenticated non-staff: `403`.

### Response envelopes

Admin and internal endpoints:

```json
{ "data": { }, "error": null, "code": null }
```

Errors use `{ "error": "Human readable message", "code": "MACHINE_CODE" }` with the matching HTTP status.

Public blog endpoints (phase 8 contract):

```json
{ "success": true, "data": [ ], "pagination": { "limit": 10, "total": 1, "nextCursor": null } }
```

### Pagination

Cursor based. `limit` is an integer 1..100 (default 25). Responses include `pagination.nextCursor`; pass it back as `?cursor=` to fetch the next page. `nextCursor: null` means the end. Cursors are opaque base64url offsets; an invalid cursor returns `400 INVALID_CURSOR`.

### Rate limits (per server instance, in memory)

| Surface | Limit |
| --- | --- |
| `/api` global | 240 requests / minute |
| `/api/v1` | 120 requests / minute |
| `/api/v1/admin/import/*` | 20 requests / minute |
| `/api/v1/admin/export/*` | 30 requests / minute |

Exceeding a limit returns `429`.

### Confirmation gates

Destructive or visibility-changing operations require an explicit body confirmation: `DELETE` (words, blogs, categories), `publish`, `archive`, `unpublish`, bulk activate/deactivate/delete, and the `replace` import strategy. Without `{ "confirm": true }` the server answers `400 CONFIRM_REQUIRED` (or `400 VALIDATION_ERROR` for schema mismatches). Nothing is deleted or published silently.

---

## Public blog API

### GET /api/v1/public/blogs

Published posts only (including scheduled posts whose publish date has passed). Drafts and archived posts are never returned.

Query parameters: `limit`, `cursor`, `search`, `category`, `tag`, `sort` (`title|publishedAt|createdAt|updatedAt|views`), `order` (`asc|desc`).

```bash
curl "http://localhost:3001/api/v1/public/blogs?limit=10"
```

Real response from the demo project:

```json
{
  "success": true,
  "data": [
    {
      "id": "post-1",
      "slug": "welcome-to-drawspace-2",
      "title": "Welcome to DrawSpace 2.0",
      "excerpt": "Experience real-time multiplayer drawing and word guessing with our next-generation engine.",
      "content": "DrawSpace 2.0 brings lightning-fast drawing synchronization, competitive progression, and social lobbies...",
      "category": "News & Updates",
      "tags": [],
      "status": "published",
      "cover": "/assets/achievements/winner.png",
      "author": "DrawSpace Team",
      "seoTitle": "",
      "seoDescription": "",
      "publishedAt": "2026-11-01T12:00:00Z",
      "createdAt": "2026-11-01T10:00:00Z",
      "updatedAt": "2026-11-01T12:00:00Z",
      "views": 1422
    }
  ],
  "pagination": { "limit": 1, "total": 1, "nextCursor": null }
}
```

Safe fields only: no author user ids, no internal category ids, no draft content.

### GET /api/v1/public/blogs/:slug

Single published post by slug. Increments the view counter. Unknown or unpublished slug: `404 POST_NOT_FOUND` (drafts are indistinguishable from missing posts).

```json
{ "success": true, "data": { "id": "post-1", "slug": "welcome-to-drawspace-2", "title": "Welcome to DrawSpace 2.0" } }
```

### GET /api/v1/blogs and GET /api/v1/blogs/:slug

Same published-only data with the internal envelope. The detail route also returns `related`: up to 3 published posts scored by shared category and tags.

```json
{ "data": { "id": "post-1", "slug": "welcome-to-drawspace-2" }, "related": [] }
```

---

## Public word API

### GET /api/v1/words

Active words only, for game clients and public integrations. Hints are never included.

Query: `limit`, `cursor`, `search`, `category`, `difficulty` (`easy|medium|hard`), `language`, `sort`, `order`.

```json
{
  "data": [ { "id": "w-1", "word": "Otter", "category": "Animals", "difficulty": "easy", "language": "en" } ],
  "pagination": { "limit": 25, "total": 1, "nextCursor": null }
}
```

### GET /api/v1/words/categories

Categories derived from active words (plus stored categories once the content migration is applied).

```json
{ "data": [ { "id": "animals", "name": "Animals", "slug": "animals", "wordCount": 12 } ] }
```

---

## Admin blog API

All routes below require a staff session.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/admin/blogs` | List all posts. Filters: `status`, `category`, `tag`, `search`, `sort`, `order`, `limit`, `cursor` |
| GET | `/api/v1/admin/blogs/stats` | Totals per status, total views, most viewed, recent |
| GET | `/api/v1/admin/blogs/categories` | Blog categories with post counts |
| GET | `/api/v1/admin/blogs/:id` | One post including drafts |
| POST | `/api/v1/admin/blogs` | Create. Defaults to `draft`. `201` on success |
| PATCH | `/api/v1/admin/blogs/:id` | Partial update |
| DELETE | `/api/v1/admin/blogs/:id` | Delete. Body `{ "confirm": true }` |
| POST | `/api/v1/admin/blogs/:id/publish` | Publish now or at `publishAt`. Body `{ "confirm": true, "publishAt"? }` |
| POST | `/api/v1/admin/blogs/:id/archive` | Archive. Body `{ "confirm": true }` |
| POST | `/api/v1/admin/blogs/:id/unpublish` | Back to draft. Body `{ "confirm": true }` |

Create example:

```bash
curl -X POST http://localhost:3001/api/v1/admin/blogs \
  -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d '{"title":"Guess faster","content":"First paragraph.\n\nSecond paragraph.","category":"Tips & Guides","tags":["tips"]}'
```

```json
{
  "data": {
    "id": "8f1c2d3e4a5b6c7d8e9f0a1b2c3d4e5f",
    "slug": "guess-faster",
    "title": "Guess faster",
    "excerpt": "",
    "content": "First paragraph.\n\nSecond paragraph.",
    "category": "Tips & Guides",
    "tags": ["tips"],
    "status": "draft",
    "cover": "",
    "author": "ContentAdmin",
    "seoTitle": "",
    "seoDescription": "",
    "publishedAt": "",
    "createdAt": "2026-11-14T09:00:00.000Z",
    "updatedAt": "2026-11-14T09:00:00.000Z",
    "views": 0
  }
}
```

Validation: title 1..255, slug pattern `^[a-z0-9]+(?:-[a-z0-9]+)*$` max 64 (auto-generated from the title when omitted), excerpt max 500, content 1..10000, category max 64, at most 10 tags of 32 characters, `scheduled` requires `publishAt`. Duplicate slug: `409 SLUG_DUPLICATE`. Markup and control characters are rejected with `400 VALIDATION_ERROR`.

Stats example:

```json
{ "data": { "total": 4, "published": 1, "draft": 2, "scheduled": 1, "archived": 0, "totalViews": 1422, "mostViewed": [], "recent": [] } }
```

---

## Admin word API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/admin/words` | List with `search`, `category`, `difficulty`, `language`, `active`, `sort`, `order`, `limit`, `cursor` |
| GET | `/api/v1/admin/words/stats` | Totals, active/inactive, per category/difficulty/language |
| GET | `/api/v1/admin/words/:id` | One word including hint |
| POST | `/api/v1/admin/words` | Create. `201`. Duplicate: `409 WORD_DUPLICATE` |
| PATCH | `/api/v1/admin/words/:id` | Partial update |
| DELETE | `/api/v1/admin/words/:id` | Body `{ "confirm": true }` |
| POST | `/api/v1/admin/words/bulk` | Up to 500 words. Body `{ "words": [...], "strategy": "insert|skip|upsert" }` |
| POST | `/api/v1/admin/words/bulk-active` | Body `{ "ids": [...], "active": true, "confirm": true }` |
| POST | `/api/v1/admin/words/bulk-delete` | Body `{ "ids": [...], "confirm": true }` |
| GET | `/api/v1/admin/words/categories` | Categories with word counts |
| POST | `/api/v1/admin/words/categories` | Body `{ "name": "Technology" }`. Requires the content migration (`409 MIGRATION_REQUIRED` before it) |
| PATCH | `/api/v1/admin/words/categories/:id` | Rename, moves member words |
| DELETE | `/api/v1/admin/words/categories/:id` | Body `{ "confirm": true, "reassignTo"? }`. In-use category without `reassignTo`: `409 CATEGORY_IN_USE` |

Create example:

```bash
curl -X POST http://localhost:3001/api/v1/admin/words \
  -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d '{"word":"Otter","category":"Animals","difficulty":"easy","hint":"River swimmer"}'
```

```json
{ "data": { "id": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6", "word": "Otter", "category": "Animals", "difficulty": "easy", "language": "en", "hint": "River swimmer", "active": true, "createdAt": "2026-11-14T09:00:00.000Z", "updatedAt": "2026-11-14T09:00:00.000Z" } }
```

Duplicate detection is normalization based: lowercase, accents stripped, punctuation removed, Unicode letters kept. `OTTER`, `otter`, and `Otter` collide.

Bulk response:

```json
{ "data": { "results": [ { "index": 0, "word": "Cat", "status": "created", "id": "..." }, { "index": 1, "word": "cat", "status": "skipped", "id": "..." } ], "created": 1, "updated": 0, "skipped": 1, "failed": 0 } }
```

---

## Import and export API

Full behavior, strategies, limits, and recovery: `docs/IMPORT_EXPORT_GUIDE.md`. Example files: `examples/content-import/`.

### POST /api/v1/admin/import/words and /api/v1/admin/import/blogs

Body:

```json
{
  "content": "{\"format\":\"drawspace-words\",\"version\":1,\"words\":[{\"word\":\"Cat\",\"category\":\"Animals\",\"difficulty\":\"easy\"}]}",
  "filename": "words.json",
  "format": "auto",
  "strategy": "skip",
  "dryRun": true,
  "confirm": false
}
```

`content` is the raw file text (max 2 MB). `format` is `auto`, `json`, or `csv`. `dryRun: true` previews without writing. `strategy: "replace"` requires `confirm: true` when applying.

Response:

```json
{
  "data": {
    "results": [ { "index": 0, "word": "Cat", "status": "created" } ],
    "created": 1, "updated": 0, "skipped": 0, "failed": 0,
    "dryRun": true,
    "warnings": [],
    "format": "json"
  }
}
```

Blog results carry `title` and `slug` instead of `word`. Limits: 1000 words / 200 blogs per file (`400 IMPORT_LIMIT`), 2 MB (`413 FILE_TOO_LARGE`), `.json` / `.csv` only (`400 UNSUPPORTED_EXTENSION`).

### GET /api/v1/admin/export/words

Query: `format=json|csv`, `category`, `difficulty`, `language`, `active`, `ids` (comma separated, switches to selected scope). Returns a file attachment, e.g. `Content-Disposition: attachment; filename="drawspace-words-2026-11-14.json"`. JSON includes `format`, `version`, `exportedAt`, `scope`, `filters`, `counts`, `words`, `categories`. CSV is UTF-8 with BOM and formula-injection protection.

### GET /api/v1/admin/export/blogs

Query: `format`, `scope=all|published|draft|selected`, `category`, `tag`, `ids` (required for `selected`). Filename pattern `drawspace-blogs-YYYY-MM-DD.json|csv`.

### GET /api/v1/admin/export/categories

Query: `format`. Word categories with counts, filename `drawspace-word-categories-YYYY-MM-DD.json|csv`.

---

## Error codes

| Code | HTTP | Meaning |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | Schema or field validation failed |
| `INVALID_CURSOR` | 400 | Malformed pagination cursor |
| `CONFIRM_REQUIRED` | 400 | Destructive/replace operation without `confirm: true` |
| `INVALID_JSON` / `INVALID_CSV` / `INVALID_STRUCTURE` | 400 | Import file cannot be parsed |
| `UNSUPPORTED_FORMAT` / `UNSUPPORTED_VERSION` / `UNSUPPORTED_EXTENSION` | 400 | Wrong envelope identifier, schema version, or file extension |
| `EMPTY_IMPORT` / `IMPORT_LIMIT` | 400 | No records / too many records |
| `FILE_TOO_LARGE` | 413 | Import exceeds 2 MB |
| `WORD_DUPLICATE` / `SLUG_DUPLICATE` / `POST_DUPLICATE` / `CATEGORY_DUPLICATE` | 409 | Unique identifier already exists |
| `CATEGORY_IN_USE` | 409 | Category delete without reassignment |
| `MIGRATION_REQUIRED` | 409 | Feature needs the content schema migration |
| `WORD_NOT_FOUND` / `POST_NOT_FOUND` / `CATEGORY_NOT_FOUND` | 404 | Unknown id or slug (drafts included for public routes) |
| `AUTH_REQUIRED` | 401 | Missing or invalid session |
| `FORBIDDEN` | 403 | Authenticated but not staff |
| `RATE_LIMITED` | 429 | Too many requests |

## Security notes

- Appwrite credentials stay server-side; responses never contain API keys or author user ids.
- Every write goes through the same service layer as the admin dashboard (`WordService`, `BlogService`), including validation, duplicate protection, and audit logging.
- Public routes filter to published content before serialization; draft privacy is enforced in the service, not in the UI.
- A separate MCP server with scoped, hashed API keys exposes these same services to AI clients; it is documented in `docs/MCP_SETUP.md` and `docs/MCP_SECURITY.md`. Public blog retrieval never requires an MCP key.