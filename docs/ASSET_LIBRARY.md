# DrawSpace Asset Library

## 1. Project Visual Identity

DrawSpace is a browser based drawing and guessing game with public play, rooms, profiles, progression, editorial content, and a staff dashboard. Routes are locale prefixed (`en-US`, `en-GB`, `fr`, `ar`, `es`, `pt-BR`, `de`, `ru`) with `/admin/*` outside the public shell. The game route is `/:locale/game/:code`.

Palette: black, white, neutral grays, and electric cyan `#06B6D4`; target 60/30/10 dark/neutral/cyan balance. Current theme tokens permit light and dark modes. Preserve contrast in both. Typography should continue the existing CSS/system stack; no font asset is evidenced. Art is restrained, mature, monochrome with cyan accents; use 3D sparingly. Keep consistent silhouette, line weight, and lighting. No user avatar uploads.

## 2. Existing Asset Audit

| Asset name | Existing file path | Current usage | Reusable status | Required action |
|---|---|---|---|---|
| Favicon | `public/favicon.svg` | Browser tab | Existing, inspect before replacement | Reuse if it matches Header logo |
| DrawSpace logo | Inline SVG in `src/components/Header.tsx` | Header/footer | Existing, vector | Consider extracting variants only if deployment needs them |
| Avatar library | Inline SVG shapes in `src/components/Avatar.tsx`, definitions in `src/data/mock.ts` | User, game, leaderboard, admin | Existing; 12 geometric shapes, IDs av-01..av-12 | Reuse, audit distinctiveness and accessible naming |
| Blog category covers | Inline SVG in `src/components/BlogCover.tsx` | Blog cards | Existing, category-driven | Reuse; do not add duplicate raster covers without editorial need |
| Functional icons | `lucide-react` usage across `src/` | Navigation, controls, admin | Existing | Keep one Lucide family |
| Drawing surface | `src/game/DrawingCanvas.tsx` | Gameplay | Existing canvas UI, not a static asset | Retain as functional UI |

Only `public/favicon.svg` is a public file asset. No raster/3D media files were found. Landing already renders a game preview, feature and reward icons; avoid redundant illustrations. No avatar-upload feature is present.

## 3. Asset Inventory Summary

Plan: logo export variants and social card; retain inline game and blog previews; refine the 12 existing avatars in place only if needed; add a compact achievement emblem set and a small number of contextual empty/error visuals only where the interface currently has designed empty states. Most admin screens use native tables, forms, charts and Lucide icons. Planned count below is a lean first release, not a generic SaaS pack.

## 4. Brand Assets

### Asset ID: DS-001
**Asset Name:** Primary DrawSpace logo
**Filename:** `drawspace-logo-primary.svg`
**Category:** Brand. **Description:** Existing rounded-square cyan pen mark and DrawSpace wordmark, horizontal. **Purpose:** Brand recognition. **Location:** Header/footer and marketing metadata. **Usage:** Extract/reuse Header inline SVG; wordmark remains live text where practical. **Visual Style:** Flat vector, black/white wordmark by theme, cyan mark. **Dimensions:** 240x40 viewBox. **Aspect Ratio:** 6:1. **Format:** SVG. **Background:** Transparent. **Generation Prompt:** None; existing vector. **Responsive Behavior:** Scale as one unit, preserve clear space. **Accessibility:** “DrawSpace home” for link; mark decorative. **Priority:** Essential. **Status:** Reuse.

### Asset ID: DS-002
**Asset Name:** DrawSpace social preview
**Filename:** `og-drawspace-home.webp`
**Category:** Brand. **Description:** Minimal crop of the existing drawing-game preview with logo-safe space. **Purpose:** Open Graph share for home page. **Location:** SEO metadata for landing only. **Usage:** Shared card, no baked copy. **Visual Style:** Actual canvas UI rendered in grayscale, cyan details. **Dimensions:** 1200x630. **Aspect Ratio:** 1.91:1. **Format:** WebP. **Background:** Dark. **Generation Prompt:** “Create a polished social preview composition for DrawSpace, a professional browser drawing-and-guessing game. Show a cropped, believable dark game interface with a clean white drawing canvas and restrained electric cyan #06B6D4 details; use only black, white and neutral grays otherwise. Reserve uncluttered space at upper left for a separately overlaid logo. Crisp product-render aesthetic, no legible text, no people, no gradients, no glow, no extra objects. 1200x630 landscape.” **Responsive Behavior:** Crop center safely; logo and important canvas stay within 80% safe area. **Accessibility:** “DrawSpace drawing and guessing game preview.” **Priority:** Important. **Status:** Generated. Final file: `public/assets/social/og-drawspace-home.webp`; actual dimensions 1200 × 630; format WebP; file size 22,960 bytes.

