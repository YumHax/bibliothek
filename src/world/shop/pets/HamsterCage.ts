import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../../Furniture';
import { cylinderMesh } from '../../meshUtils';
import { part } from '../../props/Prop';
import { METAL, paint, standard, timber } from '../../materials/palette';
import { mergeStaticParts } from '../../zone/mergeStatic';
import type { PropVoice, ShopVoiced } from '../common/fitting';
import { HamsterVoice } from './hamsterSounds';
import { lcg } from '@/random';

export interface HamsterCageOptions {
  /** The stand's width along the wall. Default 0.8. */
  width?: number;
  seed?: number;
}

const STAND = 0.66;
const DEPTH = 0.42;
const CAGE = { width: 0.6, depth: 0.36, tray: 0.12, wire: 0.26, bars: 0.022 };
const WHEEL = { radius: 0.085, width: 0.05 };
/** Seconds of a run in the wheel, and between runs. */
const RUN = [5, 12] as const;
const REST = [10, 30] as const;
/** The wheel's turn while it runs, radians a second. */
const SPIN = 7;

/**
 * The hamster's cage on a white stand: a blue plastic tray deep in shavings, a wire top (one merged mesh), a wooden
 * house, a water bottle clipped to the bars, a food bowl, and the wheel the hamster runs in now and then, heard as it
 * turns (`HamsterVoice`). Between runs it sits by its house, nose twitching. A bag of shavings and a spare bowl on the
 * stand's shelf. The shop's, not for sale. Wall-hung with `y: 0`: origin on the floor at the wall, +z into the room.
 * Collides as its box.
 */
export class HamsterCage extends THREE.Group implements Furniture, Updatable, ShopVoiced {
  readonly footprint: THREE.Box3;
  private readonly voice = new HamsterVoice();
  private readonly wheel = new THREE.Group();
  private readonly hamster = new THREE.Group();
  private readonly nose: THREE.Mesh;
  private readonly random: () => number;
  private readonly restAt: THREE.Vector3;
  private readonly runAt: THREE.Vector3;
  private running = false;
  private until: number;
  private time = 0;

