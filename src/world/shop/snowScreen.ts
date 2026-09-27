import * as THREE from 'three';
import { createCanvas } from '@/graphics/canvas';
import { markShared } from '../props/Prop';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../Furniture';

const W = 80;
const H = 60;
/** Frames of snow a second: an untuned set flickers, it does not need 60. */
const FPS = 12;

let screen: { material: THREE.MeshBasicMaterial; texture: THREE.CanvasTexture; ctx: CanvasRenderingContext2D; image: ImageData } | null = null;

/**
 * The glass of an untuned CRT: one small noise canvas for the page, shared by every set that shows it (the TV repair
 * shop's wall), unlit so it glows grey-blue. Repainted by a `SnowTicker` placed with the sets.
 */
export function snowScreen(): THREE.MeshBasicMaterial {
  if (!screen) {
    const [canvas, ctx] = createCanvas(W, H);
    const texture = markShared(new THREE.CanvasTexture(canvas));
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    const material = markShared(new THREE.MeshBasicMaterial({ map: texture, color: 0xc8d4e0 }));
    screen = { material, texture, ctx, image: ctx.createImageData(W, H) };
    paintSnow();
  }
  return screen.material;
}

function paintSnow(): void {
  if (!screen) return;
  const { data } = screen.image;
  for (let i = 0; i < W * H; i++) {
    const v = Math.random() * 200 + 40;
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v + 12;
    data[i * 4 + 3] = 255;
  }
  screen.ctx.putImageData(screen.image, 0, 0);
  screen.texture.needsUpdate = true;
}

/**
 * Repaints the shared snow `FPS` times a second while its zone is active: placed once beside the sets, so the sets
 * themselves stay static (their parts merge into a few draws).
 */
export class SnowTicker extends THREE.Object3D implements Furniture, Updatable {
  readonly footprint = new THREE.Box3();
  readonly contactShadow = false;
  private since = 0;

  update(dt: number): void {
    this.since += dt;
    if (this.since < 1 / FPS) return;
    this.since = 0;
    paintSnow();
  }
}
