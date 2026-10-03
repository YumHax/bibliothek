import * as THREE from 'three';

const scratch = new THREE.Color();

/**
 * The one way the neighbourhood's painters darken or lighten a colour: the walkable street
 * (`street/facadePainter`), the building looks (`facadeStyle`) and the window view's panorama
 * (`props/outdoors/paint`) all go through it, so a wall and its trim come out the same shade in
 * both pictures (`shopLooks` promises that). It scales the sRGB bytes, as the street was tuned on.
 * `hex` is a `#rrggbb` (any other CSS colour is read through three's `Color` first).
 */
export function shade(hex: string, k: number): string {
  const n = /^#[0-9a-f]{6}$/i.test(hex) ? parseInt(hex.slice(1), 16) : scratch.set(hex).getHex();
  const c = (v: number): string => Math.max(0, Math.min(255, Math.round(v * k))).toString(16).padStart(2, '0');
  return `#${c((n >> 16) & 255)}${c((n >> 8) & 255)}${c(n & 255)}`;
}
