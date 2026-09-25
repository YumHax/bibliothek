import * as THREE from 'three';
import { azimuthOf, azimuthX, heightY } from './Sheet';

/** A rectangle of the sprite atlas in pixels. */
export interface Cell {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Reserves a `w` x `h` pixel cell in the atlas being painted. */
export type Place = (w: number, h: number) => Cell;

/**
 * Queues a sprite for this frame: `bounds` are scenery-texture pixels (left, top, right, bottom),
 * `d` the distance it is sorted and hidden by, `tint` a packed linear colour (white by default).
 */
export type Push = (bounds: number[], cell: Cell, d: number, alpha: number, tint?: number) => void;

/** What the sprite painters draw on: the colour atlas and its glow copy (the same coordinates, lit at night). */
export interface AtlasPens {
  place: Place;
  color: CanvasRenderingContext2D;
  glow: CanvasRenderingContext2D;
}

/** The moment every mover reads: time of day, how dark and how awake the city is, the weather. */
export interface LifeEnv {
  /** Game hours, 0 ≤ hours < 24. */
  hours: number;
  /** 0 by day .. 1 at night (the scenery's darkness), and its smoothed dusk ramp. */
  nightness: number;
  dusk: number;
  /** How awake the city is (see `wakefulnessAt`). */
  wakefulness: number;
  rain: number;
  snow: number;
  /** Whichever of rain and snow is heavier. */
  wet: number;
  wind: number;
}

/** No tint: the sprite keeps its painted colours. */
export const WHITE_TINT = 0xffffff;

/** A colour in linear light, packed into one float (r << 16 | g << 8 | b) for the shader. */
export function packTint(hex: string): number {
  const c = new THREE.Color(hex);
  return (Math.round(c.r * 255) << 16) | (Math.round(c.g * 255) << 8) | Math.round(c.b * 255);
}

/** Scenery-texture bounds of an upright sprite standing at (x, z): `width` metres across, from height `h0` up to `h1`. */
export function uprightBounds(x: number, z: number, width: number, h0: number, h1: number): number[] {
  const d = Math.hypot(x, z);
  const a = azimuthOf(x, z);
  const half = width / 2 / d;
  return [azimuthX(a - half), heightY(h1, d), azimuthX(a + half), heightY(h0, d)];
}

/**
 * Pushes `cell` (painted at `scale` pixels per metre, its feet `margin` pixels above the cell's
 * bottom) standing at (x, z), `lift` metres off the street; sorted at distance `d` (its own by default).
 */
export function pushStanding(push: Push, cell: Cell, scale: number, margin: number, x: number, z: number, alpha: number, lift = 0, d = Math.hypot(x, z)): void {
  const h0 = lift - margin / scale;
  push(uprightBounds(x, z, cell.w / scale, h0, h0 + cell.h / scale), cell, d, alpha);
}

/** Which way something heading along (dx, dz) at (x, z) moves across the view: 1 towards +azimuth, else -1. */
export function acrossSign(x: number, z: number, dx: number, dz: number): 1 | -1 {
  const a = azimuthOf(x, z);
  return dx * Math.cos(a) - dz * Math.sin(a) >= 0 ? 1 : -1;
}

/** A soft round light on the glow canvas: `rgb` as "r,g,b", `radius` in pixels. */
export function glowDot(glow: CanvasRenderingContext2D, x: number, y: number, radius: number, rgb: string, strength: number): void {
  const g = glow.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, `rgba(${rgb},${strength})`);
  g.addColorStop(0.45, `rgba(${rgb},${strength * 0.35})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  glow.save();
  glow.globalCompositeOperation = 'lighter';
  glow.fillStyle = g;
  glow.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  glow.restore();
}

/** Game hours `h` inside the window [from, to) (wrapping past midnight when from > to). */
export function inHours(h: number, from: number, to: number): boolean {
  return from <= to ? h >= from && h < to : h >= from || h < to;
}

/** 0..1 ramp in and out of the game-hours window [from, to), easing over `fade` hours at each end. */
export function hoursRamp(h: number, from: number, to: number, fade = 0.25): number {
  const span = THREE.MathUtils.euclideanModulo(to - from, 24);
  const t = THREE.MathUtils.euclideanModulo(h - from, 24);
  if (t >= span) return 0;
  return Math.min(1, t / fade, (span - t) / fade);
}