  constructor(options: HamsterCageOptions = {}) {
    super();
    this.name = 'HamsterCage';
    const W = options.width ?? 0.8;
    this.random = lcg(options.seed ?? 41);
    this.until = REST[0] * 0.5;
    const still = new THREE.Group();
    this.add(still);

    // The stand: a white shelf unit, its shelf with a bag of shavings and a spare bowl.
    const white = paint(0xeeeae2, 0.5);
    part(still, W, 0.025, DEPTH, white, { y: STAND - 0.0125, z: DEPTH / 2 });
    part(still, W, 0.02, DEPTH, white, { y: 0.1, z: DEPTH / 2 });
    for (const s of [-1, 1]) part(still, 0.02, STAND, DEPTH, white, { x: (s * (W - 0.02)) / 2, y: STAND / 2, z: DEPTH / 2 });
    part(still, W, STAND, 0.012, white, { y: STAND / 2, z: 0.006 });
    part(still, 0.26, 0.3, 0.16, paint(0xe8d8a0, 0.9), { x: -W * 0.2, y: 0.11 + 0.15, z: DEPTH * 0.5 });
    part(still, 0.2, 0.08, 0.004, paint(0x3a8a5a, 0.7), { x: -W * 0.2, y: 0.11 + 0.18, z: DEPTH * 0.5 + 0.082 });
    still.add(cylinderMesh(0.05, 0.03, paint(0xd84a4a, 0.5), { x: W * 0.22, y: 0.125, z: DEPTH * 0.5 }, { radiusBottom: 0.04, segments: 14 }));

    // The cage on top: the tray, the shavings, the wire.
    const y0 = STAND;
    const zc = DEPTH / 2 + 0.01;
    part(still, CAGE.width, CAGE.tray, CAGE.depth, paint(0x3a78c0, 0.35), { y: y0 + CAGE.tray / 2, z: zc });
    part(still, CAGE.width - 0.02, 0.012, CAGE.depth - 0.02, paint(0xf0e2b8, 1), { y: y0 + CAGE.tray - 0.02, z: zc });
    const shaving = paint(0xe6d0a0, 1);
    for (let i = 0; i < 14; i++) {
      const s = 0.012 + this.random() * 0.02;
      part(still, s * 1.8, 0.006, s, shaving, { x: (this.random() - 0.5) * (CAGE.width - 0.06), y: y0 + CAGE.tray - 0.012, z: zc + (this.random() - 0.5) * (CAGE.depth - 0.06) });
    }
    const wires: THREE.BufferGeometry[] = [];
    const top = y0 + CAGE.tray + CAGE.wire;
    const bar = (length: number, x: number, y: number, z: number, axis: 'x' | 'y' | 'z'): void => {
      const g = new THREE.CylinderGeometry(0.0016, 0.0016, length, 4);
      if (axis === 'x') g.rotateZ(Math.PI / 2);
      if (axis === 'z') g.rotateX(Math.PI / 2);
      wires.push(g.translate(x, y, z));
    };
    const hw = CAGE.width / 2;
    const hd = CAGE.depth / 2;
    for (let x = -hw; x <= hw + 1e-6; x += CAGE.bars) for (const z of [-hd, hd]) bar(CAGE.wire, x, y0 + CAGE.tray + CAGE.wire / 2, zc + z, 'y');
    for (let z = -hd + CAGE.bars; z < hd - 1e-6; z += CAGE.bars) for (const x of [-hw, hw]) bar(CAGE.wire, x, y0 + CAGE.tray + CAGE.wire / 2, zc + z, 'y');
    for (let z = -hd; z <= hd + 1e-6; z += CAGE.bars) bar(CAGE.width, 0, top, zc + z, 'x');
    for (const y of [y0 + CAGE.tray, top]) for (const z of [-hd, hd]) bar(CAGE.width, 0, y, zc + z, 'x');
    for (const y of [y0 + CAGE.tray, top]) for (const x of [-hw, hw]) bar(CAGE.depth, x, y, zc, 'z');
    const wire = new THREE.Mesh(mergeGeometries(wires.map((g) => g.toNonIndexed()))!, METAL.satinSteel());
    for (const g of wires) g.dispose();
    wire.castShadow = false;
    this.add(wire);
    // The house, the bowl, the bottle clipped on the side.
    const floor = y0 + CAGE.tray - 0.014;
    const pine = timber(0xc9a473, 0.6);
    part(still, 0.12, 0.08, 0.1, pine, { x: -hw + 0.1, y: floor + 0.04, z: zc - 0.06 });
    const roof = part(still, 0.14, 0.012, 0.12, timber(0x8a6a44, 0.6), { x: -hw + 0.1, y: floor + 0.086, z: zc - 0.06 });
    roof.rotation.z = 0.12;
    part(still, 0.035, 0.035, 0.004, paint(0x2a2018, 1), { x: -hw + 0.1, y: floor + 0.02, z: zc - 0.009 });
    still.add(cylinderMesh(0.03, 0.018, paint(0xe8c040, 0.4), { x: 0.02, y: floor + 0.009, z: zc + 0.1 }, { radiusBottom: 0.026, segments: 12 }));
    const bottle = standard({ color: 0xcfe6f0, roughness: 0.1, transparent: true, opacity: 0.45, depthWrite: false });
    const b = cylinderMesh(0.02, 0.14, bottle, { x: hw - 0.04, y: floor + 0.16, z: zc + hd + 0.022 }, { segments: 12 });
    b.castShadow = false;
    this.add(b);
    still.add(cylinderMesh(0.004, 0.05, METAL.steel(), { x: hw - 0.04, y: floor + 0.07, z: zc + hd + 0.01 }, { segments: 6 }));

    // The wheel, on its stand, at the right end.
    const wheelAt = new THREE.Vector3(hw - 0.12, floor + WHEEL.radius + 0.02, zc - 0.02);
    part(still, 0.012, WHEEL.radius + 0.02, 0.012, METAL.satinSteel(), { x: wheelAt.x, y: floor + (WHEEL.radius + 0.02) / 2, z: wheelAt.z - WHEEL.width / 2 - 0.008 });
    part(still, 0.07, 0.008, 0.05, METAL.satinSteel(), { x: wheelAt.x, y: floor + 0.004, z: wheelAt.z - WHEEL.width / 2 - 0.01 });
    this.wheel.position.copy(wheelAt);
    const wheelPaint = paint(0xe84a8a, 0.4);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(WHEEL.radius, WHEEL.radius, WHEEL.width, 24, 1, true).rotateX(Math.PI / 2), standard({ color: 0xe84a8a, roughness: 0.4, side: THREE.DoubleSide }));
    rim.castShadow = false;
    this.wheel.add(rim);
    const back = new THREE.Mesh(new THREE.CircleGeometry(WHEEL.radius, 24), wheelPaint);
    back.position.z = -WHEEL.width / 2;
    this.wheel.add(back);
    for (let i = 0; i < 4; i++) {
      const rung = part(this.wheel, 0.006, WHEEL.width, 0.004, paint(0xf4f0f0, 0.4), {});
      const a = (i / 4) * Math.PI * 2;
      rung.rotation.x = Math.PI / 2;
      rung.position.set(Math.cos(a) * (WHEEL.radius - 0.004), Math.sin(a) * (WHEEL.radius - 0.004), 0);
    }
    this.add(this.wheel);

