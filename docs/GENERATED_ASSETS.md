# DrawSpace Generated Assets

The generated brand, avatar, achievement and title assets are integrated through `src/data/assets.ts` and served as optimized WebP. `server/scripts/optimize-static-media.mjs` converted the original PNGs to WebP (lossless for brand marks, the app icon and the pixel avatar; quality 82 elsewhere), emitted responsive variants (`<name>-<width>.webp`) and generated `src/data/assetVariants.ts` plus `public/assets/media-manifest.json`. Original PNGs were removed only after every reference pointed at the WebP files.

Favicon PNGs (`favicon-32.png`, `favicon-192.png`, `apple-touch-icon.png`), `public/assets/social/og-drawspace-home.webp` and all inline SVG assets are intentionally preserved.

All images keep their original dimensions and transparency. Avatar, achievement and title images are 512 × 512 with 128/256 px variants; the app icon is 1024 × 1024 with 64/128/256/512 px variants; horizontal logos are 1200 × 300 with a 600 px variant.

## Avatars

| Asset | Location | Dimensions / format | Variants | Visual description | Usage |
|---|---|---|---|---|---|
| Orbit | `public/assets/avatars/avatar-orbit.webp` | 512×512 WebP | 128, 256 | Round face with orbital cyan ring | Avatar picker/profile (`av-01`) |
| Prism | `public/assets/avatars/avatar-prism.webp` | 512×512 WebP | 128, 256 | Angular square face | Avatar picker/profile (`av-02`) |
| Nova | `public/assets/avatars/avatar-nova.webp` | 512×512 WebP | 128, 256 | Rounded triangular face | Avatar picker/profile (`av-03`) |
| Pixel | `public/assets/avatars/avatar-pixel.webp` | 512×512 WebP (lossless) | 128, 256 | Pixel-block character | Avatar picker/profile (`av-04`) |
| Comet | `public/assets/avatars/avatar-comet.webp` | 512×512 WebP | 128, 256 | Helmet-like face with cyan trail | Avatar picker/profile (`av-05`) |
| Quartz | `public/assets/avatars/avatar-quartz.webp` | 512×512 WebP | 128, 256 | Faceted angular face | Avatar picker/profile (`av-06`) |
| Echo | `public/assets/avatars/avatar-echo.webp` | 512×512 WebP | 128, 256 | Round face with sound-wave details | Avatar picker/profile (`av-07`) |
| Flux | `public/assets/avatars/avatar-flux.webp` | 512×512 WebP | 128, 256 | Arch silhouette and asymmetric expression | Avatar picker/profile (`av-08`) |
| Halo | `public/assets/avatars/avatar-halo.webp` | 512×512 WebP | 128, 256 | Face with orbiting halo | Avatar picker/profile (`av-09`) |
| Onyx | `public/assets/avatars/avatar-onyx.webp` | 512×512 WebP | 128, 256 | Dark hooded geometric face | Avatar picker/profile (`av-10`) |

## Brand

| Asset | Location | Dimensions / format | Variants | Visual description | Usage |
|---|---|---|---|---|---|
| App icon | `public/assets/brand/drawspace-icon.webp` | 1024×1024 WebP (lossless) | 64, 128, 256, 512 | Pen nib with cyan orbital stroke | Header logo, auth panel, admin (`BRAND.icon`) |
| Horizontal logo | `public/assets/brand/drawspace-logo-horizontal.webp` | 1200×300 WebP (lossless) | 600 | Cyan pen mark and DrawSpace wordmark | Dark surfaces |
| Light logo | `public/assets/brand/drawspace-logo-light.webp` | 1200×300 WebP (lossless) | 600 | Same logo lockup with dark wordmark | Light surfaces |

## Achievements

