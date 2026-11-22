# DrawSpace Blog Studio Guide

A practical guide to the Blog Studio editor at `/admin/blog/studio`. It describes only behaviour that ships in this repository. For the article list, word bank and import/export, see `CONTENT_MANAGEMENT_GUIDE.md`.

## 1. What the Studio is

The Studio is a block-based article editor. Instead of writing markdown into a single text field, you assemble an article from typed blocks (paragraph, heading, list, table, hero, call to action, and so on), style the whole document from a design panel, and publish it through the same `blog_posts` table the rest of the admin console uses.

Studio articles are stored in the existing `content` column as a sentinel-prefixed JSON document:

```
DS-STUDIO-1
{"version":1,"blocks":[...],"design":{...},"code":{...},"meta":{...}}
```

A post whose `content` does not start with `DS-STUDIO-1` is a plain markdown post and renders through the markdown renderer instead. Both formats are served by the same public API; no separate storage was added.

## 2. Opening the Studio

- New article: `/admin/blog` then **Open Studio**, or go directly to `/admin/blog/studio`.
- Existing article: `/admin/blog`, then the wand icon on any row (`Open <title> in Studio`), or `/admin/blog/studio/<articleId>`.

Sign in with `superadmin`, `admin`, or `content_manager`. Custom JavaScript in the code panel additionally requires `superadmin` or `admin` (section 8).

## 3. Screen layout

```
+--------------------------------------------------------------------------+
| Blog | save status | undo redo | Edit/Preview | devices | fullscreen |   |
|                                  capacity % | more | Save draft | Publish|
+-------------+------------------------------------------+-----------------+
| left panel  |  title field                             | right panel     |
| blocks      |  block canvas (Edit)                     | design          |
| templates   |  or device-framed article (Preview)      | seo             |
| media       |                                          | code / publish  |
+-------------+------------------------------------------+-----------------+
```

Both side panels collapse to a rail. Fullscreen hides them so the canvas fills the window.

## 4. Writing with blocks

The **blocks** tab lists every block type in four groups. Click one to append it to the end of the article, or drag it from the panel and drop it between existing blocks. Drag a block's handle to reorder it.

| Group | Blocks |
| --- | --- |
| text | Paragraph, Heading, Quote, List, Code, Table |
| media | Image, Gallery, Video, Embed |
| layout | Separator, Spacer, Custom HTML, Columns |
| components | Callout, Buttons, Hero, Features, Card, Author, Table of contents, Newsletter, Call to action, Related posts |

Selecting a block opens its settings in place. Notes on the fields that behave non-obviously:

- **Paragraph, Callout, Card** hold rich text. Formatting produces HTML, which is sanitized before it is injected and again on the server before it is stored.
- **Heading** renders as a real `h1` to `h6`. Heading text is plain, so inline markup such as `**bold**` is not interpreted here. The public article page already renders the post title as the page `h1`, so use `h2` for your first in-body heading.
- **List** takes one item per line and has a numbered toggle. Items are plain text.
- **Code** picks a language from `ts, js, py, bash, sql, css, html, json, text` and highlights without any third-party dependency. The rendered block has a copy button.
- **Table** grows columns to the widest row and has a header-row toggle. Cells are plain text.
- **Video** accepts a YouTube, Vimeo, or direct `.mp4`/`.webm`/`.ogg` URL. Anything else renders nothing on the public page. YouTube is loaded from `youtube-nocookie.com`.
- **Embed** accepts iframe HTML for an allowlisted host only: YouTube, Vimeo, Spotify, CodePen.
- **Image, Gallery, Hero, Author** take their picture from the media panel (section 6), not from a free-text URL.
- **Columns** nests blocks in two or three children, so a column can hold its own paragraphs, lists and images.
- **Table of contents** builds itself from the heading blocks in the same document.
- **Related posts** is filled server-side from other published articles; you set only the title and how many to show.

## 5. Templates and design presets

The **templates** tab offers six built-in starting points: Standard article, Magazine, Tutorial, News, Review, and Announcement. Applying one replaces the current blocks and design, so the toast tells you to undo if it was a mistake. Below them, **Your templates** lists templates you saved from the current document and reuses across articles.

