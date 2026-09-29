import * as THREE from 'three';
import type { Game } from '@/catalog/types';
import { boxDimensionsOf, regionOf, type MediaRegion } from '@/catalog/media';
import { createCanvas, drawImageCover, fitFontSize, hashString, roundRect, toTexture, FONT } from './canvasUtils';
import { css } from './palette';

/** Pixels along the spine's length (its height on a portrait box, its width on a landscape one). */
const LENGTH_PX = 1024;
/** The canvas is drawn at this fraction of the layout: 512 px along a 0.18 m spine is as sharp as the front cover. */
const SCALE = 0.5;
/** Heavy, condensed faces for the titles, like the logos printed on real spines. */
const TITLE_FONT = 'Impact, "Haettenschweiler", "Arial Narrow Bold", "Arial Black", sans-serif';
const CONDENSED = '"Arial Narrow", "Helvetica Neue", Arial, sans-serif';
/** A jewel case's side is its clear plastic over the tray card's spine: the print covers this share of it, centred. */
export const JEWEL_PRINT = 0.66;

/**
 * Generated box side, drawn after the real spines of each platform (LaunchBox's scans, studied per
 * platform): the text reads top to bottom, so the glyphs' tops point to the viewer's right on either
 * side, as they do on the real boxes.
 *
 * - NES: the cover's ground (black, silver, a colour), the publisher at the head, the title as a
 *   heavy logo, the red Nintendo oval over ENTERTAINMENT SYSTEM at the foot.
 * - SNES: black, the publisher (or Nintendo's oval) at the head, the title, the grey stripes at the foot.
 * - Game Boy: the cover's colour, a black GAME BOY block at the head of an American print, the
 *   title, the Nintendo oval.
 * - Genesis / Mega Drive: black with a grey grid, SEGA's blue badge, the title, the GENESIS emblem
 *   (or MEGA DRIVE in outlined letters on a European print); Sega's own later prints are red.
 * - N64: a strip of the cover's art, the title, the white NINTENDO64 box at the foot.
 * - PlayStation: the tray card's black spine behind the case's clear side, NTSC U/C (or PAL, NTSC J)
 *   in a white box, the title in a bold condensed face, the product code at the foot.
 *
 * `cover` (the front's image, when it is in) gives the N64 and Game Boy their art. `_frontEdge` is
 * kept for the callers: the drawing reads right from either side.
 */
export function createSpineTexture(game: Game, accent: THREE.Color, _frontEdge: 'left' | 'right', anisotropy: number, cover: CanvasImageSource | null = null): THREE.CanvasTexture {
  const { depth, height } = boxDimensionsOf(game);
  const across = Math.max(48, Math.round((LENGTH_PX * depth) / height));
  const [canvas, ctx] = createCanvas(Math.round(across * SCALE), LENGTH_PX * SCALE);
  ctx.scale(SCALE, SCALE);
  // Into the spine's own frame: x along it from its head, y across it from the glyphs' tops.
  ctx.translate(across, 0);
  ctx.rotate(Math.PI / 2);
  paintSpine(ctx, LENGTH_PX, across, game, accent, cover);
  return toTexture(canvas, anisotropy);
}

/**
 * The long top (and bottom) of a landscape box (the North American SNES and N64), where their spine
 * runs: left to right, the glyphs' tops towards the back (the +y face's texture runs back to front
 * down its height).
 */
export function createTopSpineTexture(game: Game, accent: THREE.Color, anisotropy: number, cover: CanvasImageSource | null = null): THREE.CanvasTexture {
  const { depth, width } = boxDimensionsOf(game);
  const across = Math.max(48, Math.round((LENGTH_PX * depth) / width));
  const [canvas, ctx] = createCanvas(LENGTH_PX * SCALE, Math.round(across * SCALE));
  ctx.scale(SCALE, SCALE);
  paintSpine(ctx, LENGTH_PX, across, game, accent, cover);
  return toTexture(canvas, anisotropy);
}

type Style = (s: SpineCtx) => void;

interface SpineCtx {
  ctx: CanvasRenderingContext2D;
  /** Length along the spine and its thickness, in layout pixels. */
  L: number;
  T: number;
  game: Game;
  accent: THREE.Color;
  region: MediaRegion;
  cover: CanvasImageSource | null;
  /** 0..1, the same for a game every time: which of a platform's usual looks it gets. */
  pick: number;
}

