import type { ImgHTMLAttributes } from 'react';
import { ASSET_VARIANTS } from '@/data/assetVariants';

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'srcSet' | 'loading' | 'fetchPriority'> & {
  src: string;
  eager?: boolean;
  widths?: number[];
  thumb?: boolean;
};

/* Serves the smallest suitable variant: static assets use the generated
   <name>-<width>.webp files, Appwrite media uses ?w= / ?variant=thumb.
   External or unknown URLs render unchanged. */

/* Stored records may still reference pre-WebP .png/.jpg paths; resolve them
   to the optimized asset when it exists. */
const LEGACY_ASSET = /^(?:https?:\/\/[^/]+)?(\/assets\/[^?#]+)\.(?:png|jpe?g)$/i;
export function resolveLegacyAsset(src: string): string {
  const match = src.match(LEGACY_ASSET);
  if (!match) return src;
  const webp = `${match[1]}.webp`;
  return ASSET_VARIANTS[webp] ? webp : src;
}

export function ResponsiveImage({ src: rawSrc, eager = false, widths, thumb = false, sizes, width, height, ...rest }: Props) {
  const src = resolveLegacyAsset(rawSrc);
  const variant = ASSET_VARIANTS[src];
  const isMedia = src.includes('/api/media/');
  let resolved = src;
  let srcSet: string | undefined;
  if (thumb && isMedia && !src.includes('?variant=')) resolved = `${src}?variant=thumb`;
  else if (variant) {
    srcSet = [...variant.widths.map((w) => `${src.replace(/\.webp$/, `-${w}.webp`)} ${w}w`), `${src} ${variant.width}w`].join(', ');
  } else if (isMedia && widths && widths.length > 0) {
    srcSet = widths.map((w) => `${src}?w=${w} ${w}w`).join(', ');
  }
  const w = width ?? variant?.width;
  const h = height ?? variant?.height;
  return (
    <img
      src={resolved}
      srcSet={srcSet}
      sizes={srcSet ? sizes ?? (w ? `${w}px` : '100vw') : undefined}
      width={w}
      height={h}
      loading={eager ? 'eager' : 'lazy'}
      {...(eager ? { fetchpriority: 'high' } : {})}
      decoding="async"
      {...rest}
    />
  );
}