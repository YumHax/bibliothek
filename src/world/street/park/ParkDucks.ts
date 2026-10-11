import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { damp, dampAngle } from '@/math/damp';
import { lcg } from '@/random';
import type { Furniture } from '../../Furniture';
import { paint } from '../../materials/palette';
import { insidePond } from '../../city/park';
import { inFlatFrame } from '../../city/frontage';
import { LAWN_Y } from '../StreetGround';
import type { Vec2 } from '@/world/measures/street';

interface ParkDucksOptions {
  count: number;
  /** Where they paddle about (zone-local): a box of the pond's water, kept inside the pond's kerb. */
  water: { x0: number; x1: number; z0: number; z1: number };
  /** Where they crowd when fed (zone-local): the water under the near bank. */
  fedAt: Vec2;
  /** A duck quacking at a spot (`StreetCues.quack`): now and then, often while fed. */
  quack?: (at: Vec2) => void;
}

/** Paddling speed (m/s), and a fed duck's hurry. */
const PADDLE = 0.35;
const HURRY = 0.9;
/** How long a feed keeps them at the bank (s), and how far apart they jostle there (m). */
const FED_FOR = 26;
const JOSTLE = 1.4;
/** The water's top over the lawn (`StreetParkFeatures`' pond is a hand under its kerb, on the lawn). */
const FLOAT = LAWN_Y + 0.012;
/** They keep this far inside the pond's kerb. */
const KERB_CLEAR = -2.5;

interface Duck {
  body: THREE.Group;
  head: THREE.Group;
  target: THREE.Vector2;
  heading: number;
  /** Seconds to the next idle turn. */
  wander: number;
  /** Dabbling: head down for a moment. */
  dip: number;
  phase: number;
}

/**
 * The ducks on the pond's near side (docs/zones.md "The street", the park): a few mallards, drakes with their green
 * heads and the brown hens, paddling about slowly, turning now and then, dabbling. Fed from the bank (`feed`, the
 * builder's `PondBank`), they hurry over and jostle under it a while, dipping for the crumbs, then drift off again.
 * Origin: the zone's. Nothing collides (they are on the water).
 */
