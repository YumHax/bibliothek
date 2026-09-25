import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { Prop, matte } from './Prop';

export interface LavaLampOptions {
  /** Colour of the wax. Default orange. */
  wax?: number;
  /** Colour of the liquid it floats in. Default a warm amber. */
  liquid?: number;
  /** Overall height. Default 0.42. */
  height?: number;
  /** Seconds from switched on (placed) to the wax rising freely. Default 90. */
  warmUp?: number;
}

/** Profile of the glass vessel from its bottom: [radius (times `RADIUS` x the lamp's height), y (share of the vessel's height)]. */
const VESSEL: [number, number][] = [
  [0.19, 0],
  [0.24, 0.12],
  [0.25, 0.32],
  [0.2, 0.62],
  [0.13, 0.95],
  [0.12, 1],
];
const BLOBS = 5;
/** Scale of the profile's radii against the lamp's height. */
const RADIUS = 0.5;
const BASE_SHARE = 0.34;
const CAP_SHARE = 0.1;

const METAL = new THREE.MeshStandardMaterial({ color: 0x8c8f94, metalness: 0.85, roughness: 0.3 });

interface Blob {
  mesh: THREE.Mesh;
  radius: number;
  period: number;
  phase: number;
  drift: number;
}

/**
 * A lava lamp: a tapered metal base and cap, the glass vessel between them, and in the amber
 * liquid a few blobs of wax that swell, stretch and float up, then sink back, each on its own slow
 * cycle. It glows but lights nothing (emissive only, no light: a light added mid-game would
 * recompile every shader). Warm-up: for the first minute and a half the wax lies pooled at the
 * bottom and rises only gradually. The liquid is see-through with its alpha kept (the canvas alpha
 * is the video cut-out). Floor-standing: origin at the base's underside.
 */
export class LavaLamp extends Prop implements Updatable {
  private readonly blobs: Blob[] = [];
  private readonly vesselBottom: number;
  private readonly vesselHeight: number;
  private readonly vesselWidth: number;
  private readonly warmUp: number;
  private age = 0;
  private time = Math.random() * 100;

  constructor(options: LavaLampOptions = {}) {
    super();
    this.name = 'LavaLamp';
    const height = options.height ?? 0.42;
    this.warmUp = options.warmUp ?? 90;
    const baseH = height * BASE_SHARE;
    const capH = height * CAP_SHARE;
    this.vesselBottom = baseH;
    this.vesselHeight = height - baseH - capH;
    this.vesselWidth = height * 0.125;

    // Base: a cone widening to the floor; cap: a small cone to a point.
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.19 * RADIUS * height + 0.002, height * 0.16, baseH, 24, 1), METAL);
    base.position.y = baseH / 2;
    base.castShadow = true;
    const capR = 0.12 * RADIUS * height + 0.004;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(capR * 0.45, capR, capH, 18), METAL);
    cap.position.y = height - capH / 2;
    cap.castShadow = true;
    // The switch box's cable out of the back of the base.
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.12, 6).rotateX(Math.PI / 2), matte(0x1d1d1f, 0.6));
    cable.position.set(0, 0.004, -height * 0.16 - 0.05);
    this.add(base, cap, cable);

    // The vessel: the liquid as a lathe of the profile, see-through; the glow sits in its emissive.
    const points = VESSEL.map(([r, y]) => new THREE.Vector2(r * RADIUS * height, y * this.vesselHeight));
    const liquid = new THREE.MeshStandardMaterial({
      color: options.liquid ?? 0xe7a24a,
      emissive: options.liquid ?? 0xe7a24a,
      emissiveIntensity: 0.25,
      roughness: 0.08,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      // Alpha kept as it is under the glass: the canvas alpha is the video cut-out.
      blending: THREE.CustomBlending,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
    });
    const vessel = new THREE.Mesh(new THREE.LatheGeometry(points, 28), liquid);
    vessel.position.y = baseH;
    vessel.renderOrder = 1;
    this.add(vessel);

    // The wax: one material for every blob, lit from within.
    const waxColour = options.wax ?? 0xff5a1f;
    const wax = new THREE.MeshStandardMaterial({ color: waxColour, emissive: waxColour, emissiveIntensity: 0.9, roughness: 0.5 });
    const sphere = new THREE.SphereGeometry(1, 16, 12);
    for (let i = 0; i < BLOBS; i++) {
      const mesh = new THREE.Mesh(sphere, wax);
      this.add(mesh);
      this.blobs.push({ mesh, radius: height * (0.03 + 0.012 * ((i * 7) % 3)), period: 26 + i * 7.3, phase: i * 1.9, drift: i * 2.4 });
    }
    // The pool at the bottom, always there.
    const pool = new THREE.Mesh(sphere, wax);
    pool.scale.set(this.vesselWidth * 0.75, height * 0.035, this.vesselWidth * 0.75);
    pool.position.y = baseH + height * 0.01;
    this.add(pool);
    this.update(0);
  }

  update(dt: number): void {
    // Hidden (not bought yet) it is off: it warms up from cold once shown.
    if (!this.visible) {
      this.age = 0;
      return;
    }
    this.age += dt;
    this.time += dt;
    const heat = THREE.MathUtils.smoothstep(this.age, 0, this.warmUp);
    for (const blob of this.blobs) {
      // Up and down on a smooth cycle, lingering at both ends; the cold wax stays low.
      const cycle = (Math.sin((this.time / blob.period) * Math.PI * 2 + blob.phase) + 1) / 2;
      const rise = heat * THREE.MathUtils.smootherstep(cycle, 0.1, 0.9);
      const y = 0.06 + rise * 0.8;
      const velocity = Math.cos((this.time / blob.period) * Math.PI * 2 + blob.phase);
      // Stretched along its motion while moving, squashed as it turns, swelling as it warms.
      const stretch = 1 + 0.45 * Math.abs(velocity) * heat;
      const r = blob.radius * (0.7 + 0.3 * heat) * this.fit(y);
      blob.mesh.scale.set(r / Math.sqrt(stretch), r * stretch, r / Math.sqrt(stretch));
      const wander = this.vesselWidth * 0.25 * this.fit(y);
      blob.mesh.position.set(
        Math.sin(this.time * 0.07 + blob.drift) * wander,
        this.vesselBottom + y * this.vesselHeight,
        Math.cos(this.time * 0.05 + blob.drift * 1.3) * wander,
      );
    }
  }

  /** How wide the vessel is at height share `y`, relative to its widest: the blobs shrink into the neck. */
  private fit(y: number): number {
    for (let i = 1; i < VESSEL.length; i++) {
      const [r1, y1] = VESSEL[i]!;
      if (y <= y1) {
        const [r0, y0] = VESSEL[i - 1]!;
        return THREE.MathUtils.lerp(r0, r1, (y - y0) / (y1 - y0)) / 0.25;
      }
    }
    return 0.48;
  }
}
