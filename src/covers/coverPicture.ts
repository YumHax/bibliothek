import type { Game } from '@/catalog/types';
import type { BoxArtLoader } from './BoxArtLoader';

/** How long a banner waits for the cover before it goes up with what there is (the generated front, at worst). */
const WAIT_MS = 1500;
/** The picture's size in CSS pixels (a box front, portrait), drawn at twice that for sharp screens. */
const WIDTH = 72;
const HEIGHT = 100;

/**
 * A game's front as a small canvas, for a notice's picture slot (`RewardNotice.picture`): the art loader's front once
 * it is in, or after `WAIT_MS` the set it has so far (a generated front). Null when nothing could be drawn.
 */
export function coverPicture(covers: BoxArtLoader, game: Game): Promise<HTMLCanvasElement | null> {
  return new Promise((resolve) => {
    let latest: CanvasImageSource | null = null;
    let settled = false;
    const onUpdate = (art: { front: { image: unknown } }): void => {
      latest = drawable(art.front.image) ?? latest;
    };
    const finish = (source: CanvasImageSource | null): void => {
      if (settled) return;
      settled = true;
      covers.release(game, { onUpdate });
      resolve(source ? draw(source) : null);
    };
    covers.load(game, { onUpdate }).then(
      (art) => finish(drawable(art.front.image) ?? latest),
      () => finish(latest),
    );
    window.setTimeout(() => finish(latest), WAIT_MS);
  });
}

function drawable(image: unknown): CanvasImageSource | null {
  if (image instanceof HTMLImageElement) return image.complete && image.naturalWidth > 0 ? image : null;
  if (image instanceof HTMLCanvasElement || (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap)) return image;
  return null;
}

function draw(source: CanvasImageSource): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH * 2;
  canvas.height = HEIGHT * 2;
  canvas.style.width = `${WIDTH}px`;
  canvas.style.height = `${HEIGHT}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  try {
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  } catch {
    // A cross-origin image without CORS would taint nothing here (drawing is allowed); a broken one throws.
    return null;
  }
  return canvas;
}
