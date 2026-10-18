import type * as THREE from 'three';
import type { Game } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import { productCode, regionOf } from '@/catalog/productCode';
import { drawBarcode, drawImageCover, fitFontSize, fitParagraph, layoutCanvas, roundRect, toTexture, wrapLines, FONT } from '@/covers/generated/canvasUtils';
import { contrastText, css } from '@/covers/generated/palette';
import { createManualCoverTexture } from '@/covers/generated/ManualCover';
import { HAND } from '@/world/shop/common/lettering';
import { anisotropyFor } from '@/graphics/canvas';
import { fnv1a, lcg } from '@/random';
import { controlsText, PAD_NAMES, type PageContent, type Paper } from './paperContents';

/** Every page is laid out this many units wide (its height by its proportions): the sizes below are in these units. */
const UNITS = 400;
/** A page's canvas, its longest side (px): sharp held up close and under the loupe. A sheet unfolded is bigger. */
const PAGE_PX = 1536;
const SHEET_PX = 2048;
/** The printed booklets' type: a book face for the text, the platform's sans for the headings. */
const SERIF = 'Georgia, "Times New Roman", Times, serif';
const INK = '#23211d';
const SOFT_INK = '#5e5a52';
const PENCIL = 'rgba(78, 74, 70, 0.88)';

/** What every page of a copy is drawn with: the game, its cover's accent and its cover art (null: still loading, or none). */
export interface PageLook {
  game: Game;
  accent: THREE.Color;
  art: CanvasImageSource | null;
}

/** The texture of `paper`'s page `index` (a sheet: 0 its front, 1 its back). The caller owns it. */
export function pageTexture(paper: Paper, index: number, look: PageLook): THREE.CanvasTexture {
  const page = paper.pages[index]!;
  const aspect = paper.width / paper.height;
  // The booklet's cover is the one in the box, drawn again at the same proportions.
  if (page.kind === 'cover') return createManualCoverTexture(look.game, look.accent, look.art, anisotropyFor('facing'), aspect);
  const w = UNITS;
  const h = Math.round(UNITS / aspect);
  const [canvas, ctx] = layoutCanvas(w, h, paper.folds ? SHEET_PX : PAGE_PX);
  ctx.fillStyle = paper.stock;
  ctx.fillRect(0, 0, w, h);
  grain(ctx, w, h, `${look.game.id}|${paper.kind}|${index}`);
  drawPage(ctx, w, h, page, paper, index, look);
  if (paper.folds) creases(ctx, w, h, paper.folds);
  return toTexture(canvas, 'facing');
}

function drawPage(ctx: CanvasRenderingContext2D, w: number, h: number, page: PageContent, paper: Paper, index: number, look: PageLook): void {
  switch (page.kind) {
    case 'cover':
      return;
    case 'warning':
      return warning(ctx, w, h, look);
    case 'text':
      text(ctx, w, h, page.heading, page.body, look);
      break;
    case 'controls':
      controls(ctx, w, h, look);
      break;
    case 'notes':
      notes(ctx, w, h, page.pencil);
      break;
    case 'backCover':
      return backCover(ctx, w, h, look);
    case 'catalogue':
      catalogue(ctx, w, h, page.heading, page.titles, look);
      break;
    case 'advert':
      advert(ctx, w, h, page.heading, page.body, look, index);
      break;
    case 'registration':
      return registration(ctx, w, h, page.filled, look);
    case 'postage':
      return postage(ctx, w, h, look);
    case 'poster':
      return poster(ctx, w, h, look);
    case 'map':
      return map(ctx, w, h, page.places, look);
  }
  // A bound page's number at its foot, outside edge (the inside cover and the back cover have none).
  if (paper.kind === 'booklet' || paper.kind === 'leaflet') folio(ctx, w, h, index);
}

// --- Paper ------------------------------------------------------------------------------------------

/** A few faint fibres and specks: printed paper, not a flat fill. */
function grain(ctx: CanvasRenderingContext2D, w: number, h: number, seed: string): void {
  const rng = lcg(fnv1a(seed));
  ctx.save();
  for (let i = 0; i < 220; i++) {
    ctx.fillStyle = rng() < 0.5 ? 'rgba(0, 0, 0, 0.035)' : 'rgba(255, 255, 255, 0.18)';
    ctx.fillRect(rng() * w, rng() * h, 0.6 + rng() * 1.4, 0.4 + rng() * 0.6);
  }
  ctx.restore();
}