The **design** tab styles the whole document at once rather than block by block:

- Preset: Cinematic Dark, Editorial Light, Magazine, Minimal, Neon Space. A preset fills every field below it, and you can then change any of them.
- Typography: body family, size, weight, line height, letter spacing, text colour, plus a separate heading family, weight and colour.
- Layout: content width, section spacing, padding, corner radius, shadow strength (none, soft, strong), container alignment, and a full-width toggle.
- Colours: page background, a gradient (Cyan fade, Neon space, Warm paper, or none), a background image, section background, border colour, and the accent colour used by links, buttons and callouts.

Design values become CSS variables on the article container, so they apply identically in the Studio preview and on the public page.

## 6. Media panel

The **media** tab is the picker for every image in the article. Click an image slot in a block, in the publish panel (cover), in the SEO panel (social image), or in the design panel (background), and the Studio switches to this panel with that slot as the target. Choosing a file uploads it through the existing media pipeline and inserts the stored URL into the slot you came from.

## 7. Preview, autosave and history

- **Edit** shows the block canvas. **Preview** shows the rendered article inside a device frame: desktop (full width), tablet (768px), or mobile (390px). Preview includes the header, category, date, author and excerpt exactly as the public page shows them.
- **Autosave.** For an existing article, edits are saved 1.6 seconds after you stop typing. For a new article, the Studio creates a draft 2.4 seconds after the title and the first block both exist, then navigates to that draft's URL. The toolbar shows `Saving…`, `Saved <time>`, `Unsaved changes`, or `Save failed`. Leaving the page with unsaved changes triggers a browser confirmation.
- **History.** Undo and redo cover block edits, design changes, template application and metadata changes, and coalesce rapid typing on the same field into one step. History is per session and is not stored on the server.
- **Save draft** writes the article with its current status. **Publish** asks for confirmation first and sets status to published.
- **More actions** (three dots) offers Export JSON, Import JSON, and, for a published article with a slug, View public article.

### Keyboard shortcuts

| Keys | Action |
| --- | --- |
| `Ctrl`+`S` | Save |
| `Ctrl`+`Z` | Undo |
| `Ctrl`+`Shift`+`Z` or `Ctrl`+`Y` | Redo |
| `Ctrl`+`Shift`+`P` | Toggle preview |
| `Ctrl`+`Shift`+`F` | Toggle fullscreen |
| `Esc` | Exit fullscreen, close menus |

Undo and redo are ignored while the cursor is in a text field, so native text undo keeps working there.

## 8. Custom code panel

The **code** tab can add per-article HTML, CSS and JavaScript. It is off by default and nothing renders until you enable it.

- Placement decides where the section is injected: **After article** (`post`) and **End of content** (`section`) both render immediately after the article body, **Before article** (`header`) renders above the title, and **Page footer area** (`footer`) renders at the end of the page.
- HTML and CSS render directly after sanitizing. The CSS sanitizer strips `@import`, `expression()`, `behavior`, `-moz-binding` and any `url()` pointing at `javascript:`.
- JavaScript never runs in the page. It runs inside an iframe with `sandbox="allow-scripts"` and no `allow-same-origin`, plus a Content-Security-Policy that blocks `connect-src` entirely. A script therefore cannot read DrawSpace cookies, storage, or the DOM, and cannot make network requests.
- Only `superadmin` and `admin` may store JavaScript. The server strips `js`, `headerScript` and `footerScript` from any submission by another role, so a `content_manager` can still use HTML and CSS but cannot add behaviour.

## 9. SEO and publish panels

The **seo** tab holds slug, SEO title, SEO description, canonical URL and social (Open Graph) image. Leave canonical empty to let the article page generate `https://drawspace.cloud/blog/<slug>`.

The **publish** tab holds status, publish date, category, tags, cover image and excerpt, plus a Duplicate action. Duplicating creates a new draft titled `<title> (copy)` with the slug `<slug>-copy` and opens it.

What the Studio fills in for you on save:

