# DrawSpace import and export guide

This guide covers moving word bank and blog content in and out of DrawSpace through the admin dashboard and the content API. All imports and exports run server-side against Appwrite; the browser only reads the file and displays the report.

## 1. Importing JSON

1. Open **Admin dashboard > Word bank > Import** (or **Blog > Import**).
2. Choose a `.json` file. Accepted shapes:
   - Envelope: `{ "format": "drawspace-words", "version": 1, "words": [ ... ] }` or `{ "format": "drawspace-blogs", "version": 1, "blogs": [ ... ] }`.
   - A bare array of record objects.
3. Press **Preview**. The server parses, validates, and dry-runs the import without writing anything. The report shows created / updated / skipped / failed counts, per-record results, and warnings.
4. Choose a strategy (section 3), then press **Confirm import**. The final report replaces the preview.

A wrong `format` identifier, an unsupported `version`, malformed JSON, or a missing `words` / `blogs` array is rejected with a structural error before any record is touched.

## 2. Importing CSV

1. Choose a `.csv` file in the same Import dialog. Format is detected from the extension; without a filename the server sniffs the content.
2. Word columns: `word,language,category,difficulty,hint,active,id`. Only `word` is required; unknown columns are ignored with a warning.
3. Blog columns: `title,slug,excerpt,content,category,tags,status,cover,seoTitle,seoDescription,publishAt,id`. `title` and `content` are required. `publishedAt` is accepted as an alias of `publishAt`.
4. Quoting follows RFC 4180: fields containing commas, double quotes, or newlines are wrapped in double quotes and inner quotes are doubled. See `examples/content-import/blogs.example.csv` for multi-line content.
5. Tags in CSV are separated with `;` (JSON uses an array). `active` accepts `true`, `false`, `1`, `0`.
6. Empty files, empty or duplicate header names, rows with more columns than the header, and unterminated quotes are rejected as structural errors.

UTF-8 is assumed everywhere. Arabic, French, and any other Unicode text is preserved byte-for-byte; exports add a UTF-8 BOM so spreadsheet apps detect the encoding.

## 3. Import strategies

| Strategy | New records | Matching existing records |
| --- | --- | --- |
| `skip` (default) | Created | Left untouched, reported as skipped |
| `insert` | Created | Reported as failed with a duplicate error |
| `upsert` | Created | Updated with the imported fields |
| `replace` | Skipped with a warning | Updated, only after explicit confirmation |

`replace` never inserts and never deletes. In the dashboard it additionally requires ticking an overwrite confirmation checkbox; over the API it requires `"confirm": true` in the request body, otherwise the server answers `400 CONFIRM_REQUIRED`. No strategy ever replaces the whole database or deletes unrelated records.

Matching identifiers:

- Words: the normalized word (lowercase, accents stripped, punctuation removed, Unicode letters kept). `Cat`, `cat`, and `CAT` are the same word. An explicit `id` is honored on insert but matching for updates is by normalized word.
- Blogs: explicit `id` first, then `slug`. Slugs are lowercase ASCII letters, numbers, and hyphens; a title without a usable slug generates one, and non-ASCII titles need an explicit `slug`.

## 4. Limits and server-side validation

- File size: 2 MB (`413 FILE_TOO_LARGE`).
- Records per import: 1000 words, 200 blog posts (`400 IMPORT_LIMIT`).
- Extensions: `.json` and `.csv` only (`400 UNSUPPORTED_EXTENSION`).
- Every record passes the same validation as the admin forms: length limits, markup and control-character rejection, difficulty and language allowlists, tag limits, slug pattern, scheduled posts requiring a publish date.
- Frontend checks are convenience only; the server re-validates everything.

## 5. How errors and warnings are reported

Imports are per-record, not all-or-nothing. The report contains:

- `created`, `updated`, `skipped`, `failed` counters.
- `results[]` with `index` (0-based record position), the record label, `status`, the Appwrite row `id` when written, and `error` text for failures.
- `warnings[]` for non-fatal notices: ignored CSV columns, `replace` records with no match, and records that will be published immediately because they carry `status: "published"`.
- `dryRun: true` on previews, `false` on applied imports.

A failed record never blocks the others. Example: a file with one invalid word and nine valid words creates nine words and reports the invalid one with its validation message.

## 6. Transactions, idempotency, and recovery

Appwrite TablesDB has no multi-row transactions, so imports are **not atomic**. DrawSpace implements safe recovery instead of claiming atomicity:

