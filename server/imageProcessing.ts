import type { StoredArt } from './artStore';

/** Longest side of a served cover; box faces are a few hundred pixels on screen at most. */
const MAX_ART_SIZE = 512;
/** A front cover asked `?size=large`: the box in hand, held up to the eye, fills more than 512 px of the screen. */
export const LARGE_ART_SIZE = 1024;
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
 * Downscales to at most `maxSize` px (`MAX_ART_SIZE` by default) and re-encodes as WebP (alpha kept), typically 5–10x smaller than
 * the libretro PNG. Falls back to the untouched bytes when sharp is missing or the image is odd.
 */
export async function shrinkArt(png: Buffer, maxSize = MAX_ART_SIZE): Promise<StoredArt> {
  const original: StoredArt = { body: png, contentType: sniffType(png) };
  const sharp = await loadSharp();
  if (!sharp) return original;
  try {
    const body = await sharp(png)
      .resize({ width: maxSize, height: maxSize, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
    return { body, contentType: 'image/webp' };
  } catch (err) {
    console.warn('[art] could not process image, serving original:', err instanceof Error ? err.message : err);
    return original;
  }
}

/** PNG or JPEG, from the file's first bytes (a scan may be either). */
function sniffType(bytes: Buffer): string {
  return bytes[0] === 0xff && bytes[1] === 0xd8 ? 'image/jpeg' : 'image/png';
}