| Field | Fallback when left empty |
| --- | --- |
| `title` | Save is refused; a title is required |
| `slug` | Generated from the title by the API |
| `excerpt` | First 140 characters of the article's plain text |
| `seoTitle` | The article title |
| `seoDescription` | The excerpt |
| `category` | `News` |
| `tags` | Comma-separated, lowercased, first 10 kept |
| `publishAt` | Sent as that date at `10:00:00Z` |

## 10. Storage limits

The toolbar shows a live capacity meter: the serialized document size as a percentage of the limit the backend reports. Saving is blocked with an explanatory message when the document exceeds it.

- The limit comes from `GET /api/v1/admin/blog-studio/config` and is normally **50,000 characters**, matching the size of the `content` column in production.
- The server refuses any studio document above **500,000 characters** regardless of what the client sent.
- If the meter is near 100%, remove blocks or shorten text. The limit counts the serialized JSON, so design and code settings consume it too.

## 11. Import and export

**Export JSON** downloads `<slug>.studio.json` containing `{ format: "drawspace-studio", version: 1, meta, doc }`. **Import JSON** accepts that same shape and asks you to confirm before it replaces the current document; a file without a `blocks` array is rejected as "Not a DrawSpace studio export".

This is the Studio's own format and is separate from the CSV/JSON bulk import on `/admin/blog`, which is documented in `IMPORT_EXPORT_GUIDE.md`.

## 12. Opening an older markdown article

Articles written before the Studio store markdown in `content`. When you open one, the Studio converts that markdown into blocks so you can keep editing visually:

| Markdown | Becomes |
| --- | --- |
| `# ` and `## ` | Heading level 2 (the page owns the single `h1`) |
| `### ` to `###### ` | Heading level 3 to 6 |
| `- `, `* `, `1. ` | List block |
| `> ` | Quote block |
| ` ``` ` fences | Code block, with the fence language |
| `| a | b |` rows | Table block, header row detected from the `| --- |` rule |
| `---`, `***`, `___` | Separator block |
| anything else | Paragraph block |

Two things to know before you convert a post:

- The conversion is **one way**. Saving writes the studio format into `content`, and the markdown source is no longer stored. Export JSON first if you want a copy.
- Heading, list, quote and table fields are plain text, so inline markup inside them is reduced to its words: `**bold**` becomes `bold`. Paragraph fields keep bold, italic, inline code and links. Links whose URL is not `http`, `https`, `mailto`, a site-relative path or a fragment are dropped, leaving the link text.

## 13. How the public page renders a Studio article

`/blog/<slug>` parses `content`. If it starts with the sentinel, the document renders through the shared Studio renderer, so the public page and the Studio preview use the same code and the same design variables. Otherwise it renders as markdown. The server sanitizes the document again before it is stored, so what the browser receives has already passed an allowlist filter.

Structured data, canonical URL, Open Graph tags, breadcrumbs, table of contents and the related-articles list are produced by the article page, not stored in the document. See section 9 for the canonical override.

## 14. Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| Save is refused with a character count | The document exceeds the storage limit. Remove blocks, or ask an admin to widen the `content` column. |
| JavaScript does nothing in preview | The code section is not enabled, the placement does not match the position, or your role cannot store scripts. |
| An embed or video shows nothing publicly | The host is not allowlisted, or the URL is not a recognised media URL. |
| Markdown characters such as `#` or `**` appear as literal text | The post was saved by an older converter that flattened markdown into paragraphs. Re-supply the markdown source and save again. |
| The public article looks different from the preview | The preview uses `/en-US` paths for internal links. Otherwise both use the same renderer, so a difference means the post has not been saved since the change. |
| Related posts is empty | There are not enough other published articles yet. |

## Related documents

- `CONTENT_MANAGEMENT_GUIDE.md` - article list, word bank, import/export, MCP page.
- `MCP_SETUP.md` - connect an AI client and manage MCP keys.
- `MCP_SECURITY.md` - MCP threat model and residual risks.
- `DRAWSPACE_API.md` - public and admin REST API reference.
- `IMPORT_EXPORT_GUIDE.md` - CSV/JSON bulk formats and strategies.
