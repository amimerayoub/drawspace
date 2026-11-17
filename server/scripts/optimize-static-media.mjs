/* DrawSpace static media optimization.
   Converts integrated raster assets to WebP, emits responsive variants and a
   generated variant map, and (with --prune) removes originals only once no
   reference to them remains. SVG and favicon PNGs are intentionally preserved.
   Emblem families (avatars/titles/achievements) are capped at 256px bases:
   the largest rendered size is 72px, so 256px covers 2x+ retina displays.
   Usage: node server/scripts/optimize-static-media.mjs [--prune] */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const PUBLIC = path.join(ROOT, 'public');
const PRUNE = process.argv.includes('--prune');

// Browser/OS icons must stay PNG; the social card is already an optimized WebP.
const PRESERVE = new Set([
  'public/favicon-32.png',
  'public/favicon-192.png',
  'public/apple-touch-icon.png',
  'public/assets/social/og-drawspace-home.webp',
]);
// Crisp marks / pixel art need lossless to avoid edge or detail damage.
const isLossless = (rel) => /\/brand\//.test(rel) || /logo|icon/.test(path.basename(rel)) || /avatar-pixel/.test(rel);
const qualityFor = (rel) => (/asset-preview/.test(rel) ? 90 : 82);
const EMBLEM_FAMILY = /\/(avatars|titles|achievements)\//;
const MAX_EMBLEM_BASE = 256;
const isVariantFile = (p) => /-\d+\.webp$/.test(p);

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

function variantWidths(meta) {
  const square = meta.width === meta.height;
  if (!square) return [Math.round(meta.width / 2)].filter((w) => w >= 64 && w < meta.width);
  if (meta.width <= 512) return [128, 256].filter((w) => w < meta.width);
  return [64, 128, 256, 512].filter((w) => w < meta.width);
}

const readBuf = (p) => fs.readFileSync(p);
const encode = (input, width, lossless, quality) => {
  let pipe = sharp(input).rotate();
  if (width) pipe = pipe.resize({ width, withoutEnlargement: true });
  return pipe.webp(lossless ? { lossless: true, effort: 6 } : { quality, effort: 6, alphaQuality: 100 }).toBuffer();
};

