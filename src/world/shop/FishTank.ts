import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../Furniture';
import { cylinderMesh } from '../meshUtils';
import { part } from '../props/Prop';
import { basic, paint, standard, timber } from '../materials/palette';
import { seededRandom } from '@/graphics/canvas';

const W = 0.9;
const H = 0.45;
const D = 0.34;
const STAND = 0.72;
const FISH_COLOURS: readonly number[] = [0xff7a2a, 0xffc830, 0x4ac8e8, 0xe84a6a, 0xff7a2a, 0xf0f0f0];

interface Fish {
  mesh: THREE.Group;
  phase: number;
  speed: number;
  depth: number;
  height: number;
}

/**
 * The pet shop's tank of lazy fish on its cabinet: a glass box of green water over gravel, weed swaying a little, a
 * lit hood, and half a dozen fish drifting from end to end (turning at the glass). Nobody sells fish for the flat: it
 * is the shop's. Origin on the floor under the cabinet's middle, the glass's long side +z. Collides as its box.
 */
export class FishTank extends THREE.Group implements Furniture, Updatable {
  readonly footprint: THREE.Box3;
  private readonly fish: Fish[] = [];
  private time = 0;

  constructor(seed = 3) {
    super();
    this.name = 'FishTank';
    const random = seededRandom(seed);
    part(this, W + 0.06, STAND, D + 0.06, timber(0x3a2a20, 0.55), { y: STAND / 2 });
    const bottom = STAND;
    // Gravel, the water, the glass, the hood with its light strip.
    part(this, W - 0.01, 0.04, D - 0.01, paint(0x8a7a60, 1), { y: bottom + 0.02 });
    const water = new THREE.Mesh(new THREE.BoxGeometry(W - 0.012, H - 0.06, D - 0.012), standard({ color: 0x3a7a6a, roughness: 0.1, transparent: true, opacity: 0.35, depthWrite: false }));
    water.position.y = bottom + 0.04 + (H - 0.06) / 2 - 0.02;
    water.castShadow = false;
    this.add(water);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), standard({ color: 0xd8e8e8, roughness: 0.05, transparent: true, opacity: 0.12, depthWrite: false }));
    glass.position.y = bottom + H / 2;
    glass.castShadow = false;
    this.add(glass);
    part(this, W + 0.02, 0.05, D + 0.02, paint(0x1e1e20, 0.5), { y: bottom + H + 0.025 });
    part(this, W - 0.1, 0.006, 0.03, basic({ color: 0xe8f4ff }), { y: bottom + H - 0.003 });
    // Weed along the back.
    const weed = paint(0x3a8a3a, 0.6);
    for (let i = 0; i < 7; i++) {
      const h = 0.15 + random() * 0.2;
      this.add(cylinderMesh(0.008, h, weed, { x: -W / 2 + 0.08 + i * 0.12, y: bottom + 0.04 + h / 2, z: -D / 2 + 0.06 + random() * 0.06 }, { radiusBottom: 0.014, segments: 6 }));
    }
    for (let i = 0; i < FISH_COLOURS.length; i++) {
      const mesh = new THREE.Group();
      const colour = paint(FISH_COLOURS[i]!, 0.4);
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 6), colour);
      body.scale.set(1.6, 1, 0.5);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.025, 6), colour);
      tail.rotation.z = Math.PI / 2;
      tail.position.x = -0.04;
      mesh.add(body, tail);
      this.add(mesh);
      this.fish.push({ mesh, phase: random() * Math.PI * 2, speed: 0.25 + random() * 0.25, depth: (random() - 0.5) * (D - 0.12), height: bottom + 0.1 + random() * (H - 0.2) });
    }
    this.footprint = new THREE.Box3(new THREE.Vector3(-W / 2 - 0.03, 0, -D / 2 - 0.03), new THREE.Vector3(W / 2 + 0.03, bottom + H + 0.05, D / 2 + 0.03));
  }

  update(dt: number): void {
    this.time += dt;
    const reach = W / 2 - 0.08;
    for (const f of this.fish) {
      const a = this.time * f.speed + f.phase;
      f.mesh.position.set(Math.sin(a) * reach, f.height + Math.sin(a * 2.3) * 0.02, f.depth + Math.sin(a * 0.7) * 0.03);
      // Nose along the way it swims: +x while sin rises.
      f.mesh.rotation.y = Math.cos(a) >= 0 ? 0 : Math.PI;
    }
  }
}
