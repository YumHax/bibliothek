import type { Game } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import { createCanvas } from '@/graphics/canvas';
import { libretroMirrors } from '@/covers/LibretroCoverProvider';
import { formatCount } from '@/ui/money';
import type { CollectionSummary } from './collectionSummary';

/*
 * The collection as one picture to share: a dark card with the title, the counts per platform, the
 * worth, the three proudest copies large, then every cover in a grid (capped: a big collection ends
 * "and N more"). Covers come through the art proxy (same origin, so the canvas stays exportable), the
 * GitHub mirror if it fails, else a made-up box in the platform's colour.
 */

const WIDTH = 1600;
const PAD = 64;
const COLUMNS = 12;
const GAP = 14;
const CELL_W = (WIDTH - PAD * 2 - GAP * (COLUMNS - 1)) / COLUMNS;
/** Covers are drawn into a 5:7 cell (most boxes are close to it), fitted inside. */
const CELL_H = CELL_W * 1.4;
const PRIDE_W = 260;
const PRIDE_H = PRIDE_W * 1.4;
/** More covers than this and the grid ends with "and N more" (the picture stays shareable). */
const MAX_GRID = 144;
const LOADS_AT_ONCE = 8;
const LOAD_TIMEOUT_MS = 8000;

const INK = '#ece9e2';
const DIM = 'rgba(236, 233, 226, 0.62)';
const GOLD = '#d4a52a';
const BACK = '#14141b';

/** The card as a PNG blob. `coverUrl` is a game's front cover (the panels' thumbnails), `who` the line under the title. */
export async function collectionCard(summary: CollectionSummary, coverUrl: (game: Game) => string | undefined, who: string): Promise<Blob> {
  await fontsReady();
  const shown = summary.games.slice(0, MAX_GRID);
  const rows = Math.ceil(shown.length / COLUMNS);
  const prideTop = 300;
  const gridTop = prideTop + (summary.pride.length ? PRIDE_H + 150 : 0);
  const more = summary.games.length - shown.length;
  const height = gridTop + rows * (CELL_H + GAP) + (more > 0 ? 70 : 0) + PAD + 30;
  const [canvas, ctx] = createCanvas(WIDTH, Math.round(height));

  ctx.fillStyle = BACK;
  ctx.fillRect(0, 0, WIDTH, height);
  const glow = ctx.createRadialGradient(WIDTH * 0.2, 0, 50, WIDTH * 0.2, 0, WIDTH * 0.9);
  glow.addColorStop(0, 'rgba(212, 165, 42, 0.16)');
  glow.addColorStop(1, 'rgba(212, 165, 42, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, height);

  // The title and the sums.
  ctx.fillStyle = INK;
  ctx.font = `86px 'DM Serif Display', Georgia, serif`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('The collection', PAD, PAD + 80);
  ctx.fillStyle = DIM;
  ctx.font = `28px system-ui, sans-serif`;
  const games = summary.games.length;
  ctx.fillText(`${who} · ${games} game${games === 1 ? '' : 's'} · worth about ${formatCount(summary.value)} coins`, PAD, PAD + 130);

  // One chip per platform, in its colour.
  let x = PAD;
  ctx.font = `bold 24px system-ui, sans-serif`;
  for (const { platform, count } of summary.platforms) {
    const label = `${platform.shortName}  ${count}`;
    const w = ctx.measureText(label).width + 36;
    if (x + w > WIDTH - PAD) break;
    ctx.fillStyle = hex(platform.accentColor);
    roundRect(ctx, x, PAD + 160, w, 46, 23);
    ctx.fill();
    ctx.fillStyle = '#101014';
    ctx.fillText(label, x + 18, PAD + 192);
    x += w + 12;
  }

  const images = await loadAll([...summary.pride.map((p) => p.game), ...shown], coverUrl);

  // The pride of the shelves.
  if (summary.pride.length) {
    ctx.fillStyle = GOLD;
    ctx.font = `bold 22px system-ui, sans-serif`;
    ctx.fillText('PRIDE OF THE SHELVES', PAD, prideTop + 10);
    summary.pride.forEach((p, i) => {
      const px = PAD + i * (PRIDE_W + 60);
      const py = prideTop + 34;
      drawCover(ctx, p.game, images.get(p.game.id) ?? null, px, py, PRIDE_W, PRIDE_H, true);
      ctx.fillStyle = INK;
      ctx.font = `24px 'DM Serif Display', Georgia, serif`;
      ctx.fillText(clip(ctx, `${p.grail ? '★ ' : ''}${p.game.title}`, PRIDE_W + 40), px, py + PRIDE_H + 40);
      ctx.fillStyle = DIM;
      ctx.font = `20px system-ui, sans-serif`;
      ctx.fillText(`${getPlatform(p.game.platform).shortName} · about ${formatCount(p.value)} coins`, px, py + PRIDE_H + 70);
    });
  }

  // Every cover.
  shown.forEach((game, i) => {
    const cx = PAD + (i % COLUMNS) * (CELL_W + GAP);
    const cy = gridTop + Math.floor(i / COLUMNS) * (CELL_H + GAP);
    drawCover(ctx, game, images.get(game.id) ?? null, cx, cy, CELL_W, CELL_H, false);
  });
  if (more > 0) {
    ctx.fillStyle = DIM;
    ctx.font = `26px system-ui, sans-serif`;
    ctx.fillText(`…and ${more} more on the shelves`, PAD, gridTop + rows * (CELL_H + GAP) + 40);
  }
  ctx.fillStyle = 'rgba(236, 233, 226, 0.35)';
  ctx.font = `18px system-ui, sans-serif`;
  ctx.textAlign = 'right';
  ctx.fillText('Bibliothek · box art: libretro-thumbnails', WIDTH - PAD, height - PAD / 2);
  ctx.textAlign = 'left';

  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('the card could not be drawn'))), 'image/png'));
}