/** A folded sheet's creases: a light ridge beside a soft shade, across and down. */
function creases(ctx: CanvasRenderingContext2D, w: number, h: number, folds: { across: number; down: number }): void {
  ctx.save();
  const line = (x0: number, y0: number, x1: number, y1: number, dx: number, dy: number): void => {
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.09)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.beginPath();
    ctx.moveTo(x0 + dx, y0 + dy);
    ctx.lineTo(x1 + dx, y1 + dy);
    ctx.stroke();
  };
  for (let i = 1; i < folds.across; i++) line((w * i) / folds.across, 0, (w * i) / folds.across, h, 1.2, 0);
  for (let i = 1; i < folds.down; i++) line(0, (h * i) / folds.down, w, (h * i) / folds.down, 0, 1.2);
  ctx.restore();
}

function folio(ctx: CanvasRenderingContext2D, w: number, h: number, index: number): void {
  ctx.fillStyle = SOFT_INK;
  ctx.font = `11px ${SERIF}`;
  ctx.textBaseline = 'bottom';
  ctx.textAlign = index % 2 === 1 ? 'left' : 'right';
  ctx.fillText(String(index), index % 2 === 1 ? 22 : w - 22, h - 14);
}

/** The heading every page of print opens with: the title in the accent, a rule under it. Returns where the text starts. */
function heading(ctx: CanvasRenderingContext2D, w: number, title: string, look: PageLook, top = 28): number {
  ctx.fillStyle = css(look.accent.clone().multiplyScalar(0.7));
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const size = fitFontSize(ctx, title, w - 56, 26, 14, FONT);
  ctx.fillText(title, 28, top);
  ctx.fillRect(28, top + size * 1.25, w - 56, 1.6);
  return top + size * 1.25 + 14;
}

/** Print set in the book face, as many lines as fit between `top` and `bottom`. */
function paragraph(ctx: CanvasRenderingContext2D, body: string, x: number, top: number, width: number, bottom: number, start = 15): void {
  const { lines, lineHeight } = fitParagraph(ctx, body, width, bottom - top, start, 8, SERIF, '', 1.42);
  ctx.fillStyle = INK;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  lines.forEach((line, i) => ctx.fillText(line, x, top + i * lineHeight, width));
}