| Asset | Location | Dimensions / format | Variants | Visual description | Usage |
|---|---|---|---|---|---|
| First guess | `public/assets/achievements/first-guess.webp` | 512×512 WebP | 128, 256 | Speech bubble with cyan checkmark medal | First correct guess reward (`a-first`) |
| Perfect artist | `public/assets/achievements/perfect-artist.webp` | 512×512 WebP | 128, 256 | Pen-and-laurel medal | Drawing performance reward (`a-draw50`) |
| Word master | `public/assets/achievements/word-master.webp` | 512×512 WebP | 128, 256 | Targeted geometric star | Guessing skill reward (`a-guess100`) |
| Winner | `public/assets/achievements/winner.webp` | 512×512 WebP | 128, 256 | Trophy medallion | Match victory reward (`a-win1`) |
| Streak master | `public/assets/achievements/streak-master.webp` | 512×512 WebP | 128, 256 | Repeating chevrons in shield | Consecutive correct guesses (`a-guess10`) |
| Speed legend | `public/assets/achievements/speed-legend.webp` | 512×512 WebP | 128, 256 | Lightning speed medal | Fast correct answers (`a-fast`) |
| Social player | `public/assets/achievements/social-player.webp` | 512×512 WebP | 128, 256 | Linked player forms | Multiplayer participation (`a-social`) |
| Dedicated player | `public/assets/achievements/dedicated-player.webp` | 512×512 WebP | 128, 256 | Calendar ring medal | Consistent participation (`a-streak7`) |
| XP collector | `public/assets/achievements/xp-collector.webp` | 512×512 WebP | 128, 256 | Ascending bars and crest | XP progression reward (`a-level10`) |
| Challenge master | `public/assets/achievements/challenge-master.webp` | 512×512 WebP | 128, 256 | Faceted challenge crest | Challenge completion (`a-draw1`) |
| Elite player | `public/assets/achievements/elite-player.webp` | 512×512 WebP | 128, 256 | Radiant geometric rank emblem | High-level reward (`a-win25`) |
| Legend | `public/assets/achievements/legend.webp` | 512×512 WebP | 128, 256 | Rare star medallion | Special achievement (`a-hard`) |

## Titles

| Asset | Location | Dimensions / format | Variants | Visual description | Usage |
|---|---|---|---|---|---|
| Rookie | `public/assets/titles/rookie.webp` | 512×512 WebP | 128, 256 | Open geometric entry chevron | Rookie rank (`t-newcomer`) |
| Artist | `public/assets/titles/artist.webp` | 512×512 WebP | 128, 256 | Pen and single stroke | Artist title (`t-artist`) |
| Guesser | `public/assets/titles/guesser.webp` | 512×512 WebP | 128, 256 | Eye target | Guesser title (`t-guesser`) |
| Word master | `public/assets/titles/word-master.webp` | 512×512 WebP | 128, 256 | Faceted book and reticle | Word master title (`t-wordsmith`) |
| Champion | `public/assets/titles/champion.webp` | 512×512 WebP | 128, 256 | Laurel shield | Champion title (`t-champion`) |
| Legend | `public/assets/titles/legend.webp` | 512×512 WebP | 128, 256 | Layered crest with cyan core | Legend title (`t-founder`) |

## Review sheet

| Asset | Location | Dimensions / format | Variants | Description / usage |
|---|---|---|---|---|
| Master preview | `public/assets/asset-preview.webp` | 1000×1716 WebP (q90) | 500 | Dark contact sheet with labeled avatar, brand, achievement and title sections; internal review only |

## Optimization notes

- Conversion only replaces an original when the WebP output is smaller; transparency and dimensions are preserved and metadata is stripped by the encoder.
- Responsive variants are consumed through `ASSET_VARIANTS` (`src/data/assetVariants.ts`) by the responsive image component; re-run the script after adding or replacing static raster assets.
- The favicon PNGs remain PNG because browsers and OS icon consumers require them; the social card was already WebP and is unchanged.
- Avatars `av-11` (Zephyr) and `av-12` (Lyra) predate the generated set and keep their inline vector fallback.