const STYLES: Record<Game['platform'], Style> = {
  nes(s) {
    const ground = nesGround(s.accent, s.pick);
    fill(s, css(ground));
    const light = luminance(ground) > 0.45;
    const ink = light ? '#141414' : '#f4f4f4';
    along(s, publisherOf(s.game), 0.025, 0.14, s.T * 0.3, ink, 'bold italic', FONT);
    title(s, 0.17, 0.64, logoColour(s.accent, light), light);
    nintendoOval(s, 0.67, 0.8, !light);
    // ENTERTAINMENT over SYSTEM, stacked across the spine.
    const foot = light ? '#b31d1d' : '#f0a52a';
    along(s, 'ENTERTAINMENT', 0.815, 0.975, s.T * 0.26, foot, 'bold', FONT, s.T * 0.33);
    along(s, 'SYSTEM', 0.86, 0.93, s.T * 0.26, foot, 'bold', FONT, s.T * 0.68);
  },
  snes(s) {
    fill(s, '#050505');
    const publisher = publisherOf(s.game);
    if (/nintendo/i.test(publisher)) nintendoOval(s, 0.03, 0.13, false);
    else along(s, publisher, 0.025, 0.15, s.T * 0.24, '#f2f2f2', 'bold italic', FONT);
    if (s.pick < 0.35) band(s, 0.48, 0.66, '#c8202a'); // the red stripe some had under the title
    title(s, 0.18, 0.78, logoColour(s.accent, false), false);
    along(s, 'Nintendo', 0.8, 0.86, s.T * 0.2, '#d4202a', 'bold', FONT);
    stripes(s, 0.88, 0.985);
  },
  gb(s) {
    const ground = vivid(s.accent);
    fill(s, css(ground));
    if (s.cover) art(s, 0.62, 0.9, 0.3);
    const blocked = s.region === 'na' && s.pick < 0.3; // some American prints: GAME BOY in a black block at the head
    const head = blocked ? 0.14 : 0.03;
    if (blocked) {
      band(s, 0, 0.12, '#050505');
      along(s, 'GAME BOY', 0.015, 0.105, s.T * 0.36, '#f2f2f2', 'bold', FONT);
    }
    const light = luminance(ground) > 0.45;
    title(s, head + 0.02, 0.72, light ? '#c0161e' : '#ffe04a', light);
    nintendoOval(s, 0.84, 0.965, false);
  },
  megadrive(s) {
    const sega = /sega/i.test(publisherOf(s.game));
    const red = sega && s.region === 'na' && s.pick < 0.45;
    if (red) {
      fill(s, '#c9201f');
      segaBadge(s, 0.02, 0.12);
      title(s, 0.15, 0.58, '#ffe6a0', false);
      along(s, 'GENESIS', 0.62, 0.96, s.T * 0.6, '#f4f4f4', 'bold', TITLE_FONT);
      return;
    }
    fill(s, '#0a0a0b');
    grid(s);
    if (sega) segaBadge(s, 0.02, 0.12);
    else along(s, publisherOf(s.game), 0.025, 0.13, s.T * 0.24, '#f2f2f2', 'bold italic', FONT);
    title(s, 0.16, 0.6, logoColour(s.accent, false), false);
    if (s.region === 'na') genesisEmblem(s, 0.66, 0.84);
    else outlined(s, 'MEGA DRIVE', 0.64, 0.96);
    along(s, String(1000 + (hashString(s.game.id) % 600)), 0.9, 0.98, s.T * 0.14, '#cfcfcf', 'bold', FONT);
  },
  n64(s) {
    fill(s, css(vivid(s.accent)));
    if (s.cover) art(s, 0, 0.78, 0.85);
    title(s, 0.04, 0.7, logoColour(s.accent, false), false);
    n64Box(s, 0.78, 0.97);
  },
  ps1(s) {
    // The case's clear side over the tray card: dark plastic either side of the print.
    fill(s, '#161719');
    const { ctx, T } = s;
    const margin = (T * (1 - JEWEL_PRINT)) / 2;
    ctx.save();
    ctx.translate(0, margin);
    const inner: SpineCtx = { ...s, T: T * JEWEL_PRINT };
    fill(inner, '#050505');
    if (s.region === 'eu') {
      band(inner, 0, 0.1, '#050505');
      along(inner, 'PlayStation', 0.01, 0.09, inner.T * 0.34, '#f2f2f2', 'bold', FONT);
      box(inner, 'PAL', 0.1, 0.14);
    } else {
      box(inner, s.region === 'jp' ? 'NTSC J' : 'NTSC U/C', 0.015, 0.1);
    }
    title(inner, 0.16, 0.84, s.pick < 0.3 ? logoColour(s.accent, false) : '#f4f4f4', false, CONDENSED);
    along(inner, productCode(s), 0.87, 0.985, inner.T * 0.24, '#d8d8d8', 'bold', FONT);
    ctx.restore();
    // The clear plastic catching the light along its edges.
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(0, 0, s.L, T * 0.05);
    ctx.fillRect(0, T * 0.95, s.L, T * 0.05);
  },
};

