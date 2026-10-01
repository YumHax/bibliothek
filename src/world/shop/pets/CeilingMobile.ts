import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { Prop, part } from '../../props/Prop';
import { mergeStaticParts } from '../../zone/mergeStatic';
import { cloth, paint } from '../../materials/palette';
import { seededRandom } from '@/graphics/canvas';
import { hangFromCeiling } from '../common/ceilingDrop';

export interface CeilingMobileOptions {
  /** How far below the ceiling the top bar hangs. Default 0.55. */
  drop?: number;
  seed?: number;
}

const ARM = 0.5;
const SUB = 0.26;
const WIRE = paint(0x3a3a3c, 0.4);
const THREAD = paint(0xe8e0d0, 0.8);
const FELTS: readonly number[] = [0xe84a5a, 0xf0c040, 0x3a9ad8, 0x4ab86a, 0xe88a3a, 0xb05ad8];
type Shape = 'fish' | 'bird' | 'bone';
const SHAPES: readonly Shape[] = ['fish', 'bird', 'bone', 'fish', 'bird', 'fish'];

/**
 * A felt mobile hung over the pet shop's floor: a wire bar on a cord from the ceiling, a smaller bar at each end, and
 * on threads from them felt fish, birds and a bone in bright colours, the whole turning slowly one way and each bar
 * its own way, as in the draught from the door. The shop's, not for sale. Ceiling placement: origin on the ceiling,
 * built down -y. Decoration: never collides (it is over the heads).
 */
export class CeilingMobile extends Prop implements Updatable {
  private readonly top = new THREE.Group();
  private readonly bars: { bar: THREE.Group; speed: number; phase: number }[] = [];
  private time = 0;

  constructor(options: CeilingMobileOptions = {}) {
    super();
    this.name = 'CeilingMobile';
    const random = seededRandom(options.seed ?? 61);
    const y = hangFromCeiling(this, options.drop ?? 0.55, 'cord');
    this.top.position.y = y;
    this.add(this.top);
    const bar = part(this.top, ARM, 0.004, 0.004, WIRE);
    bar.castShadow = false;
    let felt = 0;
    for (const s of [-1, 1]) {
      part(this.top, 0.002, 0.14, 0.002, THREAD, { x: (s * ARM) / 2, y: -0.07 });
      const sub = new THREE.Group();
      sub.position.set((s * ARM) / 2, -0.14, 0);
      this.top.add(sub);
      part(sub, SUB, 0.003, 0.003, WIRE);
      for (const t of [-1, 1]) {
        const drop = 0.1 + random() * 0.12;
        part(sub, 0.002, drop, 0.002, THREAD, { x: (t * SUB) / 2, y: -drop / 2 });
        this.hang(sub, (t * SUB) / 2, -drop, SHAPES[felt % SHAPES.length]!, FELTS[felt % FELTS.length]!);
        felt++;
      }
      this.bars.push({ bar: sub, speed: 0.25 + random() * 0.2, phase: random() * 6 });
    }
    // One more hung from the middle, lower down.
    part(this.top, 0.002, 0.34, 0.002, THREAD, { y: -0.17 });
    this.hang(this.top, 0, -0.34, 'bird', FELTS[felt % FELTS.length]!);
    this.traverse((o) => (o.castShadow = false));
    // Each bar turns as a whole: its parts merge within it, then the top bar's own (the small bars kept apart).
    for (const { bar } of this.bars) {
      mergeStaticParts(bar);
      bar.userData.keepParts = true;
    }
    mergeStaticParts(this.top);
  }

  update(dt: number): void {
    this.time += dt;
    this.top.rotation.y = Math.sin(this.time * 0.12) * 1.6;
    for (const { bar, speed, phase } of this.bars) bar.rotation.y = Math.sin(this.time * speed + phase) * 2.2;
  }

  /** A felt shape hanging at (x, y) of `parent`, facing sideways. */
  private hang(parent: THREE.Object3D, x: number, y: number, shape: Shape, color: number): void {
    const felt = cloth(color);
    const g = new THREE.Group();
    g.position.set(x, y, 0);
    parent.add(g);
    if (shape === 'fish') {
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 6).scale(1.6, 1, 0.25), felt);
      body.position.y = -0.04;
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.04, 3).rotateZ(Math.PI / 2).scale(1, 1, 0.25), felt);
      tail.position.set(-0.08, -0.04, 0);
      g.add(body, tail);
    } else if (shape === 'bird') {
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8).scale(1.3, 1, 0.8), felt);
      body.position.y = -0.035;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), felt);
      head.position.set(0.045, -0.015, 0);
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.007, 0.02, 4).rotateZ(-Math.PI / 2), paint(0xf0a030, 0.6));
      beak.position.set(0.072, -0.015, 0);
      g.add(body, head, beak);
      for (const s of [-1, 1]) {
        const wing = part(g, 0.05, 0.004, 0.05, cloth(new THREE.Color(color).multiplyScalar(0.8).getHex()), { y: -0.03, z: s * 0.035 });
        wing.rotation.x = s * 0.5;
      }
    } else {
      part(g, 0.08, 0.02, 0.012, felt, { y: -0.03 });
      for (const s of [-1, 1]) for (const t of [-1, 1]) {
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.013, 8, 6).scale(1, 1, 0.5), felt);
        knob.position.set(s * 0.042, -0.03 + t * 0.011, 0);
        g.add(knob);
      }
    }
  }
}
