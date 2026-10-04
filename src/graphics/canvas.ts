import * as THREE from 'three';
import { QUALITY } from './quality';

/** Generic helpers for textures drawn on a 2D canvas (covers, labels, signs, posters). */

export function createCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return [canvas, canvas.getContext('2d')!];
}

/**
 * How a texture is seen, for its anisotropic filtering (the policy is the quality level's, never a number
 * picked per prop): `grazing` for what the eye meets at a slant (floors, rugs, walls, shelf labels, signs
 * along a street: `QUALITY.anisotropy`), `facing` for what is mostly seen head on (a screen, a poster, a
 * box held up, a sprite: at most 4, which is all a near-square footprint ever uses). A number is for a
 * texture with a reason of its own (1: a data map sampled by hand), with that reason in a comment.
 */
export type Anisotropy = 'grazing' | 'facing' | number;

export function anisotropyFor(intent: Anisotropy): number {
  if (intent === 'grazing') return QUALITY.anisotropy;
  if (intent === 'facing') return Math.min(4, QUALITY.anisotropy);
  return intent;
}

export interface CanvasTextureOptions {
  /**
   * A data map (bump, roughness, normals, alpha and glow masks, packed flags): its bytes are values, not
   * colours, so no sRGB decode. Default false: a colour map, decoded from sRGB.
   */
  data?: boolean;
  /** Default `grazing` (see `Anisotropy`). */
  anisotropy?: Anisotropy;
  /** Tiles: `true` repeats once each way (the material or the uvs set the count), a pair sets the repeat. */
  repeat?: boolean | readonly [number, number];
  /** Default true. Off for a canvas redrawn every few frames at its own size (a scoreboard's digits, a live screen). */
  mipmaps?: boolean;
  /** Nearest filtering, no mipmaps: pixel art shown as pixels. */
  pixelated?: boolean;
}

/**
 * The one way a canvas becomes a texture: colour space, anisotropy by intent, tiling, mipmaps. Every
 * `THREE.CanvasTexture` is made here (`scripts/check-conventions.mjs`); `toTexture` is its shorthand for a
 * plain colour map. A texture kept for the page (a module-level cache) is marked with `markShared`
 * (`world/materials/sharedResources`), or made through `sharedCanvasTexture` there.
 */
export function canvasTexture(canvas: HTMLCanvasElement | OffscreenCanvas, options: CanvasTextureOptions = {}): THREE.CanvasTexture {
  const { data = false, anisotropy = 'grazing', repeat = false, mipmaps = true, pixelated = false } = options;
  const texture = new THREE.CanvasTexture(canvas as HTMLCanvasElement);
  texture.colorSpace = data ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  if (pixelated) {
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
  } else {
    texture.anisotropy = anisotropyFor(anisotropy);
    if (!mipmaps) {
      texture.generateMipmaps = false;
      texture.minFilter = THREE.LinearFilter;
    }
  }
  if (repeat) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    if (repeat !== true) texture.repeat.set(repeat[0], repeat[1]);
  }
  return texture;
}

/** A colour map from `canvas` (sRGB, mipmapped), filtered for how it is seen (`Anisotropy`, default `grazing`). */
export function toTexture(canvas: HTMLCanvasElement, anisotropy: Anisotropy = 'grazing'): THREE.CanvasTexture {
  return canvasTexture(canvas, { anisotropy });
}

/** Sets an existing texture (a clone, a loaded image, a `DataTexture`) to tile both ways; `x`, `y` set the repeat, else it is left as it is. */
export function repeatTexture<T extends THREE.Texture>(texture: T, x?: number, y = x): T {
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  if (x !== undefined) texture.repeat.set(x, y ?? x);
  return texture;
}

/** FNV-1a: a stable 32-bit hash so procedural details (barcodes, serials) are the same on every load. */
export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Tiny deterministic PRNG in [0, 1). */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