function paintSpine(ctx: CanvasRenderingContext2D, L: number, T: number, game: Game, accent: THREE.Color, cover: CanvasImageSource | null): void {
  const pick = (hashString(game.id) % 1000) / 1000;
  STYLES[game.platform]({ ctx, L, T, game, accent, region: regionOf(game), cover, pick });
}

// --- Pieces --------------------------------------------------------------------------------------

function fill(s: SpineCtx, colour: string): void {
  s.ctx.fillStyle = colour;
  s.ctx.fillRect(0, 0, s.L, s.T);
}

/** A plain band across the spine from `from` to `to` (shares of its length). */
function band(s: SpineCtx, from: number, to: number, colour: string): void {
  s.ctx.fillStyle = colour;
  s.ctx.fillRect(from * s.L, 0, (to - from) * s.L, s.T);
}

/** A strip of the cover's art over part of the spine, faded in and out at its ends. */
function art(s: SpineCtx, from: number, to: number, alpha: number): void {
  const { ctx, L, T } = s;
  if (!s.cover) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.rect(from * L, 0, (to - from) * L, T);
  ctx.clip();
  // The art turned to run along the spine, as the real ones carry the cover round the edge.
  ctx.translate(from * L, T);
  ctx.rotate(-Math.PI / 2);
  drawImageCover(ctx, s.cover, 0, 0, T, (to - from) * L);
  ctx.restore();
}

/** Text along the spine from `from` to `to` (shares of its length), centred across it, at most `size` tall. */
function along(s: SpineCtx, text: string, from: number, to: number, size: number, colour: string, weight: string, family: string, y = s.T / 2): void {
  const { ctx } = s;
  const room = (to - from) * s.L;
  const px = fitFontSize(ctx, text, room, Math.round(size), 7, family, weight);
  ctx.font = `${weight} ${px}px ${family}`;
  ctx.fillStyle = colour;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, ((from + to) / 2) * s.L, y + px * 0.04);
}

/**
 * The title as big as it fits between `from` and `to`, like a printed logo: a dark outline round a
 * bright fill (a light one on a pale ground), on two lines when one would come out too small.
 */
function title(s: SpineCtx, from: number, to: number, colour: string, onLight: boolean, family = TITLE_FONT): void {
  const { ctx, T } = s;
  const text = s.game.title;
  const room = (to - from) * s.L;
  const single = fitFontSize(ctx, text, room, Math.round(T * 0.7), 8, family);
  const parts = single < T * 0.42 ? splitTitle(text) : null;
  const lines: [string, number, number][] = parts
    ? [
        [parts[0], fitFontSize(ctx, parts[0], room, Math.round(T * 0.44), 8, family), T * 0.34],
        [parts[1], fitFontSize(ctx, parts[1], room, Math.round(T * 0.28), 8, family), T * 0.76],
      ]
    : [[text, single, T / 2 + single * 0.04]];
  const cx = ((from + to) / 2) * s.L;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const [line, px, y] of lines) {
    ctx.font = `bold ${px}px ${family}`;
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2, px * 0.12);
    ctx.strokeStyle = onLight ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.85)';
    ctx.strokeText(line, cx, y);
    ctx.fillStyle = colour;
    ctx.fillText(line, cx, y);
  }
}

/** Nintendo's red oval: outlined red with red letters (on a dark ground), or white with red letters. */
function nintendoOval(s: SpineCtx, from: number, to: number, outlined: boolean): void {
  const { ctx, L, T } = s;
  const w = (to - from) * L;
  const h = Math.min(T * 0.5, w * 0.34);
  const x = from * L;
  const y = (T - h) / 2;
  roundRect(ctx, x, y, w, h, h / 2);
  if (!outlined) {
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }
  ctx.lineWidth = Math.max(2, h * 0.09);
  ctx.strokeStyle = '#d4202a';
  ctx.stroke();
  const px = fitFontSize(ctx, 'Nintendo', w * 0.8, Math.round(h * 0.62), 7, FONT);
  ctx.font = `bold ${px}px ${FONT}`;
  ctx.fillStyle = '#d4202a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Nintendo', x + w / 2, T / 2 + px * 0.05);
}

