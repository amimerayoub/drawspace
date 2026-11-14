# DrawSpace content import examples

Ready-to-import sample files for the DrawSpace admin dashboard (Word bank and Blog pages, Import button) and for the content API (`POST /api/v1/admin/import/words` and `POST /api/v1/admin/import/blogs`).

| File | Contents |
| --- | --- |
| `words.example.json` | 7 words in the `drawspace-words` v1 envelope, including French and Arabic entries |
| `words.example.csv` | The same words as CSV, with a quoted hint containing a comma |
| `blogs.example.json` | 2 realistic articles in the `drawspace-blogs` v1 envelope, both `draft` |
| `blogs.example.csv` | The same articles as CSV, with quoted multi-line content and semicolon separated tags |

## Quick start

1. Sign in to the admin dashboard with a staff role (`superadmin`, `admin`, or `content_manager`).
2. Open **Word bank** or **Blog**, then **Import**.
3. Choose one of these files, pick a strategy, press **Preview**, review the per-record report, then **Confirm import**.

Example articles are drafts on purpose. Importing never publishes content unless a record explicitly carries `"status": "published"`, and the preview warns you when that happens.

## Rules these files follow

- JSON envelopes carry `format` and `version: 1`. A bare array of records is also accepted.
- CSV headers for words: `word,language,category,difficulty,hint,active` (`word` is required, the rest are optional columns).
- CSV headers for blogs: `title,slug,excerpt,content,category,tags,status,cover,seoTitle,seoDescription,publishAt` (`title` and `content` are required).
- CSV tags are separated with `;`. Fields containing commas, quotes, or newlines are quoted RFC 4180 style.
- `active` accepts `true/false/1/0`. Missing values fall back to defaults (`active: true`, `status: draft`, `language: en`).
- Limits: 2 MB per file, 1000 words or 200 blog posts per import.

Full documentation, strategies, duplicate rules, error reporting, and recovery steps: [docs/IMPORT_EXPORT_GUIDE.md](../../docs/IMPORT_EXPORT_GUIDE.md).