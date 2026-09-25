import type * as THREE from 'three';
import type { Game } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import { createCanvas, drawBarcode, drawImageCover, drawSeal, fitFontSize, roundRect, toTexture, wrapLines, FONT } from './canvasUtils';
import { contrastText, css } from './palette';

/** Layout width: every size below is in these units. */
const WIDTH_PX = 640;
/** Canvas height the layout is scaled down to: plenty for a box held at arm's length, a third of the pixels. */
const HEIGHT_PX = 512;
const MARGIN = 36;
const FOOTER_H = 156;
const DESC_LINE_H = 25;

/** Fields the catalog may grow later; read without depending on them. */
type GameExtras = { players?: string | number };

/**
 * Generated back cover laid out like a real one: title band with the platform tag, the
 * publisher / developer / year line, up to two framed screenshots (in-game `screenshot` and the
 * optional `titleScreen`), the description as a text block, then a footer with the players /
 * genre facts, an "official seal" roundel and a barcode.
 */
export function createBackTexture(
  game: Game,
  accent: THREE.Color,
  screenshot: CanvasImageSource | null,
  anisotropy: number,
  titleScreen: CanvasImageSource | null = null,
): THREE.CanvasTexture {
  const platform = getPlatform(game.platform);
  const { width, height } = platform.boxDimensions;
  const w = WIDTH_PX;
  const h = Math.round((w * height) / width);
  const scale = Math.min(1, HEIGHT_PX / h);
  const [canvas, ctx] = createCanvas(Math.round(w * scale), Math.round(h * scale));
  ctx.scale(scale, scale);
  const m = MARGIN;
  const inner = w - m * 2;
  const footerTop = h - FOOTER_H;

  // Background: very dark version of the accent.
  ctx.fillStyle = css(accent.clone().multiplyScalar(0.2));
  ctx.fillRect(0, 0, w, h);

  // --- Title band -----------------------------------------------------------------------------
  const bandH = Math.round(Math.min(110, Math.max(72, h * 0.105)));
  ctx.fillStyle = css(accent);
  ctx.fillRect(0, 0, w, bandH);

  ctx.font = `bold 22px ${FONT}`;
  const pillW = Math.round(ctx.measureText(platform.shortName).width) + 28;
  const pillH = 36;
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  roundRect(ctx, w - m - pillW, (bandH - pillH) / 2, pillW, pillH, 6);
  ctx.fill();
  ctx.fillStyle = '#f5f5f5';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(platform.shortName, w - m - pillW / 2, bandH / 2);

  const titleMaxW = inner - pillW - 16;
  const titleSize = fitFontSize(ctx, game.title, titleMaxW, 42, 26, FONT);
  const titleLines = ctx.measureText(game.title).width > titleMaxW ? wrapLines(ctx, game.title, titleMaxW, 2) : [game.title];
  ctx.fillStyle = contrastText(accent);
  ctx.textAlign = 'left';
  const titleLineH = titleSize * 1.08;
  const titleY = bandH / 2 - ((titleLines.length - 1) * titleLineH) / 2;
  titleLines.forEach((line, i) => ctx.fillText(line, m, titleY + i * titleLineH));

  // --- Publisher / developer / year ---------------------------------------------------------
  let y = bandH + 18;
  ctx.textBaseline = 'top';
  ctx.font = `17px ${FONT}`;
  ctx.fillStyle = '#d8d8d8';
  const year = game.releaseDate?.slice(0, 4);
  const credits = [game.publisher, game.developer !== game.publisher ? game.developer : undefined, year].filter(Boolean).join(' · ');
  ctx.fillText(credits, m, y);
  if (game.region) {
    ctx.textAlign = 'right';
    ctx.fillStyle = '#9c9c9c';
    ctx.fillText(game.region.toUpperCase(), w - m, y + 1);
    ctx.textAlign = 'left';
  }
  y += 34;
  rule(ctx, m, y, inner);
  y += 16;

  // --- Screenshots ----------------------------------------------------------------------------
  const shots = [
    { img: screenshot, caption: 'In game' },
    { img: titleScreen, caption: 'Title screen' },
  ].filter((s) => s.img);
  const count = Math.max(1, shots.length);
  const gap = 16;
  const captionH = 22;
  let frameW = count === 2 ? Math.floor((inner - gap) / 2) : Math.round(inner * 0.72);
  let frameH = Math.round(frameW * 0.75);
  // Leave room for at least three lines of description.
  const maxFrameH = footerTop - y - captionH - 24 - (game.description ? 3 * DESC_LINE_H : 0);
  if (frameH > maxFrameH) {
    frameH = Math.max(60, maxFrameH);
    frameW = Math.round(frameH / 0.75);
  }
  const rowW = count * frameW + (count - 1) * gap;
  let x = m + Math.round((inner - rowW) / 2);
  for (let i = 0; i < count; i++) {
    const shot = shots[i];
    ctx.fillStyle = '#000';
    ctx.fillRect(x - 4, y - 4, frameW + 8, frameH + 8);
    if (!shot?.img || !drawImageCover(ctx, shot.img, x, y, frameW, frameH)) drawNoScreenshot(ctx, x, y, frameW, frameH);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 2.5, y - 2.5, frameW + 5, frameH + 5);
    ctx.font = `12px ${FONT}`;
    ctx.fillStyle = '#9a9a9a';
    ctx.textAlign = 'center';
    ctx.fillText((shot?.caption ?? 'Screenshot').toUpperCase(), x + frameW / 2, y + frameH + 9);
    ctx.textAlign = 'left';
    x += frameW + gap;
  }
  y += frameH + captionH + 24;

  // --- Description ----------------------------------------------------------------------------
  if (game.description) {
    ctx.font = `18px ${FONT}`;
    ctx.fillStyle = '#e8e8e8';
    const maxLines = Math.floor((footerTop - 14 - y) / DESC_LINE_H);
    if (maxLines > 0) {
      for (const line of wrapLines(ctx, game.description, inner, maxLines)) {
        ctx.fillText(line, m, y);
        y += DESC_LINE_H;
      }
    }
  }

  // --- Footer ---------------------------------------------------------------------------------
  rule(ctx, m, footerTop, inner);
  const barcodeW = 180;
  const barcodeH = 72;
  const barcodeX = w - m - barcodeW;
  const barcodeY = footerTop + 16;
  drawBarcode(ctx, barcodeX, barcodeY, barcodeW, barcodeH, game.id);
  const sealR = 32;
  const sealX = barcodeX - 22 - sealR;
  drawSeal(ctx, sealX, barcodeY + barcodeH / 2, sealR, 'Official Seal');

  const facts: { label: string; value: string }[] = [];
  const players = (game as Game & GameExtras).players;
  if (players !== undefined && players !== null && players !== '') facts.push({ label: 'Players', value: String(players) });
  if (game.genre) facts.push({ label: 'Genre', value: game.genre });
  if (game.region && facts.length < 2) facts.push({ label: 'Region', value: game.region });
  const factsRight = sealX - sealR - 16;
  const colW = facts.length ? Math.min(170, Math.floor((factsRight - m) / facts.length)) : 0;
  facts.forEach((fact, i) => {
    const fx = m + i * colW;
    ctx.font = `bold 11px ${FONT}`;
    ctx.fillStyle = '#8f8f8f';
    ctx.fillText(fact.label.toUpperCase(), fx, footerTop + 20);
    const size = fitFontSize(ctx, fact.value, colW - 14, 20, 13, FONT);
    ctx.font = `bold ${size}px ${FONT}`;
    ctx.fillStyle = '#f2f2f2';
    ctx.fillText(fact.value, fx, footerTop + 38);
  });

  ctx.textBaseline = 'bottom';
  ctx.font = `12px ${FONT}`;
  ctx.fillStyle = '#8a8a8a';
  const copyright = [year ? `© ${year}` : undefined, game.publisher].filter(Boolean).join(' ');
  if (copyright) ctx.fillText(copyright, m, h - 22);
  ctx.textAlign = 'right';
  ctx.fillText(platform.name, w - m, h - 22);

  return toTexture(canvas, anisotropy);
}

function rule(ctx: CanvasRenderingContext2D, x: number, y: number, w: number): void {
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(x, y, w, 1);
}

function drawNoScreenshot(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = '#151515';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#555';
  ctx.font = `16px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('No screenshot', x + w / 2, y + h / 2);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
}
