import type { StoredArt } from './artStore';

/** Longest side of a served cover; box faces are a few hundred pixels on screen at most. */
export const MAX_ART_SIZE = 512;
const WEBP_QUALITY = 82;

type Sharp = typeof import('sharp');
let sharpModule: Promise<Sharp | null> | undefined;

/** Loads `sharp` once; null when the native module is unavailable on this host. */
function loadSharp(): Promise<Sharp | null> {
  sharpModule ??= import('sharp')
    .then((m) => m.default ?? (m as unknown as Sharp))
    .catch((err: unknown) => {
      console.warn('[art] sharp unavailable, serving original images:', err instanceof Error ? err.message : err);
      return null;
    });
  return sharpModule;
}

/**
 * Downscales to at most `MAX_ART_SIZE` px and re-encodes as WebP, typically 5–10x smaller than
 * the libretro PNG. Falls back to the untouched bytes when sharp is missing or the image is odd.
 */
export async function shrinkArt(png: Buffer): Promise<StoredArt> {
  const original: StoredArt = { body: png, contentType: 'image/png' };
  const sharp = await loadSharp();
  if (!sharp) return original;
  try {
    const body = await sharp(png)
      .resize({ width: MAX_ART_SIZE, height: MAX_ART_SIZE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
    return { body, contentType: 'image/webp' };
  } catch (err) {
    console.warn('[art] could not process image, serving original:', err instanceof Error ? err.message : err);
    return original;
  }
}
