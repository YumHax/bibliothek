import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import type { Furniture } from '../../Furniture';
import { invisibleHitbox } from '../../meshUtils';
import type { RoadObstacle, StreetTraffic } from '../traffic/StreetTraffic';
import { FRONT, KERB_HEIGHT, type Vec2 } from '../streetPlan';

export interface StrayCatOptions {
  /** Where it likes to sit: a spot on the ground, how high the perch is (a car roof, a bench, a bin), the way it faces. */
  perches: readonly { at: Vec2; y: number; yaw: number }[];
  viewer: THREE.Object3D;
  /** Drivers stop for it while it crosses the road. */
  traffic: StreetTraffic;
}

/** It gets up and goes when the player comes this close. */
const WARY = 2.2;
const WALK = 1.7;
const JUMP = 0.45;
const TURN_RATE = 7;
const LINES = [
  'The ginger tom the whole street feeds. He gives you a long, slow blink.',
  'He ignores you with great dignity.',
  'Mrrp. A flick of the tail, and back to washing.',
  'He looks at you as if you owed him a sardine.',
  'The laundry lady calls him Mistigri. The butcher calls him Trouble.',
];

type State = { kind: 'perched'; since: number } | { kind: 'down' | 'walk' | 'up'; t: number; from: THREE.Vector3; to: THREE.Vector3 };

class CatObstacle implements RoadObstacle {
  readonly position = new THREE.Vector3();
  readonly radius = 0.4;
  active = false;
}

/**
 * The street's stray: a ginger tom (low-poly, its own simple model: a body, head and ears in one
 * mesh, four legs and a three-piece tail on pivots) who sits on his perches (a parked car's roof,
 * the bench, a bin lid, by the park railings), washes a paw, flicks his tail and watches the
 * street; when the player comes within `WARY` metres he jumps down and slinks off to another
 * perch away from them, jumping up onto it. On the road he is an obstacle drivers stop for.
 * Clicking him gets a line (and a look). Zone-local; the group moves itself.
 */
export class StrayCat extends THREE.Group implements Furniture, Updatable, Interactable {
  readonly contactShadow = false;
  readonly hitboxes: THREE.Object3D[];
  private readonly body = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly legs: THREE.Group[] = [];
  private readonly tail: THREE.Group[] = [];
  private readonly obstacle = new CatObstacle();
  private readonly eye = new THREE.Vector3();
  private readonly toEye = new THREE.Vector3();
  private state: State = { kind: 'perched', since: 0 };
  private perch = 0;
  private next = 0;
  private heading = 0;
  private time = Math.random() * 10;
  private phase = 0;
  private sitting = 1;
  private groom = 0;
  private stare = 0;
  private line = 0;
  private started = false;

  constructor(private readonly options: StrayCatOptions) {
    super();
    this.name = 'StrayCat';
    const coat = new THREE.MeshStandardMaterial({ color: 0xc8743a, roughness: 0.85, flatShading: true });
    const dark = new THREE.MeshStandardMaterial({ color: 0x8a4a22, roughness: 0.85, flatShading: true });
    const trunk = new THREE.BoxGeometry(0.15, 0.14, 0.36).translate(0, 0.2, 0);
    const haunch = new THREE.BoxGeometry(0.16, 0.13, 0.12).translate(0, 0.19, -0.13);
    this.body.add(mesh(mergeAll([trunk, haunch]), coat));
    // Stripes: three dark bands over the back.
    this.body.add(mesh(mergeAll([-0.1, 0, 0.1].map((z) => new THREE.BoxGeometry(0.155, 0.02, 0.035).translate(0, 0.27, z))), dark));
    const skull = new THREE.BoxGeometry(0.11, 0.1, 0.1).translate(0, 0.04, 0.03);
    const muzzle = new THREE.BoxGeometry(0.06, 0.045, 0.04).translate(0, 0.015, 0.09);
    const ears = [-1, 1].map((s) => new THREE.ConeGeometry(0.025, 0.05, 4).translate(s * 0.035, 0.11, 0.02));
    this.head.add(mesh(mergeAll([skull, muzzle, ...ears]), coat));
    this.head.position.set(0, 0.29, 0.19);
    this.body.add(this.head);
    for (const [x, z] of [[-0.05, 0.13], [0.05, 0.13], [-0.05, -0.14], [0.05, -0.14]] as const) {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.17, z);
      pivot.add(mesh(new THREE.BoxGeometry(0.035, 0.18, 0.035).translate(0, -0.09, 0), coat));
      this.legs.push(pivot);
      this.body.add(pivot);
    }
    // The tail: three pieces, each hinged on the one before.
    let parent: THREE.Object3D = this.body;
    for (let i = 0; i < 3; i++) {
      const piece = new THREE.Group();
      piece.position.set(0, i === 0 ? 0.24 : 0, i === 0 ? -0.19 : -0.09);
      piece.add(mesh(new THREE.BoxGeometry(0.03, 0.03, 0.1).translate(0, 0, -0.045), i === 2 ? dark : coat));
      parent.add(piece);
      this.tail.push(piece);
      parent = piece;
    }
    this.add(this.body);
    const hitbox = invisibleHitbox(0.35, 0.4, 0.55, { y: 0.2 });
    this.body.add(hitbox);
    this.hitboxes = [hitbox];
    this.traverse((o) => {
      o.castShadow = o !== hitbox;
    });
    this.perch = Math.floor(Math.random() * options.perches.length);
    options.traffic.obstacles.add(this.obstacle);
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  dispose(): void {
    this.options.traffic.obstacles.delete(this.obstacle);
  }

