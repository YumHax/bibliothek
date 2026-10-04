import * as THREE from 'three';
import { Prop, part } from '../../props/Prop';
import { cloth, paint } from '../../materials/palette';
import { lcg } from '@/random';

export interface ToyMiceOptions {
  /** How many mice. Default 3. */
  count?: number;
  /** Where they lie round the origin, metres. Default 0.14. */
  spread?: number;
  seed?: number;
}

const FELTS: readonly number[] = [0x9a9a9a, 0xe84a8a, 0x3a9ad8, 0xf0c040, 0x4ab86a];

/**
 * Felt toy mice scattered on a surface (the window's display, a shelf), each a teardrop body with round ears, a bead
 * nose and a string tail, and a ball of wool with its loose end: the pet shop's. Static: its parts merge. Origin on
 * the surface. Decoration: never collides.
 */
export class ToyMice extends Prop {
  constructor(options: ToyMiceOptions = {}) {
    super();
    this.name = 'ToyMice';
    const random = lcg(options.seed ?? 71);
    const spread = options.spread ?? 0.14;
    const count = options.count ?? 3;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + random();
      this.mouse(Math.cos(a) * spread * (0.6 + random() * 0.4), Math.sin(a) * spread * (0.6 + random() * 0.4), random() * Math.PI * 2, FELTS[(i + Math.floor(random() * 2)) % FELTS.length]!);
    }
    // The ball of wool and its loose end.
    const wool = cloth(0xc8402e);
    const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.035, 2), wool);
    ball.position.set(-spread * 0.2, 0.035, spread * 0.1);
    this.add(ball);
    const end = part(this, 0.12, 0.003, 0.003, wool, { x: -spread * 0.2 + 0.07, y: 0.002, z: spread * 0.1 + 0.02 });
    end.rotation.y = -0.4;
  }

  private mouse(x: number, z: number, yaw: number, color: number): void {
    const felt = cloth(color);
    const m = new THREE.Group();
    m.position.set(x, 0, z);
    m.rotation.y = yaw;
    this.add(m);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8).scale(1.7, 0.9, 1), felt);
    body.position.y = 0.017;
    m.add(body);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.002, 10).rotateX(Math.PI / 2).rotateY(s * 0.4), cloth(0xe8a0a0));
      ear.position.set(0.018, 0.032, s * 0.01);
      m.add(ear);
    }
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.004, 6, 4), paint(0x1a1a1a, 0.3));
    nose.position.set(0.034, 0.016, 0);
    m.add(nose);
    const tail = part(m, 0.06, 0.002, 0.002, paint(0x3a3a3a, 0.8), { x: -0.06, y: 0.004 });
    tail.rotation.y = 0.3;
  }
}