## 5. Landing Page Assets

No separate hero/feature art is necessary: `Landing.tsx` already includes a UI game preview, mode cards, achievement chips, leaderboard and blog rows. Reuse these native previews; do not fill whitespace decoratively. Social preview is DS-002.

## 6. User Interface Assets

Reuse DS-AV01..12 for profile, picker, user menu, leaderboard and room rosters. Progress, titles, history and challenges are expressed with text, bars, badges and Lucide icons. No uploaded profile photos. Empty states should use typography/icon before commissioning art.

## 7. Game Assets

Game route uses canvas, player list and chat with functional Lucide controls. No static drawing samples are required. Round state/result can use existing trophy/icon components. Optional one-color state illustration only if a current empty/connection state lacks sufficient status text; see DS-032.

## 8. Avatar Library

Keep the existing 12 selectable geometric vector avatars, no upload option. Each is inline SVG at 48x48 viewBox and displayed at responsive UI sizes (28–72 px); transparent; currentColor outline plus cyan detail. Raster generation is unnecessary. IDs map to existing shape indices; proposed filename `avatar-orbit.svg` etc. is conceptual only because current assets are inline.

| ID | Existing identity / filename convention | Visual concept |
|---|---|---|
| DS-AV01 | Orbit / `avatar-orbit.svg` | Circular face, cyan smile |
| DS-AV02 | Prism / `avatar-prism.svg` | Rounded square face, cyan mouth |
| DS-AV03 | Nova / `avatar-nova.svg` | Triangular face, cyan nose |
| DS-AV04 | Pixel / `avatar-pixel.svg` | Square pixel face, single cyan eye |
| DS-AV05 | Comet / `avatar-comet.svg` | Split circular visor and cyan trail |
| DS-AV06 | Quartz / `avatar-quartz.svg` | Faceted hexagon face |
| DS-AV07 | Echo / `avatar-echo.svg` | Circular face with curved eyes |
| DS-AV08 | Flux / `avatar-flux.svg` | Arch silhouette face |
| DS-AV09 | Halo / `avatar-halo.svg` | Oval face with cyan orbital ring |
| DS-AV10 | Onyx / `avatar-onyx.svg` | Filled translucent rounded form |
| DS-AV11 | Zephyr / `avatar-zephyr.svg` | House/helmet silhouette |
| DS-AV12 | Lyra / `avatar-lyra.svg` | Asymmetric expression face |

All are distinct in contour and expression, 1:1, transparent, SVG. No generated prompts; existing code is source. Accessibility: existing Avatar supplies the avatar name. Status: Existing. Priority: Essential.

## 9. Achievement and Title Assets

Achievements currently use semantic icon keys in mock data, titles are text, and UI uses icons. Reuse Lucide symbols; no trophy raster set required. If a unified emblem set is later approved, each must preserve monochrome silhouette with cyan accent and remain legible at 24px. Not counted as planned custom artwork.

## 10. Blog Assets

`BlogCover.tsx` already draws category SVG cover art for guess/draw/learn/update/community/default. Reuse it as the default category visual; article-specific photos are not evidenced. Admin blog/media support does not establish a need for stock or generated imagery. **DS-020:** `blog-default-cover.svg`, reuse inline default; 176x112; 11:7; SVG transparent art over theme surface; alt derived from article title; Priority Important; Status Existing. No new prompt.

## 11. Admin Dashboard Assets

Routes include overview, users, roles, rooms, words, game config, CRM, avatars, titles, achievements, challenges, XP, blog, SEO, ads, media, analytics, moderation, audit and settings. Use existing Lucide navigation icons, data tables, charts, status badges and Avatar. No decorative admin illustrations needed. Media thumbnails are user/admin-managed content, not bundled assets.

## 12. System Assets

NotFound and empty states should primarily use headings and Lucide icons. No maintenance or onboarding route is evidenced. **DS-032:** optional connection-lost status mark, `connection-lost.svg`; only if status copy alone proves insufficient. Simple broken-link/network outline with one cyan node; 64x64 SVG, transparent, aria-hidden beside live status text; no custom image prompt, implement as Lucide `WifiOff`; Priority Optional; Status Planned (icon only, no image file).

## 13. Icon Inventory

Use installed Lucide React, outline family, 1.75–2px stroke, usually 14–20px controls and 24–28px empty states. Inactive: neutral foreground; active: cyan plus existing active surface; hover: theme foreground/surface transition. Maintain focus rings and labels. Icons are inline SVG, never raster.

