import { Sheet, type Rng, azimuthOf, azimuthX, heightY, sizePx } from './Sheet';
import { pick } from './paint';
import type { Cell } from './sprites';

/**
 * How the painted people look: the palettes they are dressed from, the pen the sprite figures
 * (walkers, the balcony and shop folk) are drawn with, and the seated figure stamped on the
 * scenery (picnics, café terraces).
 */

/** Shirts of the walkers and of everyone seated in the scenery. */
export const SHIRTS = ['#d94f3a', '#3b6fb3', '#e8e2d2', '#2f2f36', '#6fa35e', '#f0c94a', '#8c4f9e', '#c9c9c9'];
/** Shirts of the balcony and shop folk (`Folk`): the same colours in another order, a slate grey for the pale grey. */
export const FOLK_SHIRTS = ['#3b6fb3', '#d94f3a', '#2f2f36', '#6fa35e', '#e8e2d2', '#8c4f9e', '#f0c94a', '#5a6a7a'];
export const TROUSERS = ['#2b2f3d', '#1c1c1e', '#4b5563', '#6b5a48'];
export const SKINS = ['#f1c9a5', '#d9a071', '#8d5a3b', '#f7d9c0', '#5b3a25'];
export const HAIRS = ['#2a1f14', '#5a3a1a', '#c9a34a', '#111111', '#8a8a8a'];

/** One figure's clothes and colouring. */
export interface Look {
  shirt: string;
  trousers: string;
  skin: string;
  hair: string;
}

/** Pixels per metre of the standing figures' atlas cells, and the margin under their feet. */
export const FIGURE_SCALE = 37.7;
export const FIGURE_MARGIN = 3;

/** A painter for figure parts: rounded rectangles in metres about the cell's centre line, feet at the bottom margin. */
export function figurePen(ctx: CanvasRenderingContext2D, cell: Cell): { cx: number; foot: number; rect: (x: number, yBottom: number, w: number, h: number, fill: string) => void } {
  const s = FIGURE_SCALE;
  const cx = cell.x + cell.w / 2;
  const foot = cell.y + cell.h - FIGURE_MARGIN;
  const rect = (x: number, yBottom: number, w: number, h: number, fill: string): void => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.roundRect(cx + x * s - (w * s) / 2, foot - yBottom * s - h * s, w * s, h * s, Math.min(w, h) * s * 0.35);
    ctx.fill();
  };
  return { cx, foot, rect };
}

/** How a seated figure sits: metres, except where said. */
export interface SeatedPose {
  /** Torso width, the height it sits at and the height of its shoulders. */
  width: number;
  seat: number;
  shoulders: number;
  /** Share of the seat-to-shoulders height the torso fills (the rest is lap). */
  torso: number;
  /** Head centre above the shoulders, in head radii. */
  neck: number;
  /** Smallest torso width and head radius, pixels (so a distant figure never vanishes). */
  minWidth: number;
  minHead: number;
  /** Folded legs on the ground in front, in one of these colours; none when absent. */
  legs?: readonly string[];
}

/** A seated figure at (x, z) facing the eye, stamped on the scenery: maybe folded legs, a torso and a head. */
export function paintSeated(sheet: Sheet, random: Rng, x: number, z: number, pose: SeatedPose): void {
  const d = Math.hypot(x, z);
  const cx = azimuthX(azimuthOf(x, z));
  const w = Math.max(pose.minWidth, sizePx(pose.width, d));
  const seat = heightY(pose.seat, d);
  const shoulders = heightY(pose.shoulders, d);
  const head = Math.max(pose.minHead, sizePx(0.12, d));
  sheet.begin(d);
  if (pose.legs) sheet.rect(cx - w * 0.8, seat - (seat - shoulders) * 0.25, w * 1.6, (seat - shoulders) * 0.25, pick(random, pose.legs));
  sheet.rect(cx - w / 2, shoulders, w, (seat - shoulders) * pose.torso, pick(random, SHIRTS));
  const p = new Path2D();
  p.arc(cx, shoulders - head * pose.neck, head, 0, Math.PI * 2);
  sheet.path(p, pick(random, SKINS));
}