export class ParkDucks extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  readonly footprint = new THREE.Box3();
  private readonly ducks: Duck[] = [];
  private readonly random = lcg(4711);
  private fed = 0;
  /** Seconds to the next quack. */
  private call = 6;

  constructor(private readonly options: ParkDucksOptions) {
    super();
    this.name = 'ParkDucks';
    const brown = paint(0x7a5a3a, 0.8);
    const grey = paint(0xb8b0a2, 0.8);
    const green = paint(0x1e5a3a, 0.45);
    const henHead = paint(0x8a6a48, 0.8);
    const beak = paint(0xe0a020, 0.5);
    const white = paint(0xf0ece4, 0.7);
    const bodyShape = new THREE.SphereGeometry(0.15, 12, 8);
    const headShape = new THREE.SphereGeometry(0.065, 10, 8);
    const beakShape = new THREE.BoxGeometry(0.055, 0.02, 0.07);
    const tailShape = new THREE.ConeGeometry(0.05, 0.1, 6);
    for (let i = 0; i < options.count; i++) {
      const drake = i % 2 === 0;
      const body = new THREE.Group();
      const torso = new THREE.Mesh(bodyShape, drake ? grey : brown);
      torso.scale.set(0.85, 0.62, 1.35);
      torso.castShadow = true;
      body.add(torso);
      const tail = new THREE.Mesh(tailShape, drake ? paint(0x2a2a2a, 0.7) : brown);
      tail.rotation.x = -Math.PI / 2 - 0.5;
      tail.position.set(0, 0.04, -0.2);
      body.add(tail);
      const head = new THREE.Group();
      head.position.set(0, 0.12, 0.15);
      const skull = new THREE.Mesh(headShape, drake ? green : henHead);
      skull.castShadow = true;
      head.add(skull);
      const bill = new THREE.Mesh(beakShape, beak);
      bill.position.set(0, -0.01, 0.075);
      head.add(bill);
      if (drake) {
        const collar = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.008, 4, 12), white);
        collar.rotation.x = Math.PI / 2;
        collar.position.y = -0.055;
        head.add(collar);
      }
      body.add(head);
      const start = this.spot(new THREE.Vector2());
      body.position.set(start.x, FLOAT, start.y);
      this.add(body);
      this.ducks.push({ body, head, target: this.spot(new THREE.Vector2()), heading: this.random() * Math.PI * 2, wander: this.random() * 6, dip: 0, phase: this.random() * 10 });
    }
  }

  /** Crumbs thrown from the bank: they come over and stay a while. */
  feed(): void {
    this.fed = FED_FOR;
    const [x, z] = this.options.fedAt;
    for (const duck of this.ducks) duck.target.set(x - this.random() * JOSTLE, z + (this.random() - 0.5) * JOSTLE * 2);
  }

  /** Whether they are crowding the bank now (fed a moment ago). */
  get crowding(): boolean {
    return this.fed > 0;
  }

  update(dt: number): void {
    const wasFed = this.fed > 0;
    this.fed = Math.max(0, this.fed - dt);
    const fed = this.fed > 0;
    this.call -= dt;
    if (this.call <= 0) {
      this.call = fed ? 1.5 + this.random() * 3 : 8 + this.random() * 16;
      const caller = this.ducks[Math.floor(this.random() * this.ducks.length)];
      if (caller) this.options.quack?.([caller.body.position.x, caller.body.position.z]);
    }
    for (const duck of this.ducks) {
      const { body } = duck;
      duck.phase += dt;
      duck.wander -= dt;
      // Idle: a new spot now and then; fed: a new jostle under the bank, the crumbs where they fall.
      if (wasFed && !fed) this.spot(duck.target);
      if (duck.wander <= 0) {
        duck.wander = (fed ? 2 : 5) + this.random() * 6;
        if (fed) duck.target.set(this.options.fedAt[0] - this.random() * JOSTLE, this.options.fedAt[1] + (this.random() - 0.5) * JOSTLE * 2);
        else this.spot(duck.target);
        if (this.random() < (fed ? 0.7 : 0.3)) duck.dip = 1.2;
      }
      const dx = duck.target.x - body.position.x;
      const dz = duck.target.y - body.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance > 0.08) {
        duck.heading = dampAngle(duck.heading, Math.atan2(dx, dz), 2.5, dt);
        const speed = Math.min(distance, (fed ? HURRY : PADDLE) * dt);
        body.position.x += Math.sin(duck.heading) * speed;
        body.position.z += Math.cos(duck.heading) * speed;
      }
      body.rotation.y = duck.heading;
      // Bobbing on the ripples; the head down for a dabble now and then.
      body.position.y = FLOAT + Math.sin(duck.phase * 2.1) * 0.008;
      duck.dip = Math.max(0, duck.dip - dt);
      duck.head.rotation.x = damp(duck.head.rotation.x, duck.dip > 0 ? 1.1 : 0, 8, dt);
      duck.head.position.y = damp(duck.head.position.y, duck.dip > 0 ? 0.03 : 0.12, 8, dt);
    }
  }

  /** A spot of their water inside the pond's kerb, into `out`. */
  private spot(out: THREE.Vector2): THREE.Vector2 {
    const { x0, x1, z0, z1 } = this.options.water;
    for (let i = 0; i < 20; i++) {
      const x = x0 + this.random() * (x1 - x0);
      const z = z0 + this.random() * (z1 - z0);
      const [fx, fz] = inFlatFrame([x, z]);
      if (insidePond(fx, fz, KERB_CLEAR)) return out.set(x, z);
    }
    return out.set(this.options.fedAt[0] - 2, this.options.fedAt[1]);
  }
}