| Icon(s) | Purpose / locations |
|---|---|
| Menu, X, ChevronDown, Globe, Sun, Moon | Header, mobile menu, language/theme |
| User, LogOut, Shield, Trophy, Target | User menu and navigation |
| PenLine, PenTool, MessageSquare, Eye, TrendingUp, Users, BookOpen, KeyRound | Landing and play modes |
| Plus, Lock, RefreshCw, Copy, Link2, Play | Lobby, create/join, waiting room |
| Pencil, Eraser, palette/tool symbols, Volume2, VolumeX, Flag | Drawing/game controls and reports |
| Crown, Trophy, RotateCcw, ArrowRight | Leaderboard and results |
| CalendarDays, Pencil, Trophy, Zap, Target | Profile, challenges and achievement meanings |
| LayoutDashboard, BarChart3, ClipboardList, Cog, FileText, Image, Megaphone, Shapes | Admin navigation |
| Check, Trash2, Save, Upload, Ban, Flag, Lock, Shield | Admin actions and moderation |
| Loader/spinner, WifiOff, AlertTriangle, Search, CheckCircle | System/status where used |

Standard size 16px for compact admin actions (12–14 for dense tables); 18–20 for page controls; 24–28 for empty-state marks. SVG via Lucide, decorative icons `aria-hidden`, icon-only buttons require accessible labels.

## 14. Recommended Asset Directory

```text
public/
  favicon.svg                 # existing
  assets/
    brand/                    # future exported logo variants
    social/                   # OG card
    blog/                     # only if editorial images are introduced
src/components/                # current inline SVG logo, avatars, blog covers
```

Keep the existing Vite conventions. Do not create empty files or move inline art just for folder symmetry.

## 15. Asset Generation Prompts

Only DS-002 currently warrants custom image generation; its production prompt is specified above. Everything else identified as existing is inline SVG/UI and should be reused. No other asset should be generated without a product requirement.

## 16. Asset Usage Map

| Asset | Page/component | Intended use |
|---|---|---|
| DS-001 logo | Header, Footer | Brand/home link |
| DS-002 social card | Landing SEO metadata | Link preview |
| DS-AV01..12 | Play, Profile, Header, Lobby, WaitingRoom, GameRoom, Results, Leaderboard, Admin users/avatar library | User-selectable identity |
| DS-020 blog category SVG | Blog, BlogArticle cards | Editorial category cue |
| DS-032 optional mark | GameRoom connection status | Supporting status indicator only |
| Lucide inventory | Public and admin components | Functional controls and status |

## 17. Technical Specifications

Use SVG for logo, avatars and icons; WebP/AVIF for photographic/social raster artwork, PNG only when transparency/tool compatibility requires it. Use responsive `srcset` for raster. Provide image dimensions to prevent layout shift; compress and lazy-load below-fold images. Social card 1200x630. SVGs should have viewBox, no embedded raster, scripts or external dependencies. Naming: lowercase kebab-case, descriptive, stable IDs in inventory. Decorative visuals empty alt/aria-hidden; meaningful graphics concise purpose-based alt text. Avoid text baked into artwork. Ensure grayscale and cyan contrast in both themes and RTL layouts.

## 18. Asset Production Priority

- **Priority 1: Essential.** Reuse logo, favicon, 12 avatar SVGs, Lucide functional icons, game canvas UI and blog cover SVGs.
- **Priority 2: Important.** DS-002 social preview image.
- **Priority 3: Optional.** DS-032 connection icon treatment, preferably Lucide rather than custom artwork.

## 19. Final Checklist

- [x] Routes and public/admin pages inspected from route declarations.
- [x] Existing public files and inline SVG usage recorded.
- [x] Existing and planned items distinguished.
- [x] Avatar library limited to the existing 12; no upload feature proposed.
- [x] Custom generation prompt provided for each planned custom image.
- [x] Locations, dimensions and use documented for planned assets.
- [x] Palette constrained to black, white, neutral grayscale and #06B6D4.
- [x] DS-002 generated and verified at `public/assets/social/og-drawspace-home.webp` (1200 × 630 WebP, 22,960 bytes); no application components modified.

**Count:** 16 inventory entries (DS-001, DS-002, DS-020, DS-032, 12 avatars). Existing reusable assets: 15 (logo, favicon, blog cover, 12 avatars). Planned: 1 custom image (OG preview), now generated; plus one optional Lucide status treatment. Essential: 15 (existing logo/favicon, avatars, blog visual and icon/UI system). Caveat: admin routes were inspected in source; runtime visual inspection was not performed. Blog post/image content inventory and deployed `drawspace.cloud` metadata could not be confirmed from repository source. No image files were generated.