async function main() {
  const candidates = walk(PUBLIC).filter((p) => /\.(png|jpe?g)$/i.test(p)).map(rel).filter((r) => !PRESERVE.has(r));
  const report = [];
  let converted = 0; let savedBytes = 0; let variantCount = 0;

  for (const r of candidates) {
    const abs = path.join(ROOT, r);
    const input = readBuf(abs);
    const meta = await sharp(input).metadata();
    const lossless = isLossless(r);
    const quality = qualityFor(r);
    const base = r.replace(/\.(png|jpe?g)$/i, '');
    const fullRel = `${base}.webp`;
    const fullBuf = await encode(input, null, lossless, quality);
    const originalBytes = fs.statSync(abs).size;

    if (fullBuf.byteLength >= originalBytes) {
      report.push({ file: r, action: 'preserved', reason: 'webp not smaller', originalBytes });
      continue;
    }
    fs.writeFileSync(path.join(ROOT, fullRel), fullBuf);
    const widths = variantWidths(meta);
    for (const w of widths) {
      const buf = await encode(input, w, lossless, quality);
      fs.writeFileSync(path.join(ROOT, `${base}-${w}.webp`), buf);
      variantCount += 1;
    }
    converted += 1;
    savedBytes += originalBytes - fullBuf.byteLength;
    report.push({ file: r, action: 'converted', lossless, originalBytes, webpBytes: fullBuf.byteLength, widths });
  }

  // Cap emblem bases at 256px (2x+ the largest rendered size) and regenerate
  // their 128px variant; drop now-orphaned larger variants.
  const webpBases = walk(PUBLIC).filter((p) => /\.webp$/i.test(p)).map(rel).filter((r) => !isVariantFile(r) && !PRESERVE.has(r));
  for (const r of webpBases) {
    if (!EMBLEM_FAMILY.test(r)) continue;
    const abs = path.join(ROOT, r);
    const input = readBuf(abs);
    const meta = await sharp(input).metadata();
    const lossless = isLossless(r);
    const targetWidth = /avatar-pixel/.test(r) || /\/titles\//.test(r) ? 128 : MAX_EMBLEM_BASE;
    if (meta.width === targetWidth && fs.statSync(abs).size <= 15 * 1024) continue;
    const buf = await encode(input, targetWidth, lossless, 74);
    fs.writeFileSync(abs, buf);
    const base = r.replace(/\.webp$/, '');
    if (targetWidth > 128) fs.writeFileSync(path.join(ROOT, `${base}-128.webp`), await encode(input, 128, lossless, 74));
    else if (fs.existsSync(path.join(ROOT, `${base}-128.webp`))) fs.unlinkSync(path.join(ROOT, `${base}-128.webp`));
    for (const w of [256, 512]) {
      const orphan = path.join(ROOT, `${base}-${w}.webp`);
      if (fs.existsSync(orphan)) fs.unlinkSync(orphan);
    }
    report.push({ file: r, action: 'resized', width: targetWidth, webpBytes: buf.byteLength });
  }

  // Rebuild the variant map from disk so repeat runs stay complete.
  const variantsMap = {};
  for (const r of walk(PUBLIC).filter((p) => /\.webp$/i.test(p)).map(rel).filter((r) => !isVariantFile(r))) {
    const meta = await sharp(readBuf(path.join(ROOT, r))).metadata();
    const base = r.replace(/\.webp$/, '');
    const widths = [64, 128, 256, 512].filter((w) => fs.existsSync(path.join(ROOT, `${base}-${w}.webp`)));
    variantsMap[`/${r.replace(/^public\//, '')}`] = { width: meta.width, height: meta.height, widths };
  }

  fs.writeFileSync(path.join(ROOT, 'public/assets/media-manifest.json'), JSON.stringify({ generatedAt: new Date().toISOString(), assets: variantsMap }, null, 2));
  const ts = `/* Generated by server/scripts/optimize-static-media.mjs. Do not edit by hand.\n   Maps optimized static WebP assets to their intrinsic size and responsive widths. */\nexport interface AssetVariant { width: number; height: number; widths: number[] }\nexport const ASSET_VARIANTS: Record<string, AssetVariant> = ${JSON.stringify(variantsMap, null, 2)};\n`;
  fs.writeFileSync(path.join(ROOT, 'src/data/assetVariants.ts'), ts);

  if (PRUNE) {
    const haystack = ['src', 'server/src', 'index.html', 'docs'].map((p) => path.join(ROOT, p));
    const referenced = (pngRel) => {
      const needle = `/${pngRel.replace(/^public\//, '')}`;
      const scan = (dir) => {
        const st = fs.statSync(dir);
        if (st.isFile()) return fs.readFileSync(dir, 'utf8').includes(needle);
        return fs.readdirSync(dir, { withFileTypes: true }).some((e) => scan(path.join(dir, e.name)));
      };
      return haystack.some((h) => fs.existsSync(h) && scan(h));
    };
    for (const entry of report) {
      if (entry.action !== 'converted') continue;
      const webp = entry.file.replace(/\.(png|jpe?g)$/i, '.webp');
      if (!fs.existsSync(path.join(ROOT, webp))) continue;
      if (referenced(entry.file)) { report.push({ file: entry.file, action: 'kept-original', reason: 'still referenced' }); continue; }
      fs.unlinkSync(path.join(ROOT, entry.file));
      entry.action = 'converted+pruned';
    }
  }

  const preserved = report.filter((r) => r.action === 'preserved' || r.action === 'kept-original');
  console.log(JSON.stringify({ converted, variantCount, savedBytes, preserved, report }, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });