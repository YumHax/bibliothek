import * as THREE from 'three';
import { createCanvas, seededRandom } from '@/covers/generated/canvasUtils';

/** Scroll speed of the streaks (texture repeats per second) and how many repeats per metre of stream. */
const FLOW = 2.4;
const REPEAT_PER_M = 5;

let streaks: THREE.CanvasTexture | null = null;

/** Faint lengthwise streaks, brighter and dimmer bands, painted once and shared (each stream clones it to scroll on its own). */
function streakTexture(): THREE.CanvasTexture {
  if (streaks) return streaks;
  const [canvas, ctx] = createCanvas(32, 128);
  const random = seededRandom(0x57a3e);
  ctx.fillStyle = '#9a9a9a';
  ctx.fillRect(0, 0, 32, 128);
  for (let i = 0; i < 60; i++) {
    const v = Math.round(150 + random() * 105);
    ctx.fillStyle = `rgba(${v},${v},${v},0.7)`;
    // Streaks drawn twice, shifted a period, so they wrap.
    const x = random() * 32;
    const y = random() * 128;
    const len = 10 + random() * 40;
    for (const dy of [0, -128]) ctx.fillRect(x, y + dy, 1 + random() * 3, len);
  }
  streaks = new THREE.CanvasTexture(canvas);
  streaks.wrapS = streaks.wrapT = THREE.RepeatWrapping;
  return streaks;
}

/**
 * A thin stream of water falling from a spout: a translucent cylinder hanging down from its own
 * origin, its streaks scrolling down while the host ticks it (`update`). The host shows it with
 * `visible` and sets how far it falls with `setLength`. Cheap: plain alpha blending (the canvas
 * alpha stays 1 over the opaque room), no transmission, no shadow.
 */
export class WaterStream extends THREE.Mesh<THREE.CylinderGeometry, THREE.MeshStandardMaterial> {
  private readonly streakMap: THREE.Texture;

  constructor(radius = 0.005) {
    const geometry = new THREE.CylinderGeometry(radius * 0.8, radius, 1, 10, 1, true);
    geometry.translate(0, -0.5, 0);
    const map = streakTexture().clone();
    map.needsUpdate = true;
    const material = new THREE.MeshStandardMaterial({
      color: 0xe4f1f4,
      map,
      roughness: 0.05,
      metalness: 0.1,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      emissive: 0x6f8a90,
      emissiveIntensity: 0.25,
    });
    super(geometry, material);
    this.name = 'WaterStream';
    this.streakMap = map;
    this.castShadow = false;
    this.receiveShadow = false;
    this.visible = false;
  }

  /** How far the stream falls, metres. */
  setLength(length: number): void {
    this.scale.y = Math.max(0.001, length);
    this.streakMap.repeat.set(1, Math.max(0.2, length * REPEAT_PER_M));
  }

  update(dt: number): void {
    if (this.visible) this.streakMap.offset.y = (this.streakMap.offset.y + dt * FLOW) % 1;
  }
}
