import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../Furniture';
import { cylinderMesh } from '../meshUtils';
import { METAL, paint } from '../materials/palette';
import { seededRandom } from '@/graphics/canvas';

/** The stand's pole and the cage hung from its arm (m): the cage's bottom and top, its radius, the bars round it. */
const POLE = 1.75;
const ARM = 0.26;
const CAGE = { bottom: 1.18, top: 1.58, radius: 0.15, bars: 18 };
const BIRDS: readonly { color: number; x: number }[] = [
  { color: 0x6fc24a, x: -0.05 },
  { color: 0x5a9ad8, x: 0.06 },
];

/**
 * The pet shop's budgies: a brass cage hung from the arm of a floor stand, a perch across it and two birds on it, one
 * green, one blue, bobbing and turning their heads now and then (their chatter is the shop's `PetShopNoises`, placed
 * at the cage). The shop's, not for sale. The bars are one merged mesh. Origin on the floor under the pole, the arm
 * reaching +x. Collides as the stand's foot.
 */
export class Birdcage extends THREE.Group implements Furniture, Updatable {
  readonly footprint = new THREE.Box3(new THREE.Vector3(-0.18, 0, -0.18), new THREE.Vector3(0.18, POLE, 0.18));
  /** Where the birds are, stand-local: their chatter comes from there. */
  readonly voiceAt = new THREE.Vector3(ARM, (CAGE.bottom + CAGE.top) / 2, 0);
  private readonly birds: { body: THREE.Group; phase: number; hop: number }[] = [];
  private readonly random: () => number;
  private time = 0;

  constructor(seed = 5) {
    super();
    this.name = 'Birdcage';
    this.random = seededRandom(seed);
    const brass = METAL.brass();
    const iron = paint(0x2a2a2c, 0.5);
    // The stand: a weighted foot, the pole, the arm and its hook.
    this.add(cylinderMesh(0.17, 0.03, iron, { y: 0.015 }, { radiusBottom: 0.18, segments: 20 }));
    this.add(cylinderMesh(0.012, POLE, iron, { y: POLE / 2 }, { segments: 10 }));
    const arm = cylinderMesh(0.01, ARM, iron, { x: ARM / 2, y: POLE - 0.02 }, { segments: 8 });
    arm.rotation.z = Math.PI / 2;
    this.add(arm);
    this.add(cylinderMesh(0.004, POLE - 0.02 - CAGE.top, brass, { x: ARM, y: (POLE - 0.02 + CAGE.top) / 2 }, { segments: 6 }));
    // The cage round the birds: the tray, the bars, a ring at the top and the dome over it.
    const cage = new THREE.Group();
    cage.position.x = ARM;
    this.add(cage);
    cage.add(cylinderMesh(CAGE.radius + 0.01, 0.03, brass, { y: CAGE.bottom + 0.015 }, { segments: 24 }));
    const bars: THREE.BufferGeometry[] = [];
    const height = CAGE.top - CAGE.bottom;
    for (let i = 0; i < CAGE.bars; i++) {
      const a = (i / CAGE.bars) * Math.PI * 2;
      bars.push(new THREE.CylinderGeometry(0.0022, 0.0022, height, 4).translate(Math.cos(a) * CAGE.radius, CAGE.bottom + height / 2, Math.sin(a) * CAGE.radius));
    }
    for (const y of [CAGE.bottom + 0.1, CAGE.top]) bars.push(new THREE.TorusGeometry(CAGE.radius, 0.003, 4, 28).rotateX(Math.PI / 2).translate(0, y, 0));
    bars.push(new THREE.SphereGeometry(CAGE.radius, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.4, 1).translate(0, CAGE.top, 0));
    const barMesh = new THREE.Mesh(mergeGeometries(bars.map((g) => g.toNonIndexed()))!, brass);
    for (const g of bars) g.dispose();
    barMesh.castShadow = false;
    cage.add(barMesh);
    // The perch, and the two birds on it.
    const perch = cylinderMesh(0.005, CAGE.radius * 1.8, paint(0x8a6a40, 0.7), { y: CAGE.bottom + 0.14 }, { segments: 6 });
    perch.rotation.z = Math.PI / 2;
    cage.add(perch);
    for (const { color, x } of BIRDS) {
      const body = new THREE.Group();
      body.position.set(x, CAGE.bottom + 0.145, 0);
      const feathers = paint(color, 0.7);
      const breast = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8).scale(0.9, 1.25, 0.9), feathers);
      breast.position.y = 0.03;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), paint(0xf2e8a0, 0.7));
      head.position.set(0, 0.062, 0.006);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.05, 6), feathers);
      tail.position.set(0, 0.01, -0.02);
      tail.rotation.x = -2.4;
      body.add(breast, head, tail);
      body.rotation.y = this.random() * Math.PI * 2;
      cage.add(body);
      this.birds.push({ body, phase: this.random() * 10, hop: 0 });
    }
  }

  update(dt: number): void {
    this.time += dt;
    for (const bird of this.birds) {
      // A bob of the head every so often, and now and then a hop round to face another way.
      bird.body.position.y = CAGE.bottom + 0.145 + Math.max(0, Math.sin(this.time * 7 + bird.phase)) * 0.004;
      bird.hop -= dt;
      if (bird.hop <= 0) {
        bird.hop = 1.5 + this.random() * 4;
        bird.body.rotation.y += (this.random() - 0.5) * 2.2;
      }
    }
  }
}
