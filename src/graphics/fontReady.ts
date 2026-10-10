/**
 * Canvas text drawn before its web font has landed takes the fallback face for good (a canvas never
 * re-lays out). The painters of signs, marquees and screens painted once call this after painting:
 * when `font` (a CSS font shorthand, e.g. `16px "Press Start 2P"`) is one of `ui/fonts.css`'s faces
 * still on its way, it is fetched and `repaint` runs once it is there (the caller sets its texture's
 * `needsUpdate`). Nothing happens when the face is already loaded, or is not a web font at all.
 */
export function repaintWhenFontLoads(font: string, repaint: () => void): void {
  const fonts = typeof document === 'undefined' ? undefined : document.fonts;
  if (!fonts || fonts.check(font)) return;
  fonts.load(font).then(
    (faces) => {
      if (faces.length) repaint();
    },
    () => {},
  );
}

/** The web faces the canvases paint with (signs, tags, marquees, screens), fetched at start (`loadCanvasFaces`). */
const CANVAS_FACES = ['16px "Press Start 2P"', '400 24px Caveat', '700 24px Caveat', '24px "Permanent Marker"'];

/**
 * Fetches the faces the canvases paint with as the game starts, so the signs and tags of a zone built later (a
 * shop, the arcade, the market) are lettered in them straight away: a canvas does not ask for a face the way a page
 * does, and a face no page element uses is never fetched until something draws with it.
 */
export function loadCanvasFaces(): void {
  const fonts = typeof document === 'undefined' ? undefined : document.fonts;
  if (!fonts) return;
  for (const face of CANVAS_FACES) fonts.load(face).catch(() => {});
}
