import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { seededRandom } from '@/covers/generated/canvasUtils';
import type { Furniture } from '../Furniture';
import type { DayNight } from '../props/DayNight';
import { instancedBasic, paint } from '../materials/palette';
import { BULBS } from '../props/outdoors/Holiday';
import { PARK_FIR } from '../city/park';
import { TREE_FORM, type PlantedTree } from '../city/trees';
import { nightnessOf } from './streetAir';
import { snowCovered } from './snowCover';
import { FLAT_IN_STREET } from './streetPlan';

export interface StreetChristmasOptions {
  /** The street trees the bulbs are wound round (not the park's). */
  trees: readonly PlantedTree[];
}

/** Bulbs per street tree, their size, and how often some twinkle. */
const PER_TREE = 34;
const BULB = 0.05;
const TWINKLE_SECONDS = 0.4;
/** The fir's bulbs: how many turns of garland, how many bulbs. */
const FIR_TURNS = 7;
const FIR_BULBS = 140;

/**
 * Christmas on the walkable street, as the window view paints it (`props/outdoors/Holiday`): bulbs
 * wound round the street trees' crowns, and in the park beyond the hedge the tall fir (`city/park`'s
 * `PARK_FIR`, where the view has it) with garlands of bulbs spiralling up it and a star on top. The
 * bulbs are unlit spheres (no light of their own: the light count never changes), dim by day,
 * bright at night, a few twinkling. Placed only at Christmas (`furnishStreet`). Decoration: never collides.
 */
export class StreetChristmas extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  private readonly bulbs: THREE.InstancedMesh;
  private readonly colors: THREE.Color[] = [];
  private readonly scratch = new THREE.Color();
  private readonly random = seededRandom(2412);
  private readonly star: THREE.MeshBasicMaterial;
  private clock = TWINKLE_SECONDS;

  constructor(private readonly dayNight: DayNight, options: StreetChristmasOptions) {
    super();
    this.name = 'StreetChristmas';
    const random = seededRandom(1225);
    const points: THREE.Vector3[] = [];
    // Round each street tree's crown: on its surface, mostly its upper two thirds.
    for (const { at, scale } of options.trees) {
      const centre = new THREE.Vector3(at[0], (TREE_FORM.trunk + 0.6) * scale, at[1]);
      const radius = TREE_FORM.crown * scale * 0.95;
      for (let i = 0; i < PER_TREE; i++) {
        const y = -0.55 + random() * 1.45;
        const a = random() * Math.PI * 2;
        const r = Math.sqrt(Math.max(0, 1 - Math.min(1, y * y))) * radius;
        points.push(new THREE.Vector3(centre.x + Math.cos(a) * r, centre.y + y * radius * 0.85, centre.z + Math.sin(a) * r));
      }
    }
    // The park's fir, in the street's frame.
    const fx = PARK_FIR.x + FLAT_IN_STREET.x;
    const fz = PARK_FIR.z + FLAT_IN_STREET.z;
    const { height, radius } = PARK_FIR;
    const needles = snowCovered(new THREE.MeshStandardMaterial({ color: 0x1f3a26, roughness: 0.9, flatShading: true }));
    const tiers = 4;
    for (let t = 0; t < tiers; t++) {
      const h = (height * 0.9) / tiers + 1.4;
      const r = radius * (1 - t / (tiers + 0.6));
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 10), needles);
      cone.position.set(fx, 1.2 + t * ((height * 0.82) / tiers) + h / 2, fz);
      cone.castShadow = true;
      cone.receiveShadow = true;
      this.add(cone);
    }
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 1.6, 8), paint(0x4a3422, 0.9));
    trunk.position.set(fx, 0.8, fz);
    this.add(trunk);
    for (let i = 0; i < FIR_BULBS; i++) {
      const u = i / FIR_BULBS;
      const y = 1.4 + u * (height - 2);
      const r = radius * (1 - u) * 0.98 + 0.15;
      const a = u * FIR_TURNS * Math.PI * 2;
      points.push(new THREE.Vector3(fx + Math.cos(a) * r, y, fz + Math.sin(a) * r));
    }
    this.star = new THREE.MeshBasicMaterial({ color: 0xffe07a, toneMapped: false });
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), this.star);
    star.position.set(fx, height + 0.4, fz);
    star.scale.set(1, 1.3, 0.35);
    this.add(star);

    this.bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(BULB, 6, 5), instancedBasic({ toneMapped: false }), points.length);
    this.bulbs.castShadow = false;
    const m = new THREE.Matrix4();
    points.forEach((p, i) => {
      // The fir's bulbs are bigger (seen from across the hedge).
      const s = i >= points.length - FIR_BULBS ? 2.2 : 1;
      this.bulbs.setMatrixAt(i, m.makeScale(s, s, s).setPosition(p));
      const color = new THREE.Color(BULBS[i % BULBS.length]!);
      this.colors.push(color);
      this.bulbs.setColorAt(i, color);
    });
    this.bulbs.computeBoundingSphere();
    this.add(this.bulbs);
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  update(dt: number): void {
    this.clock += dt;
    if (this.clock < TWINKLE_SECONDS) return;
    this.clock = 0;
    // Dim by day, bright at night; a fifth of them low at any moment.
    const night = THREE.MathUtils.smoothstep(nightnessOf(this.dayNight.state), 0.15, 0.55);
    const glow = 0.35 + 1.1 * night;
    const c = this.scratch;
    for (let i = 0; i < this.colors.length; i++) this.bulbs.setColorAt(i, c.copy(this.colors[i]!).multiplyScalar(glow * (this.random() < 0.2 ? 0.35 : 1)));
    if (this.bulbs.instanceColor) this.bulbs.instanceColor.needsUpdate = true;
    this.star.color.setHex(0xffe07a).multiplyScalar(0.6 + 1.2 * night);
  }
}