  setHovered(): void {
    // A cat does not glow.
  }

  label(): string {
    return 'Click to talk to the stray cat';
  }

  activate(session: SessionActions): void {
    this.stare = 3;
    session.hint(LINES[this.line++ % LINES.length]!);
  }

  update(dt: number): void {
    if (!this.started) {
      // On its perch from the first frame (placing it in the zone set it at the origin).
      this.started = true;
      const p = this.options.perches[this.perch]!;
      this.position.set(p.at[0], groundY(p.at[1]) + p.y, p.at[1]);
      this.heading = p.yaw;
    }
    this.time += dt;
    this.options.viewer.getWorldPosition(this.eye);
    if (this.parent) this.parent.worldToLocal(this.eye);
    const near = Math.hypot(this.eye.x - this.position.x, this.eye.z - this.position.z);
    const state = this.state;
    if (state.kind === 'perched') {
      state.since += dt;
      if (near < WARY && state.since > 1.5) this.leave();
    } else this.move(state, dt);
    this.animate(dt);
    this.obstacle.position.copy(this.position);
    this.obstacle.active = this.state.kind !== 'perched' && Math.abs(this.position.z) < FRONT.farKerb + 0.2;
  }

  /** Off the perch, towards another one away from the player. */
  private leave(): void {
    const { perches } = this.options;
    let best = this.perch;
    let far = -1;
    for (let i = 0; i < perches.length; i++) {
      if (i === this.perch) continue;
      const [x, z] = perches[i]!.at;
      const d = Math.hypot(x - this.eye.x, z - this.eye.z) + Math.random() * 4;
      if (d > far) {
        far = d;
        best = i;
      }
    }
    this.next = best;
    const here = this.position.clone();
    const down = new THREE.Vector3(here.x, groundY(here.z), here.z);
    this.state = here.y > groundY(here.z) + 0.05 ? { kind: 'down', t: 0, from: here, to: down.add(this.toward(best, 0.35)) } : { kind: 'walk', t: 0, from: here, to: this.groundAt(best) };
  }

  private move(state: Extract<State, { kind: 'down' | 'walk' | 'up' }>, dt: number): void {
    const length = Math.max(0.01, Math.hypot(state.to.x - state.from.x, state.to.z - state.from.z));
    const duration = state.kind === 'walk' ? length / WALK : JUMP;
    state.t = Math.min(1, state.t + dt / duration);
    this.position.lerpVectors(state.from, state.to, state.t);
    if (state.kind !== 'walk') this.position.y += Math.sin(state.t * Math.PI) * 0.25;
    this.face(Math.atan2(state.to.x - state.from.x, state.to.z - state.from.z), dt);
    if (state.t < 1) return;
    const perch = this.options.perches[this.next]!;
    if (state.kind === 'down') this.state = { kind: 'walk', t: 0, from: this.position.clone(), to: this.groundAt(this.next) };
    else if (state.kind === 'walk' && perch.y > 0.05) this.state = { kind: 'up', t: 0, from: this.position.clone(), to: new THREE.Vector3(perch.at[0], groundY(perch.at[1]) + perch.y, perch.at[1]) };
    else {
      this.perch = this.next;
      this.state = { kind: 'perched', since: 0 };
    }
  }