/** The SNES's grey diagonal stripes, in a square at the foot. */
function stripes(s: SpineCtx, from: number, to: number): void {
  const { ctx, L, T } = s;
  const x0 = from * L;
  const w = (to - from) * L;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, T * 0.1, w, T * 0.8);
  ctx.clip();
  ctx.fillStyle = '#1b1b1b';
  ctx.fillRect(x0, 0, w, T);
  ctx.strokeStyle = '#8a8a8e';
  ctx.lineWidth = Math.max(2, T * 0.035);
  for (let i = -T; i < w + T; i += T * 0.085) {
    ctx.beginPath();
    ctx.moveTo(x0 + i, T);
    ctx.lineTo(x0 + i + T * 0.75, 0);
    ctx.stroke();
  }
  ctx.restore();
}

/** The Genesis spine's grey grid on black. */
function grid(s: SpineCtx): void {
  const { ctx, L, T } = s;
  const step = T / 4;
  ctx.strokeStyle = 'rgba(120,120,130,0.55)';
  ctx.lineWidth = 1.5;
  for (let x = step / 2; x < L; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, T);
    ctx.stroke();
  }
  for (let y = step / 2; y < T; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(L, y);
    ctx.stroke();
  }
}

/** SEGA in white on its blue badge. */
function segaBadge(s: SpineCtx, from: number, to: number): void {
  const { ctx, L, T } = s;
  const x = from * L;
  const w = (to - from) * L;
  const h = T * 0.5;
  ctx.fillStyle = '#1d4fb8';
  roundRect(ctx, x, (T - h) / 2, w, h, h * 0.15);
  ctx.fill();
  const px = fitFontSize(ctx, 'SEGA', w * 0.84, Math.round(h * 0.7), 7, FONT);
  ctx.font = `bold ${px}px ${FONT}`;
  ctx.fillStyle = '#f4f4f4';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('SEGA', x + w / 2, T / 2 + px * 0.05);
}

/** The Genesis emblem: GENESIS in silvered letters over a blue bar, SEGA above it. */
function genesisEmblem(s: SpineCtx, from: number, to: number): void {
  const { ctx, L, T } = s;
  const x = from * L;
  const w = (to - from) * L;
  const h = T * 0.56;
  const y = (T - h) / 2;
  const metal = ctx.createLinearGradient(0, y, 0, y + h);
  metal.addColorStop(0, '#f4f6fa');
  metal.addColorStop(0.5, '#9aa4b6');
  metal.addColorStop(1, '#e6eaf2');
  ctx.fillStyle = '#1d3f93';
  roundRect(ctx, x, y + h * 0.62, w, h * 0.3, h * 0.1);
  ctx.fill();
  const px = fitFontSize(ctx, 'GENESIS', w * 0.95, Math.round(h * 0.62), 7, TITLE_FONT);
  ctx.font = `bold ${px}px ${TITLE_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(2, px * 0.1);
  ctx.strokeStyle = '#1d3f93';
  ctx.strokeText('GENESIS', x + w / 2, y + h * 0.38);
  ctx.fillStyle = metal;
  ctx.fillText('GENESIS', x + w / 2, y + h * 0.38);
}

/** Letters drawn as white outlines only, spaced out (the European MEGA DRIVE). */
function outlined(s: SpineCtx, text: string, from: number, to: number): void {
  const { ctx, L, T } = s;
  const spaced = text.split('').join(' ');
  const px = fitFontSize(ctx, spaced, (to - from) * L, Math.round(T * 0.5), 7, FONT);
  ctx.font = `bold ${px}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(1.5, px * 0.07);
  ctx.strokeStyle = '#e8e8e8';
  ctx.strokeText(spaced, ((from + to) / 2) * L, T / 2);
}