/** Pencil in a hand, a little crooked, wrapped to `width`. */
function pencil(ctx: CanvasRenderingContext2D, note: string, x: number, y: number, width: number, lineHeight: number, size = 21): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.025);
  ctx.fillStyle = PENCIL;
  ctx.font = `400 ${size}px ${HAND}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  wrapLines(ctx, note, width).slice(0, 8).forEach((line, i) => ctx.fillText(line, 0, i * lineHeight));
  ctx.restore();
}

// --- The booklet ------------------------------------------------------------------------------------

function warning(ctx: CanvasRenderingContext2D, w: number, h: number, look: PageLook): void {
  const platform = getPlatform(look.game.platform);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.strokeRect(24, 24, w - 48, h * 0.5);
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = `bold 17px ${FONT}`;
  ctx.fillText('WARNING: PLEASE READ', w / 2, 38);
  ctx.font = `bold 11px ${FONT}`;
  ctx.fillText(`BEFORE USING YOUR ${platform.shortName.toUpperCase()}`, w / 2, 60);
  paragraph(
    ctx,
    'A very small number of people may have a seizure when shown certain flashing lights or patterns, even watching the television. Should you feel dizzy, or your eyes or muscles twitch while playing, stop at once and see a doctor. Play in a well-lit room, sit well back from the screen, and rest for a while every hour.',
    36, 84, w - 72, 24 + h * 0.5 - 10, 12,
  );
  const top = h * 0.5 + 44;
  ctx.fillStyle = INK;
  ctx.textAlign = 'left';
  ctx.font = `bold 13px ${FONT}`;
  ctx.fillText('Taking care of your game', 28, top);
  paragraph(ctx, 'Keep it out of the sun and away from heat and damp. Never touch the contacts, nor clean them with thinner or alcohol. Put it back in its case after play. Do not drop it, bend it or take it apart.', 28, top + 24, w - 56, h - 40, 12);
}

function text(ctx: CanvasRenderingContext2D, w: number, h: number, title: string, body: string, look: PageLook): void {
  const top = heading(ctx, w, title, look);
  paragraph(ctx, body, 28, top, w - 56, h - 44);
}

function controls(ctx: CanvasRenderingContext2D, w: number, h: number, look: PageLook): void {
  const top = heading(ctx, w, 'Using the Controller', look);
  const names = PAD_NAMES[look.game.platform];
  // The pad: a rounded body, the cross on the left, the buttons on the right, each named on a leader line.
  const padW = w * 0.62;
  const padH = padW * 0.42;
  const px = (w - padW) / 2;
  const py = top + 34;
  ctx.fillStyle = '#d8d6d0';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.6;
  roundRect(ctx, px, py, padW, padH, padH * 0.32);
  ctx.fill();
  ctx.stroke();
  const cx = px + padW * 0.2;
  const cy = py + padH / 2;
  const arm = padH * 0.14;
  ctx.fillStyle = '#2a2a2c';
  ctx.fillRect(cx - arm * 3, cy - arm, arm * 6, arm * 2);
  ctx.fillRect(cx - arm, cy - arm * 3, arm * 2, arm * 6);
  const buttons = Math.max(2, Math.min(4, names.length - 3));
  for (let i = 0; i < buttons; i++) {
    const bx = px + padW * (0.68 + (i % 2) * 0.14);
    const by = cy + (i < 2 ? arm * 1.2 : -arm * 1.6) - (i % 2) * arm * 0.8;
    ctx.fillStyle = css(look.accent.clone().multiplyScalar(0.85));
    ctx.beginPath();
    ctx.arc(bx, by, arm * 1.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = '#6d6b66';
  roundRect(ctx, px + padW * 0.4, cy + arm * 0.6, padW * 0.08, arm * 0.8, arm * 0.4);
  ctx.fill();
  roundRect(ctx, px + padW * 0.51, cy + arm * 0.6, padW * 0.08, arm * 0.8, arm * 0.4);
  ctx.fill();
  // The names, in two columns under the pad.
  ctx.fillStyle = INK;
  ctx.font = `bold 11px ${FONT}`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  const listTop = py + padH + 18;
  const half = Math.ceil(names.length / 2);
  names.forEach((name, i) => ctx.fillText(`• ${name}`, i < half ? 34 : w / 2 + 6, listTop + (i % half) * 16, w / 2 - 40));
  paragraph(ctx, controlsText(look.game.platform), 28, listTop + half * 16 + 14, w - 56, h - 44, 13);
}

function notes(ctx: CanvasRenderingContext2D, w: number, h: number, note: string | null): void {
  ctx.fillStyle = INK;
  ctx.font = `bold 20px ${SERIF}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('Notes', 28, 28);
  const gap = 26;
  ctx.strokeStyle = 'rgba(60, 80, 120, 0.25)';
  ctx.lineWidth = 0.8;
  for (let y = 78; y < h - 40; y += gap) {
    ctx.beginPath();
    ctx.moveTo(28, y);
    ctx.lineTo(w - 28, y);
    ctx.stroke();
  }
  if (note) pencil(ctx, note, 34, 78 + gap - 5, w - 70, gap);
}

