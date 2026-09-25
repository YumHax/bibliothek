import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Body length and height at the shoulder, metres: a mid-sized mongrel. */
const SIZE = { length: 0.62, height: 0.42 };
const LEG = 0.26;
const TURN_RATE = 6;
const COATS = [0x7a5a3a, 0x2a2420, 0xd9c3a0, 0x9a6a3a, 0xe8e2d6];

/**
 * A dog on a lead: low-poly (a body, head and snout, ears, one mesh; four legs and a tail that
 * swing on their own pivots), trotting after a point it is given (just ahead of its walker, on
 * the kerb side), turning the way it goes, sitting down when its walker stops, the tail wagging
 * all the while. Coordinates are its parent's (the crowd's, zone-local). Fades with its walker.
 */
export class Dog extends THREE.Group {
  private readonly legs: THREE.Group[] = [];
  private readonly tail = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly material: THREE.MeshStandardMaterial;
  private readonly heading = { value: 0 };
  private phase = 0;
  private time = Math.random() * 10;
  private sitting = 0;
  /** Where the lead ties on (its parent's frame), for whoever draws the lead. */
  readonly collar = new THREE.Vector3();

  constructor(seed: number) {
    super();
    this.name = 'Dog';
    this.material = new THREE.MeshStandardMaterial({ color: COATS[seed % COATS.length], roughness: 0.9, flatShading: true, alphaHash: true });
    const { length, height } = SIZE;
    const trunk = new THREE.BoxGeometry(0.2, 0.2, length).translate(0, height, 0);
    const chest = new THREE.BoxGeometry(0.22, 0.24, 0.2).translate(0, height + 0.02, length / 2 - 0.1);
    const neck = new THREE.BoxGeometry(0.12, 0.18, 0.12).rotateX(-0.6).translate(0, height + 0.13, length / 2 + 0.02);
    const head = new THREE.BoxGeometry(0.16, 0.15, 0.17).translate(0, height + 0.23, length / 2 + 0.1);
    const snout = new THREE.BoxGeometry(0.09, 0.08, 0.11).translate(0, height + 0.19, length / 2 + 0.23);
    const earL = new THREE.BoxGeometry(0.05, 0.1, 0.03).rotateZ(0.3).translate(-0.07, height + 0.32, length / 2 + 0.07);
    const earR = new THREE.BoxGeometry(0.05, 0.1, 0.03).rotateZ(-0.3).translate(0.07, height + 0.32, length / 2 + 0.07);
    const parts = [trunk, chest, neck, head, snout, earL, earR];
    const merged = mergeGeometries(parts)!;
    for (const g of parts) g.dispose();
    const shape = new THREE.Mesh(merged, this.material);
    this.body.add(shape);
    for (const [x, z] of [[-0.07, length / 2 - 0.08], [0.07, length / 2 - 0.08], [-0.07, -length / 2 + 0.07], [0.07, -length / 2 + 0.07]] as const) {
      const pivot = new THREE.Group();
      pivot.position.set(x, height - 0.04, z);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.055, LEG + 0.12, 0.055).translate(0, -(LEG + 0.12) / 2, 0), this.material);
      pivot.add(leg);
      this.legs.push(pivot);
      this.body.add(pivot);
    }
    this.tail.position.set(0, height + 0.06, -length / 2);
    this.tail.add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.26).translate(0, 0, -0.12), this.material));
    this.body.add(this.tail);
    this.add(this.body);
    this.traverse((o) => {
      o.castShadow = false;
    });
  }

  /** 0 gone .. 1 solid (it goes with its walker). */
  setFade(amount: number): void {
    this.material.opacity = amount;
    this.visible = amount > 0.01;
  }

  /** Trots towards `target` (parent's frame); sits when it is there and `walking` is false. */
  update(dt: number, target: THREE.Vector3, walking: boolean): void {
    this.time += dt;
    const dx = target.x - this.position.x;
    const dz = target.z - this.position.z;
    const dist = Math.hypot(dx, dz);
    const speed = dist > 0.05 ? Math.min(dist * 3, 2.2) : 0;
    if (speed > 0) {
      const step = Math.min(dist, speed * dt);
      this.position.x += (dx / dist) * step;
      this.position.z += (dz / dist) * step;
      let delta = Math.atan2(dx, dz) - this.heading.value;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      this.heading.value += delta * Math.min(1, dt * TURN_RATE);
      this.rotation.y = this.heading.value;
    }
    const moving = speed > 0.15;
    this.phase += dt * speed * 9;
    this.sitting += ((!moving && !walking ? 1 : 0) - this.sitting) * Math.min(1, dt * 4);
    // Legs trot in diagonal pairs; sitting folds the hind legs and tips the body back.
    this.legs.forEach((leg, i) => {
      const swing = moving ? Math.sin(this.phase + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.55 : 0;
      const fold = i >= 2 ? -1.2 * this.sitting : 0;
      leg.rotation.x += (swing + fold - leg.rotation.x) * Math.min(1, dt * 12);
    });
    this.body.rotation.x = -0.35 * this.sitting;
    this.body.position.y = -0.1 * this.sitting;
    this.tail.rotation.set(-0.5 - 0.3 * this.sitting, Math.sin(this.time * (moving ? 9 : 6)) * 0.5, 0);
    this.collar.set(0, SIZE.height + 0.14, SIZE.length / 2).applyAxisAngle(Y, this.heading.value).add(this.position);
  }
}

const Y = new THREE.Vector3(0, 1, 0);
