import * as THREE from 'three';
import type { Rng } from './Sheet';

const scratchA = new THREE.Color();
const scratchB = new THREE.Color();

/** `hex` darkened (k < 1) or lightened (k > 1) in linear light, back as a CSS colour. */
export function shade(hex: string, k: number): string {
  scratchA.set(hex).multiplyScalar(k);
  scratchA.r = Math.min(1, scratchA.r);
  scratchA.g = Math.min(1, scratchA.g);
  scratchA.b = Math.min(1, scratchA.b);
  return `#${scratchA.getHexString()}`;
}

/** Blend of two CSS colours, `t` = 0 all `a` .. 1 all `b`. */
export function mixHex(a: string, b: string, t: number): string {
  scratchA.set(a).lerp(scratchB.set(b), THREE.MathUtils.clamp(t, 0, 1));
  return `#${scratchA.getHexString()}`;
}

/** `#rrggbb` with an alpha, as `rgba()`. */
export function alpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function pick<T>(random: Rng, items: readonly T[]): T {
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))];
}

export function between(random: Rng, min: number, max: number): number {
  return min + random() * (max - min);
}

export function integer(random: Rng, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}

export function deg(degrees: number): number {
  return THREE.MathUtils.degToRad(degrees);
}
