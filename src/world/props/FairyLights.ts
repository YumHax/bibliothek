import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { seededRandom } from '@/covers/generated/canvasUtils';
import { markShared, Prop } from './Prop';

export interface FairyLightsOptions {
  /** Distance between the two ends, along local +x from the origin. Default 3. */
  length?: number;
  /** Height of the two ends above the origin. Default 2.4. */
  height?: number;
  /** How far the middle hangs below the ends. Default 0.2. */
  sag?: number;
  /** Distance between two bulbs along the wire. Default 0.15. */
  spacing?: number;
  /** Bulb colours, cycled along the wire. Default Christmas multicolour. */
  colors?: number[];
  /** Bulb radius, metres. Default 0.014 (a string of indoor lights); street lights are bigger. */
  bulb?: number;
  /** Twinkle (some bulbs dim now and then). Default true. */
  twinkle?: boolean;
  seed?: number;
}

const WIRE = markShared(new THREE.MeshStandardMaterial({ color: 0x1a2a1a, roughness: 0.7 }));
const COLORS = [0xff3a2a, 0xffd23a, 0x3aff6a, 0x4a8aff, 0xfff4e0];
const TWINKLE_SECONDS = 0.5;

/** The wire's sagging line, for its tube. */
class PointCurve extends THREE.Curve<THREE.Vector3> {
  constructor(private readonly at: (t: number, target: THREE.Vector3) => THREE.Vector3) {
    super();
  }

  override getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    return this.at(t, target);
  }
}

/**
 * A string of Christmas fairy lights slung between two points, from the origin along local +x,
 * sagging in the middle: small coloured bulbs that twinkle. No light of its own (the bulbs are
 * unlit spheres whose colour changes: the light count never changes, see docs/zones.md). The
 * holidays' version of `Garland`'s warm bulbs. Decoration: never collides, casts nothing.
 */
export class FairyLights extends Prop implements Updatable {
  private readonly bulbs: THREE.InstancedMesh;
  private readonly colors: THREE.Color[] = [];
  private readonly twinkle: boolean;
  private readonly random: () => number;
  private clock = 0;

  constructor(options: FairyLightsOptions = {}) {
    super();
    this.name = 'FairyLights';
    const length = options.length ?? 3;
    const height = options.height ?? 2.4;
    const sag = options.sag ?? 0.2;
    const spacing = options.spacing ?? 0.15;
    this.twinkle = options.twinkle ?? true;
    this.random = seededRandom(options.seed ?? 3);
    const point = (t: number, target = new THREE.Vector3()) => target.set(t * length, height - sag * 4 * t * (1 - t), 0);
    const curve = new PointCurve(point);
    const wire = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.003, 4, false), WIRE);
    wire.castShadow = false;
    this.add(wire);

    const count = Math.max(1, Math.floor(length / spacing) - 1);
    const palette = options.colors ?? COLORS;
    this.bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(options.bulb ?? 0.014, 6, 5), new THREE.MeshBasicMaterial({ toneMapped: false }), count);
    this.bulbs.castShadow = false;
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < count; i++) {
      point((i + 1) / (count + 1), p);
      p.y -= 0.02;
      m.compose(p, q, s);
      this.bulbs.setMatrixAt(i, m);
      const color = new THREE.Color(palette[i % palette.length]!);
      this.colors.push(color);
      this.bulbs.setColorAt(i, color);
    }
    this.add(this.bulbs);
  }

  update(dt: number): void {
    if (!this.twinkle) return;
    this.clock += dt;
    if (this.clock < TWINKLE_SECONDS) return;
    this.clock = 0;
    const c = new THREE.Color();
    for (let i = 0; i < this.colors.length; i++) this.bulbs.setColorAt(i, c.copy(this.colors[i]!).multiplyScalar(this.random() < 0.2 ? 0.3 : 1.2));
    if (this.bulbs.instanceColor) this.bulbs.instanceColor.needsUpdate = true;
  }
}