/** A cover fitted in its cell (centred, its own proportions), or a made-up box: platform colour, the title. */
function drawCover(ctx: CanvasRenderingContext2D, game: Game, image: HTMLImageElement | null, x: number, y: number, w: number, h: number, big: boolean): void {
  ctx.save();
  if (image) {
    const scale = Math.min(w / image.naturalWidth, h / image.naturalHeight);
    const iw = image.naturalWidth * scale;
    const ih = image.naturalHeight * scale;
    const ix = x + (w - iw) / 2;
    const iy = y + (h - ih);
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = big ? 24 : 10;
    ctx.shadowOffsetY = big ? 8 : 4;
    try {
      ctx.drawImage(image, ix, iy, iw, ih);
      ctx.restore();
      return;
    } catch {
      // A tainted or broken image: the made-up box below.
    }
  }
  const accent = getPlatform(game.platform).accentColor;
  ctx.fillStyle = hex(accent);
  roundRect(ctx, x, y, w, h, 6);
  ctx.fill();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.fillRect(x, y + h * 0.72, w, h * 0.28);
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${big ? 26 : 13}px system-ui, sans-serif`;
  wrap(ctx, game.title, x + w * 0.08, y + h * 0.16, w * 0.84, big ? 30 : 15, 5);
  ctx.restore();
}

/** The covers, a few at a time; a game whose cover will not load is simply absent from the map. */
async function loadAll(games: readonly Game[], coverUrl: (game: Game) => string | undefined): Promise<Map<string, HTMLImageElement>> {
  const out = new Map<string, HTMLImageElement>();
  const queue = [...new Map(games.map((g) => [g.id, g])).values()];
  const worker = async (): Promise<void> => {
    for (let game = queue.shift(); game; game = queue.shift()) {
      const url = coverUrl(game);
      if (!url) continue;
      for (const candidate of [url, ...libretroMirrors(url)]) {
        const image = await loadImage(candidate);
        if (image) {
          out.set(game.id, image);
          break;
        }
      }
    }
  };
  await Promise.all(Array.from({ length: LOADS_AT_ONCE }, worker));
  return out;
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    const timer = window.setTimeout(() => done(null), LOAD_TIMEOUT_MS);
    const done = (result: HTMLImageElement | null): void => {
      window.clearTimeout(timer);
      image.onload = image.onerror = null;
      resolve(result);
    };
    image.onload = () => done(image.naturalWidth > 0 ? image : null);
    image.onerror = () => done(null);
    image.src = url;
  });
}

async function fontsReady(): Promise<void> {
  try {
    await Promise.race([document.fonts.load(`86px 'DM Serif Display'`), new Promise((r) => window.setTimeout(r, 1500))]);
  } catch {
    // The fallback serif will do.
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, line: number, maxLines: number): void {
  const words = text.split(/\s+/);
  let current = '';
  let lines = 0;
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width > width && current) {
      ctx.fillText(current, x, y + lines * line);
      if (++lines >= maxLines) return;
      current = word;
    } else current = next;
  }
  if (current) ctx.fillText(current, x, y + lines * line);
}

function clip(ctx: CanvasRenderingContext2D, text: string, width: number): string {
  if (ctx.measureText(text).width <= width) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > width) t = t.slice(0, -1);
  return `${t}…`;
}

const hex = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;