function backCover(ctx: CanvasRenderingContext2D, w: number, h: number, look: PageLook): void {
  const { game } = look;
  const platform = getPlatform(game.platform);
  const band = h * 0.12;
  ctx.fillStyle = css(look.accent);
  ctx.fillRect(0, h - band, w, band);
  ctx.fillStyle = contrastText(look.accent);
  ctx.font = `bold ${Math.round(band * 0.36)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(platform.shortName, w / 2, h - band / 2);
  const year = game.releaseDate?.slice(0, 4) ?? '';
  const publisher = game.publisher ?? 'the publisher';
  ctx.fillStyle = SOFT_INK;
  ctx.font = `12px ${FONT}`;
  ctx.textBaseline = 'top';
  const lines = [`${game.title}${year ? ` © ${year}` : ''} ${publisher}.`, 'All rights reserved.', `Printed in ${regionOf(game).printed}`];
  lines.forEach((line, i) => ctx.fillText(line, w / 2, h * 0.52 + i * 18, w - 40));
  drawBarcode(ctx, w / 2 - 50, h * 0.52 + 70, 100, 34, game.id);
  ctx.font = `10px ${FONT}`;
  ctx.fillText(productCode(game), w / 2, h * 0.52 + 110);
}

// --- The leaflet ------------------------------------------------------------------------------------

function catalogue(ctx: CanvasRenderingContext2D, w: number, h: number, title: string, titles: readonly string[], look: PageLook): void {
  const top = heading(ctx, w, title, look);
  const cols = 2;
  const rows = Math.max(1, Math.ceil(titles.length / cols));
  const cellW = (w - 56 - 16) / cols;
  const cellH = Math.min(120, (h - top - 50) / rows);
  titles.forEach((name, i) => {
    const x = 28 + (i % cols) * (cellW + 16);
    const y = top + Math.floor(i / cols) * cellH;
    // A box shot: a coloured block by the title, its initials, the title under it.
    const hue = fnv1a(name) % 360;
    ctx.fillStyle = `hsl(${hue}, 45%, 38%)`;
    ctx.fillRect(x, y, cellH * 0.55, cellH * 0.72);
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.round(cellH * 0.2)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name.slice(0, 2).toUpperCase(), x + cellH * 0.275, y + cellH * 0.36);
    ctx.fillStyle = INK;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = `bold 12px ${FONT}`;
    wrapLines(ctx, name, cellW - cellH * 0.6, 3).forEach((line, j) => ctx.fillText(line, x + cellH * 0.62, y + 4 + j * 15));
  });
}

function advert(ctx: CanvasRenderingContext2D, w: number, h: number, title: string, body: string, look: PageLook, index: number): void {
  // A burst of colour behind the heading: the adverts shouted.
  const rng = lcg(fnv1a(`${look.game.id}|advert|${index}`));
  const cx = w / 2;
  const cy = h * 0.3;
  ctx.fillStyle = css(look.accent.clone().lerp(look.accent.clone().setRGB(1, 0.85, 0.2), 0.5));
  ctx.beginPath();
  const spikes = 14;
  for (let i = 0; i <= spikes * 2; i++) {
    const r = (i % 2 === 0 ? 0.36 : 0.26) * w * (0.92 + rng() * 0.16);
    const a = (i / (spikes * 2)) * Math.PI * 2;
    if (i === 0) ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    else ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const size = fitFontSize(ctx, title, w * 0.5, 30, 14, FONT);
  const lines = ctx.measureText(title).width > w * 0.5 ? wrapLines(ctx, title, w * 0.5, 3) : [title];
  lines.forEach((line, i) => ctx.fillText(line, cx, cy + (i - (lines.length - 1) / 2) * size * 1.1));
  paragraph(ctx, body, 32, h * 0.58, w - 64, h - 44, 15);
}

// --- The registration card --------------------------------------------------------------------------

function registration(ctx: CanvasRenderingContext2D, w: number, h: number, filled: { name: string; age: string; liked: string } | null, look: PageLook): void {
  ctx.fillStyle = css(look.accent.clone().multiplyScalar(0.75));
  ctx.fillRect(0, 0, w, h * 0.17);
  ctx.fillStyle = contrastText(look.accent.clone().multiplyScalar(0.75));
  ctx.font = `bold ${Math.round(h * 0.075)}px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('REGISTRATION CARD', 18, h * 0.085);
  ctx.textAlign = 'right';
  ctx.font = `${Math.round(h * 0.045)}px ${FONT}`;
  ctx.fillText(look.game.publisher ?? getPlatform(look.game.platform).shortName, w - 18, h * 0.085);
  const fields: [string, string | undefined][] = [
    ['Name', filled?.name],
    ['Age', filled?.age],
    ['Game', filled ? look.game.title : undefined],
    ['What did you like best?', filled?.liked],
  ];
  const rowH = (h * 0.66) / fields.length;
  fields.forEach(([label, value], i) => {
    const y = h * 0.24 + i * rowH + rowH * 0.62;
    ctx.fillStyle = SOFT_INK;
    ctx.font = `${Math.round(h * 0.045)}px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(label, 18, y);
    const from = 18 + ctx.measureText(label).width + 8;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(from, y + 2);
    ctx.lineTo(w - 18, y + 2);
    ctx.stroke();
    if (value) {
      // In blue biro, a child's careful capitals.
      ctx.fillStyle = 'rgba(30, 50, 140, 0.9)';
      ctx.font = `700 ${Math.round(h * 0.085)}px ${HAND}`;
      ctx.fillText(value, from + 6, y - 1, w - from - 24);
    }
  });
}

function postage(ctx: CanvasRenderingContext2D, w: number, h: number, look: PageLook): void {
  // The stamp's box, top right; the address, centred lower; the lines of a reply card.
  const sw = w * 0.16;
  ctx.strokeStyle = SOFT_INK;
  ctx.setLineDash([3, 3]);
  ctx.lineWidth = 1;
  ctx.strokeRect(w - sw - 16, 14, sw, sw * 1.15);
  ctx.setLineDash([]);
  ctx.fillStyle = SOFT_INK;
  ctx.font = `${Math.round(h * 0.04)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('PLACE', w - sw / 2 - 16, 14 + sw * 0.45);
  ctx.fillText('STAMP', w - sw / 2 - 16, 14 + sw * 0.6);
  ctx.fillText('HERE', w - sw / 2 - 16, 14 + sw * 0.75);
  ctx.fillStyle = INK;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `bold ${Math.round(h * 0.055)}px ${FONT}`;
  const x = w * 0.36;
  const lines = [look.game.publisher ?? 'Consumer Service', 'Consumer Service Department', 'P.O. Box 9700', 'Redmond Hills'];
  lines.forEach((line, i) => {
    if (i === 1) ctx.font = `${Math.round(h * 0.05)}px ${FONT}`;
    ctx.fillText(line, x, h * 0.45 + i * h * 0.085, w - x - 18);
  });
  ctx.fillRect(18, h * 0.88, w * 0.28, 2);
  ctx.fillRect(18, h * 0.92, w * 0.28, 2);
}

// --- The poster -------------------------------------------------------------------------------------

function poster(ctx: CanvasRenderingContext2D, w: number, h: number, look: PageLook): void {
  ctx.fillStyle = css(look.accent.clone().multiplyScalar(0.4));
  ctx.fillRect(0, 0, w, h);
  if (look.art) drawImageCover(ctx, look.art, 0, 0, w, h * 0.84);
  ctx.fillStyle = '#111111';
  ctx.fillRect(0, h * 0.84, w, h * 0.16);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fitFontSize(ctx, look.game.title.toUpperCase(), w - 40, 34, 14, FONT);
  ctx.fillText(look.game.title.toUpperCase(), w / 2, h * 0.92);
}

function map(ctx: CanvasRenderingContext2D, w: number, h: number, places: readonly string[], look: PageLook): void {
  const rng = lcg(fnv1a(`${look.game.id}|map`));
  // The sea, then an island of a wobbly coast, a dotted way from place to place, a compass.
  ctx.fillStyle = '#c9dbe0';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#e8dcb8';
  ctx.strokeStyle = '#8a7a58';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  const points = 26;
  for (let i = 0; i <= points; i++) {
    const a = (i / points) * Math.PI * 2;
    const r = 0.36 + rng() * 0.08;
    const x = w / 2 + Math.cos(a) * r * w;
    const y = h / 2 + Math.sin(a) * r * h * 1.05;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  const spots = places.map((name, i) => {
    const a = (i / places.length) * Math.PI * 2 + rng() * 0.4;
    const r = 0.1 + rng() * 0.2;
    return { name, x: w / 2 + Math.cos(a) * r * w, y: h / 2 + Math.sin(a) * r * h };
  });
  ctx.strokeStyle = '#9b3b2a';
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  spots.forEach((s, i) => (i === 0 ? ctx.moveTo(s.x, s.y) : ctx.lineTo(s.x, s.y)));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = `italic 11px ${SERIF}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const s of spots) {
    ctx.fillStyle = '#9b3b2a';
    ctx.beginPath();
    ctx.arc(s.x, s.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.fillText(s.name, s.x, s.y + 5);
  }
  // The compass rose, bottom right.
  const cx = w - 40;
  const cy = h - 44;
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 22);
  ctx.lineTo(cx + 6, cy);
  ctx.lineTo(cx, cy + 22);
  ctx.lineTo(cx - 6, cy);
  ctx.closePath();
  ctx.fill();
  ctx.font = `bold 11px ${SERIF}`;
  ctx.fillText('N', cx, cy - 36);
  ctx.textAlign = 'left';
  ctx.font = `bold 18px ${SERIF}`;
  ctx.fillText(`The World of ${look.game.title}`, 18, 14, w - 36);
}