/** The white NINTENDO64 box with its four-colour cube. */
function n64Box(s: SpineCtx, from: number, to: number): void {
  const { ctx, L, T } = s;
  const x = from * L;
  const w = (to - from) * L;
  const h = T * 0.78;
  const y = (T - h) / 2;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, w, h);
  const size = Math.min(h * 0.8, w * 0.45);
  const q = size / 2;
  const cx = x + w * 0.3;
  const cy = T / 2;
  const colours = ['#1f4fc4', '#d8262b', '#1c9a3c', '#f2c018'];
  const offsets: [number, number][] = [[-1, -1], [0, -1], [-1, 0], [0, 0]];
  offsets.forEach(([ox, oy], i) => {
    ctx.fillStyle = colours[i]!;
    ctx.fillRect(cx + ox * q, cy + oy * q, q * 0.92, q * 0.92);
  });
  const px = fitFontSize(ctx, 'NINTENDO64', w * 0.46, Math.round(h * 0.2), 6, FONT);
  ctx.font = `bold ${px}px ${FONT}`;
  ctx.fillStyle = '#1a1a1a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('NINTENDO64', x + w * 0.74, cy);
}

/** A white box with a word in it (the PlayStation's region mark). */
function box(s: SpineCtx, text: string, from: number, to: number): void {
  const { ctx, L, T } = s;
  const x = from * L;
  const w = (to - from) * L;
  const h = T * 0.62;
  ctx.fillStyle = '#f2f2f2';
  ctx.fillRect(x, (T - h) / 2, w, h);
  const px = fitFontSize(ctx, text, w * 0.86, Math.round(h * 0.62), 6, FONT);
  ctx.font = `bold ${px}px ${FONT}`;
  ctx.fillStyle = '#0a0a0a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + w / 2, T / 2 + px * 0.05);
}

// --- Words and colours ---------------------------------------------------------------------------

function publisherOf(game: Game): string {
  return (game.publisher ?? game.developer ?? 'Nintendo').replace(/\s*(Co\.|Ltd\.?|Inc\.?|America|of America|Entertainment|Corporation)\s*$/i, '').toUpperCase();
}

/** Sony's own games are SCUS-94xxx, everyone else's SLUS-0xxxx (SCES / SLES in Europe, SCPS / SLPS in Japan). */
function productCode(s: SpineCtx): string {
  const sony = /sony|scea|scee|sce/i.test(s.game.publisher ?? '');
  const zone = s.region === 'na' ? 'US' : s.region === 'jp' ? 'PS' : 'ES';
  const n = hashString(s.game.id);
  return sony ? `SC${zone}-94${String(n % 1000).padStart(3, '0')}` : `SL${zone}-0${String(n % 1500).padStart(4, '0')}`;
}

function luminance(c: THREE.Color): number {
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

/**
 * The NES spine's ground: mostly black (the black box series), else the cover's colour printed
 * strong (a silver Konami, a yellow, a purple): never the washed-out average of a busy cover.
 */
function nesGround(c: THREE.Color, pick: number): THREE.Color {
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  if (pick < 0.6 || luminance(c) < 0.2) return new THREE.Color(0x060606);
  if (hsl.s < 0.2) return new THREE.Color(0xb9b9bc); // silver
  return new THREE.Color().setHSL(hsl.h, Math.max(0.75, hsl.s), THREE.MathUtils.clamp(hsl.l, 0.42, 0.55));
}

/** The accent pushed to a printable, saturated colour (a Game Boy or N64 spine's ground). */
function vivid(c: THREE.Color): THREE.Color {
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  return new THREE.Color().setHSL(hsl.h, Math.max(0.65, hsl.s), THREE.MathUtils.clamp(hsl.l, 0.38, 0.5));
}

/**
 * A title logo's colour: the cover's hue made bright and saturated (red, orange or yellow when it
 * is too grey to carry one), dark when it sits on a pale ground.
 */
function logoColour(c: THREE.Color, onLight: boolean): string {
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  const hue = hsl.s < 0.25 ? [0.0, 0.07, 0.13][hashString(css(c)) % 3]! : hsl.h;
  return css(new THREE.Color().setHSL(hue, 0.85, onLight ? 0.32 : 0.56));
}

/** "Zelda II: The Adventure of Link" -> ["Zelda II", "The Adventure of Link"]; long titles without a separator split near the middle. */
function splitTitle(text: string): [string, string] | null {
  const separated = text.match(/^(.+?)\s*[:–—-]\s+(.+)$/);
  if (separated) return [separated[1]!, separated[2]!];
  const words = text.split(' ');
  if (words.length < 3) return null;
  let best = 1;
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const diff = Math.abs(words.slice(0, i).join(' ').length - text.length / 2);
    if (diff < bestDiff) {
      best = i;
      bestDiff = diff;
    }
  }
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
}