- Records are written one at a time through the same service methods as the admin UI, in file order, with safe pagination reads (100 rows per page).
- Every write is idempotent in practice: re-running the same file with `skip` creates nothing new, and `upsert` converges to the same state.
- The report lists exactly which records succeeded (with their ids) and which failed, so a partial import can be finished by re-importing only the failed rows, or rolled back by deleting the listed ids from the dashboard.
- Each applied import writes an audit log entry (`word.import` / `blog.import`) with the strategy and counters; individual blog creates/updates keep their own audit entries.

Recovery recipe after a partial failure:

1. Keep the report (the dashboard shows it until the dialog is closed; the API returns it in the response).
2. Fix the offending records in your file, or split them out.
3. Re-import with `skip` to add only what is missing, or `upsert` to also correct what was written.
4. If you must undo, delete the reported ids via the dashboard bulk delete (words) or row delete (blogs). Nothing else is touched.

## 7. Exporting words

**Admin dashboard > Word bank > Export**:

- Format: JSON or CSV.
- Scope: all records or the currently selected rows.
- Filters: category and difficulty (the active filters of the export dialog, independent of the table filters).
- **Categories only** exports the category list with word counts.

API: `GET /api/v1/admin/export/words?format=json|csv&category=&difficulty=&active=&ids=` (staff session required). `ids` is a comma separated list of row ids and switches the scope to selected.

JSON exports carry `format: "drawspace-words"`, `version: 1`, `exportedAt`, `scope`, `filters`, `counts`, the `words` array (id, word, category, difficulty, language, hint, active, createdAt, updatedAt) and the `categories` array. CSV exports use the columns `word,language,category,difficulty,hint,active`.

## 8. Exporting blogs

**Admin dashboard > Blog > Export**:

- Format: JSON or CSV.
- Scope: all, published only, drafts only, or selected rows.
- Filter: category.

API: `GET /api/v1/admin/export/blogs?format=json|csv&scope=all|published|draft|selected&category=&ids=`. `scope=selected` requires `ids`.

JSON exports carry `format: "drawspace-blogs"`, `version: 1`, `exportedAt`, `scope`, `filters`, `counts`, and the `blogs` array with public-safe fields only (no author user ids). CSV exports use `title,slug,excerpt,content,category,tags,status,cover,seoTitle,seoDescription,publishAt` with tags joined by `;`.

Filenames are meaningful and dated, for example `drawspace-words-2026-11-14.json`, `drawspace-blogs-2026-11-14.csv`, `drawspace-word-categories-2026-11-14.json`. Large exports are read with safe pagination (100 rows per page, capped at 200 pages) instead of unbounded queries.

## 9. CSV safety

- Cells starting with `=`, `+`, `-`, `@`, tab, or carriage return are prefixed with `'` so spreadsheets never execute them as formulas. This applies to every CSV export.
- Commas, quotes, and newlines inside fields are escaped by quoting; round-tripping an export through the importer reproduces the original text exactly.
- A UTF-8 BOM is written at the start of CSV files. The importer strips it again on read.

## 10. Schema notes

- `hint`, `language`, and word timestamps persist once the content schema migration (`server/scripts/migrate-content-system.mjs`) is applied; before it, imports still succeed and those fields are reported but not stored. Blog `tags` behave the same way.
- Words whose text contains no Latin letters or digits (for example Arabic script) are stored and exported faithfully but are excluded from live game rounds, because the guessing engine matches ASCII-normalized text. They remain available for localized content and future engine work.
- Importing blog records with `status: "published"` makes them public immediately; the preview warns about each such record. Example files ship as drafts for this reason.

## 11. API quick reference

| Endpoint | Purpose |
| --- | --- |
| `POST /api/v1/admin/import/words` | Import words. Body: `{ content, filename?, format?, strategy?, dryRun?, confirm? }` |
| `POST /api/v1/admin/import/blogs` | Import blog posts, same body shape |
| `GET /api/v1/admin/export/words` | Export words (JSON/CSV, filters, ids) |
| `GET /api/v1/admin/export/blogs` | Export blogs (JSON/CSV, scope, ids) |
| `GET /api/v1/admin/export/categories` | Export word categories (JSON/CSV) |

All require an authenticated staff role (`superadmin`, `admin`, `content_manager`). Imports are rate limited to 20 requests per minute and exports to 30 per minute per server instance. See `docs/DRAWSPACE_API.md` for the full content API surface.