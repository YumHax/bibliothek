import * as THREE from 'three';
import { createCanvas, seededRandom, canvasTexture } from '@/covers/generated/canvasUtils';
import { RENDER_ORDER } from '../surface/layers';
import { overKeepingAlpha } from '@/world/materials/blend';
import { markShared } from '@/world/materials/sharedResources';

/** Rings alive at once, how long one spreads (s), how far it gets (as a share of `reach`). */
const RINGS = 3;
const RING_SECONDS = 1.1;
/** Opacity of a ring as it is born. */
const RING_OPACITY = 0.35;
/** Rings float this far over the water's surface (m). */
const LIFT = 0.002;

let normals: THREE.CanvasTexture | null = null;

/**
 * A tiling normal map of small soft wavelets, painted once and shared (each surface clones it to
 * drift on its own): a sum of a few sine trains at odd angles, differentiated into normals.
 */
export function rippleNormals(): THREE.Texture {
  if (!normals) {
    const S = 128;
    const [canvas, ctx] = createCanvas(S, S);
    const random = seededRandom(0x71dd1e);
    // Whole numbers of waves across the tile both ways, so it wraps without a seam.
    const waves = Array.from({ length: 5 }, () => ({ kx: Math.round(1 + random() * 4) * (random() < 0.5 ? -1 : 1), ky: Math.round(1 + random() * 4), phase: random() * Math.PI * 2, amp: 0.5 + random() * 0.5 }));
    const image = ctx.createImageData(S, S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        let dx = 0;
        let dy = 0;
        for (const w of waves) {
          const c = Math.cos(((w.kx * x + w.ky * y) / S) * Math.PI * 2 + w.phase) * w.amp;
          dx += c * w.kx;
          dy += c * w.ky;
        }
        const n = new THREE.Vector3(-dx * 0.05, -dy * 0.05, 1).normalize();
        const i = (y * S + x) * 4;
        image.data[i] = Math.round((n.x * 0.5 + 0.5) * 255);
        image.data[i + 1] = Math.round((n.y * 0.5 + 0.5) * 255);
        image.data[i + 2] = Math.round((n.z * 0.5 + 0.5) * 255);
        image.data[i + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
    normals = markShared(canvasTexture(canvas, { data: true, repeat: true }));
  }
  const own = normals.clone();
  own.needsUpdate = true;
  return own;
}

/**
 * Rings spreading on the water where a stream lands: a few thin circles born at the origin one
 * after another, growing to `reach` and fading, while `running`. Laid flat just over the surface
 * (the owner keeps the origin on it), blended over the colour without touching the canvas alpha
 * (the video cut-out; see docs/graphics.md). The owner calls `update(dt)`.
 */
export class WaterRipples extends THREE.Group {
  /** Whether the stream is falling: new rings are born only then, the last ones spread away. */
  running = false;
  private readonly rings: { mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>; age: number }[] = [];
  private untilNext = 0;

  constructor(private readonly reach: number) {
    super();
    this.name = 'WaterRipples';
    const geometry = new THREE.RingGeometry(0.9, 1, 40);
    geometry.rotateX(-Math.PI / 2);
    for (let i = 0; i < RINGS; i++) {
      const material = new THREE.MeshBasicMaterial({ color: 0xf2fbff, transparent: true, opacity: 0, depthWrite: false });
      overKeepingAlpha(material);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.y = LIFT;
      mesh.renderOrder = RENDER_ORDER.sheen;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.visible = false;
      this.add(mesh);
      this.rings.push({ mesh, age: -1 });
    }
  }

  update(dt: number): void {
    if (this.running) {
      this.untilNext -= dt;
      if (this.untilNext <= 0) {
        this.untilNext = RING_SECONDS / RINGS;
        const free = this.rings.find((r) => r.age < 0) ?? this.rings.reduce((a, b) => (a.age > b.age ? a : b));
        free.age = 0;
      }
    }
    for (const ring of this.rings) {
      if (ring.age < 0) continue;
      ring.age += dt / RING_SECONDS;
      if (ring.age >= 1) {
        ring.age = -1;
        ring.mesh.visible = false;
        continue;
      }
      // Quick at first, slowing as it spreads; thinning as it fades.
      const r = this.reach * (0.08 + 0.92 * Math.sqrt(ring.age));
      ring.mesh.scale.set(r, 1, r);
      ring.mesh.material.opacity = RING_OPACITY * (1 - ring.age) * (1 - ring.age);
      ring.mesh.visible = true;
    }
  }
}