    // The hamster: golden with a white belly, pink ears and nose, black eyes.
    const fur = paint(0xd8964a, 0.95);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8).scale(1.35, 0.9, 1), fur);
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.026, 10, 6).scale(1.2, 0.7, 0.9), paint(0xf4ece0, 0.95));
    belly.position.set(0.004, -0.008, 0);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), fur);
    head.position.set(0.036, 0.006, 0);
    const pink = paint(0xe8a0a0, 0.7);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6).scale(1, 1, 0.4), pink);
      ear.position.set(0.03, 0.024, s * 0.012);
      this.hamster.add(ear);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.004, 6, 4), paint(0x0a0a0a, 0.2));
      eye.position.set(0.05, 0.012, s * 0.01);
      this.hamster.add(eye);
    }
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.004, 6, 4), pink);
    nose.position.set(0.056, 0.004, 0);
    this.nose = nose;
    this.hamster.add(body, belly, head, nose);
    this.hamster.traverse((o) => (o.castShadow = false));
    this.add(this.hamster);
    this.restAt = new THREE.Vector3(-hw + 0.1, floor + 0.026, zc + 0.03);
    this.runAt = new THREE.Vector3(wheelAt.x, wheelAt.y - WHEEL.radius + 0.028, wheelAt.z);
    this.settle();

    mergeStaticParts(still);
    // The wheel and the hamster move as wholes: each merges within itself (the twitching nose apart).
    mergeStaticParts(this.wheel);
    nose.userData.keepParts = true;
    mergeStaticParts(this.hamster);
    this.footprint = new THREE.Box3(new THREE.Vector3(-W / 2, 0, 0), new THREE.Vector3(W / 2, top + 0.01, DEPTH));
  }

  voices(): readonly PropVoice[] {
    return [{ voice: this.voice, at: new THREE.Vector3(0, STAND + 0.2, DEPTH / 2), options: { referenceDistance: 0.8, maxDistance: 7 } }];
  }

  update(dt: number): void {
    this.time += dt;
    this.until -= dt;
    if (this.until <= 0) {
      this.running = !this.running;
      const [a, b] = this.running ? RUN : REST;
      this.until = a + this.random() * (b - a);
      this.voice.setRunning(this.running);
      this.settle();
    }
    if (this.running) {
      this.wheel.rotation.z -= SPIN * dt;
      // Its gait: a quick bob as it runs on the spot.
      this.hamster.position.y = this.runAt.y + Math.abs(Math.sin(this.time * 18)) * 0.004;
    } else {
      this.nose.scale.setScalar(1 + 0.25 * Math.max(0, Math.sin(this.time * 11)) * (Math.sin(this.time * 0.9) > 0.3 ? 1 : 0));
    }
  }

  /** Puts the hamster where it now is: in the wheel facing along it, or by its house facing the room. */
  private settle(): void {
    this.hamster.position.copy(this.running ? this.runAt : this.restAt);
    this.hamster.rotation.y = this.running ? 0 : -Math.PI / 2 + 0.4;
  }
}
