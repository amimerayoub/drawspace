const LEGACY_ASSET = /^(\/assets\/[^?#]+)\.(?:png|jpe?g)$/i;

/* Stored catalog rows may reference pre-WebP paths; API responses always
   return the optimized .webp path so clients use one consistent URL. */
export function assetPath(value: unknown): string {
  const raw = String(value ?? '');
  const match = raw.match(LEGACY_ASSET);
  return match ? `${match[1]}.webp` : raw;
}