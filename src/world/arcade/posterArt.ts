import type * as THREE from 'three';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { repaintWhenFontLoads } from '@/graphics/fontReady';
import { PIXEL_FONT } from './games/ArcadeGame';
import type { Sprite, SpriteInks } from './games/sprite';

/** A one-sheet for an arcade game: its sky, its hero and its words. */
export interface PosterSpec {
  /** The title, a line per entry, in chrome pixel letters at the top. */
  title: readonly string[];
  /** The tagline in gold near the foot, and the small print under it. */
  tagline: string;
  small: string;
  /** The sky, top to horizon, and the sun's two colours (top, bottom). */
  sky: readonly [string, string, string];
  sun: readonly [string, string];
  /** The hero over the horizon: a game's sprite blown up (pixels kept square), or a painter of its own. */
  hero?: { sprite: Sprite; inks: SpriteInks; scale: number; frame?: number };
  figure?: (ctx: CanvasRenderingContext2D, W: number, H: number) => void;
  /** A few more of the sprite scattered small across the sky (an alien fleet, falling stars). */
  swarm?: { sprite: Sprite; inks: SpriteInks; scale: number; count: number };
}

const W = 500;
const H = 700;

/**
 * Paints an arcade one-sheet at 500 x 700: a synthwave sunset (striped sun, a grid running to the
 * horizon, the hall's skyline in black), the game's hero blown up from its own sprite, the title in
 * chrome pixel letters, the tagline. Repainted once the pixel face lands (`repaintWhenFontLoads`).
 */
export function paintArcadePoster(spec: PosterSpec): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(W, H);
  const paint = (): void => paintSheet(ctx, spec);
  paint();
  const texture = toTexture(canvas, 'facing');
  repaintWhenFontLoads(`56px ${PIXEL_FONT}`, () => {
    paint();
    texture.needsUpdate = true;
  });
  return texture;
}

function paintSheet(ctx: CanvasRenderingContext2D, spec: PosterSpec): void {
  const horizon = H * 0.62;
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, spec.sky[0]);
  sky.addColorStop(0.7, spec.sky[1]);
  sky.addColorStop(1, spec.sky[2]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, horizon);
  ctx.fillStyle = '#0a0510';
  ctx.fillRect(0, horizon, W, H - horizon);
  // The striped sun going down.
  ctx.save();
  ctx.beginPath();
  ctx.arc(W / 2, horizon, 150, Math.PI, 0);
  ctx.clip();
  const sun = ctx.createLinearGradient(0, horizon - 150, 0, horizon);
  sun.addColorStop(0, spec.sun[0]);
  sun.addColorStop(1, spec.sun[1]);
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = spec.sky[2];
  for (let y = horizon - 60; y < horizon; y += 18) ctx.fillRect(0, y, W, 6);
  ctx.restore();
  // The grid running to the horizon.
  ctx.strokeStyle = spec.sun[1];
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 2;
  for (let i = -8; i <= 8; i++) {
    ctx.beginPath();
    ctx.moveTo(W / 2 + i * 14, horizon);
    ctx.lineTo(W / 2 + i * 90, H);
    ctx.stroke();
  }
  for (let k = 1; k < 9; k++) {
    const y = horizon + (H - horizon) * Math.pow(k / 9, 1.8);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // The swarm across the sky, then the hero over the sun.
  const smoothing = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  if (spec.swarm) {
    const { sprite, inks, scale, count } = spec.swarm;
    for (let i = 0; i < count; i++) {
      const x = 40 + ((i * 137) % (W - 80));
      const y = 230 + ((i * 71) % 120);
      blit(ctx, sprite, inks, x, y, scale, i);
    }
  }
  if (spec.hero) blit(ctx, spec.hero.sprite, spec.hero.inks, W / 2, horizon - (spec.hero.sprite.height * spec.hero.scale) / 2 - 10, spec.hero.scale, spec.hero.frame ?? 0);
  ctx.imageSmoothingEnabled = smoothing;
  spec.figure?.(ctx, W, H);
  // The title in chrome, the tagline in gold, the small print.
  const size = Math.min(60, Math.floor((W - 40) / Math.max(...spec.title.map((line) => line.length))));
  const chrome = ctx.createLinearGradient(0, 40, 0, 60 + size * spec.title.length * 1.3);
  chrome.addColorStop(0, '#ffffff');
  chrome.addColorStop(0.5, '#9ad6ff');
  chrome.addColorStop(0.52, '#3a2a6a');
  chrome.addColorStop(1, '#ffb3c6');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `${size}px ${PIXEL_FONT}`;
  spec.title.forEach((line, i) => {
    const y = 40 + size + i * size * 1.3;
    ctx.fillStyle = '#12051f';
    ctx.fillText(line, W / 2 + 4, y + 4);
    ctx.fillStyle = chrome;
    ctx.fillText(line, W / 2, y);
  });
  ctx.fillStyle = '#ffd23a';
  ctx.font = `${Math.min(24, Math.floor((W - 30) / spec.tagline.length))}px ${PIXEL_FONT}`;
  ctx.fillText(spec.tagline, W / 2, H - 70);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = `${Math.min(13, Math.floor((W - 30) / spec.small.length))}px ${PIXEL_FONT}`;
  ctx.fillText(spec.small, W / 2, H - 36);
}

/** `sprite` drawn `scale` times its size, centred on (x, y), pixels square (smoothing is off). */
function blit(ctx: CanvasRenderingContext2D, sprite: Sprite, inks: SpriteInks, x: number, y: number, scale: number, frame: number): void {
  ctx.save();
  ctx.translate(Math.round(x - (sprite.width * scale) / 2), Math.round(y - (sprite.height * scale) / 2));
  ctx.scale(scale, scale);
  sprite.draw(ctx, 0, 0, inks, frame);
  ctx.restore();
}