  /** The ground spot beside perch `i` (on the way in), or the perch itself when it is on the ground. */
  private groundAt(i: number): THREE.Vector3 {
    const p = this.options.perches[i]!;
    const spot = new THREE.Vector3(p.at[0], 0, p.at[1]);
    if (p.y > 0.05) spot.sub(this.toward(i, 0.35));
    spot.y = groundY(spot.z);
    return spot;
  }

  /** A short step towards perch `i` from where the cat is (flat). */
  private toward(i: number, length: number): THREE.Vector3 {
    const [x, z] = this.options.perches[i]!.at;
    const d = new THREE.Vector3(x - this.position.x, 0, z - this.position.z);
    return d.lengthSq() > 1e-6 ? d.normalize().multiplyScalar(length) : d;
  }

  private face(yaw: number, dt: number): void {
    let delta = yaw - this.heading;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    this.heading += delta * Math.min(1, dt * TURN_RATE);
  }

  /** Sitting and washing on a perch; trotting, tail up, on the way. */
  private animate(dt: number): void {
    const perched = this.state.kind === 'perched';
    if (perched) this.face(this.options.perches[this.perch]!.yaw, dt);
    this.rotation.y = this.heading;
    const moving = this.state.kind === 'walk';
    this.sitting += ((perched ? 1 : 0) - this.sitting) * Math.min(1, dt * 5);
    if (moving) this.phase += dt * WALK * 11;
    // Sitting: haunches down, the body tipped up, the forelegs straight.
    this.body.rotation.x = -0.55 * this.sitting;
    this.body.position.y = -0.07 * this.sitting;
    this.legs.forEach((leg, i) => {
      const trot = moving ? Math.sin(this.phase + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.6 : 0;
      const sit = i < 2 ? 0.55 * this.sitting : -1.0 * this.sitting;
      leg.rotation.x = trot + sit;
    });
    // Washing now and then: the head dips to a raised paw.
    this.groom -= dt;
    if (perched && this.groom < -6 - Math.random() * 6) this.groom = 2.5;
    const washing = perched && this.groom > 0;
    this.stare = Math.max(0, this.stare - dt);
    let headYaw = Math.sin(this.time * 0.4) * 0.5;
    let headPitch = washing ? 0.6 + Math.sin(this.time * 9) * 0.15 : 0.35 * this.sitting;
    if (this.stare > 0) {
      this.toEye.copy(this.eye).sub(this.position);
      const local = Math.atan2(this.toEye.x, this.toEye.z) - this.heading;
      headYaw = THREE.MathUtils.clamp(Math.atan2(Math.sin(local), Math.cos(local)), -1.2, 1.2);
      headPitch = 0.2;
    }
    this.head.rotation.set(headPitch, headYaw, 0, 'YXZ');
    this.legs[0]!.rotation.x += washing ? -1.1 * Math.max(0, Math.sin(this.time * 9)) : 0;
    // The tail: up and curling on the move, curled round and flicking at the tip when sitting.
    const flick = Math.sin(this.time * (perched ? 3.3 : 5)) * (perched ? 0.25 : 0.35);
    this.tail[0]!.rotation.set(moving ? -1.1 : 0.9 * this.sitting, 0, 0);
    this.tail[1]!.rotation.set(moving ? 0.2 : 0.3, perched ? 0.9 : flick, 0);
    this.tail[2]!.rotation.set(0.2, perched ? flick * 2 : flick, 0);
  }
}

/** The ground's height under z: the road is a kerb below the pavements. */
function groundY(z: number): number {
  return Math.abs(z) < FRONT.farKerb ? -KERB_HEIGHT : 0;
}

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(geometry, material);
  m.receiveShadow = true;
  return m;
}

function mergeAll(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)))!;
  for (const g of parts) g.dispose();
  return merged;
}
