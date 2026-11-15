/* Server-side image optimization for uploads (Sharp).
   Produces a WebP primary plus thumbnail/responsive variants, preserves
   transparency, strips metadata, and never touches non-image or animated files. */
import sharp, { type Metadata } from 'sharp';

export const OPTIMIZABLE_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/avif', 'image/tiff']);
export const RESPONSIVE_WIDTHS = [480, 960, 1600];
export const THUMB_WIDTH = 160;

export interface OptimizedVariant { width: number; bytes: Buffer }
export interface OptimizedImage {
  primary: Buffer;
  mimeType: 'image/webp';
  width: number;
  height: number;
  hasAlpha: boolean;
  lossless: boolean;
  thumb: Buffer;
  variants: OptimizedVariant[];
}

const encode = (input: Buffer, width: number | null, lossless: boolean) => {
  let pipe = sharp(input).rotate();
  if (width) pipe = pipe.resize({ width, withoutEnlargement: true });
  return pipe.webp(lossless ? { lossless: true, effort: 6 } : { quality: 82, effort: 6, alphaQuality: 100 }).toBuffer();
};

export async function optimizeUpload(bytes: Buffer, mimeType: string): Promise<OptimizedImage | null> {
  const mime = mimeType.toLowerCase().split(';')[0].trim();
  if (!OPTIMIZABLE_MIME.has(mime)) return null;
  let meta: Metadata;
  try { meta = await sharp(bytes).metadata(); } catch { return null; }
  if (!meta.width || !meta.height) return null;
  if ((meta.pages ?? 1) > 1) return null; // animated GIF/WebP: preserve as-is
  if (meta.format === 'svg') return null;

  const hasAlpha = Boolean(meta.hasAlpha);
  const lossless = hasAlpha && Math.max(meta.width, meta.height) <= 512;
  const primary = await encode(bytes, null, lossless);
  if (primary.byteLength >= bytes.byteLength) return null; // optimization would not help

  const thumb = await encode(bytes, Math.min(THUMB_WIDTH, meta.width), lossless);
  const variants: OptimizedVariant[] = [];
  for (const width of RESPONSIVE_WIDTHS) {
    if (width >= meta.width) continue;
    variants.push({ width, bytes: await encode(bytes, width, lossless) });
  }
  return { primary, mimeType: 'image/webp', width: meta.width, height: meta.height, hasAlpha, lossless, thumb, variants };
}