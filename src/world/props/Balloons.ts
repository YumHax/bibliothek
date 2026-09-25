import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { seededRandom } from '@/covers/generated/canvasUtils';
import { markShared, matte, Prop } from './Prop';

export interface BalloonsOptions {
  /** How many balloons in the bunch. Default 4. */
  count?: number;
  /** Colours, cycled. Default gold, silver and black: New Year's. */
  colors?: number[];
  /** Height of the bunch above the weight, metres. Default 1.5. */
  height?: number;
  seed?: number;
}

const WEIGHT = markShared(matte(0x2a2a2a, 0.4));
const STRING = markShared(new THREE.LineBasicMaterial({ color: 0xdddddd }));
const COLORS = [0xd4a52a, 0xc4c7cc, 0x1a1a1f, 0xd4a52a, 0xc4c7cc];

/**
 * A bunch of party balloons tied to a small weight on the floor (New Year's, a party): each on
 * its string, swaying a little out of time with the others. Standing on the floor at local y = 0.
 * Decoration: never collides, casts nothing.
 */
export class Balloons extends Prop implements Updatable {
  private readonly heads: { mesh: THREE.Object3D; phase: number; top: THREE.Vector3 }[] = [];
  private readonly strings: THREE.BufferAttribute;
  private clock = 0;

  constructor(options: BalloonsOptions = {}) {
    super();
    this.name = 'Balloons';
    const count = options.count ?? 4;
    const colors = options.colors ?? COLORS;
    const height = options.height ?? 1.5;
    const random = seededRandom(options.seed ?? 17);
    const weight = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.04, 10), WEIGHT);
    weight.position.y = 0.02;
    this.add(weight);
    const geometry = new THREE.SphereGeometry(0.13, 16, 12);
    geometry.scale(1, 1.2, 1);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + random();
      const top = new THREE.Vector3(Math.cos(a) * 0.18, height + (random() - 0.5) * 0.25, Math.sin(a) * 0.18);
      const balloon = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: colors[i % colors.length]!, roughness: 0.25, metalness: 0.4 }));
      balloon.castShadow = false;
      balloon.position.copy(top).add(new THREE.Vector3(0, 0.15, 0));
      this.add(balloon);
      this.heads.push({ mesh: balloon, phase: random() * Math.PI * 2, top });
    }
    // One segment per balloon from the weight to its knot, redrawn as the bunch sways.
    this.strings = new THREE.Float32BufferAttribute(new Float32Array(count * 6), 3);
    const lines = new THREE.BufferGeometry();
    lines.setAttribute('position', this.strings);
    this.add(new THREE.LineSegments(lines, STRING));
    this.update(0);
  }

  update(dt: number): void {
    this.clock += dt;
    this.heads.forEach((h, i) => {
      const sway = Math.sin(this.clock * 0.7 + h.phase) * 0.04;
      const x = h.top.x + sway;
      const z = h.top.z + Math.cos(this.clock * 0.55 + h.phase) * 0.03;
      h.mesh.position.set(x, h.top.y + 0.15, z);
      h.mesh.rotation.z = -sway * 0.8;
      this.strings.setXYZ(i * 2, 0, 0.04, 0);
      this.strings.setXYZ(i * 2 + 1, x, h.top.y, z);
    });
    this.strings.needsUpdate = true;
  }
}
