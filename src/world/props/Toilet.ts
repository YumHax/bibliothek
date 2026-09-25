import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import type { Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { cylinderMesh, invisibleHitbox } from '../meshUtils';
import { part, matte } from './Prop';
import { ClickSpot } from './ClickSpot';
import { CERAMIC, CHROME, STILL_WATER, WHITE_PLASTIC } from './bathroomMaterials';

export interface ToiletOptions {
  /** A roll holder on the wall beside it (local +x) and a brush on the floor on the other side. Default true. */
  accessories?: boolean;
  /** Called when a click on the button flushes (the builder plays the sound from it). */
  onFlush?: () => void;
  /** How long a flush (rush and refill) lasts; the button does nothing until it is over. Default 8 s. */
  flushSeconds?: number;
}

/** The cistern against the wall; its lid is a shelf for whatever the plan puts there (see `CISTERN_TOP`). */
const CISTERN_W = 0.4;
export const CISTERN_DEPTH = 0.18;
const CISTERN_BOTTOM = 0.42;
const CISTERN_H = 0.4;
/** Height of the cistern lid's top face: `y` of a plant placed on it. */
export const CISTERN_TOP = CISTERN_BOTTOM + CISTERN_H + 0.03;
/** Where the pan's oval stands and how tall it is. */
const PAN_Z = 0.34;
const PAN_H = 0.39;
/** Local x of the flush button, of the roll holder and of the brush (the pan is 0.36 wide). */
const BUTTON_X = 0.1;
const ROLL_X = 0.36;
const BRUSH_X = -0.32;
/** What the collider covers: brush to roll holder, wall to the front of the pan. */
const FOOTPRINT = { minX: -0.4, maxX: 0.26, depth: 0.6 };
/** The lid's hinge line and how far it lifts (short of the cistern: it leans on it). */
const HINGE = { y: PAN_H + 0.027, z: CISTERN_DEPTH + 0.02 };
const LID_OPEN = -1.45;
const LID_SECONDS = 0.5;
/** How far the button sinks and for how long. */
const PRESS_DEPTH = 0.004;
const PRESS_SECONDS = 0.35;
/** In the bowl, the water drains in this share of the flush and is back by the next. */
const EMPTY_BY = 0.3;
const FULL_BY = 0.55;
/** The water's surface at rest, a hair over the bowl's glaze. */
const WATER_Y = PAN_H + 0.002;
/** The pool is an oval like the pan: stretched along z. */
const WATER_OVAL = 1.3;

const DARK = matte(0x3a3a3c, 0.6);
const PAPER = matte(0xf7f5f0, 0.95);
/** The glaze inside the bowl, a shade under the outside so the water reads. */
const THROAT = matte(0xd8dfe0, 0.2);

/**
 * A close-coupled WC: an oval pan on a pedestal, its seat and lid, the cistern on the wall
 * behind it with a chrome flush button on the lid; a roll holder on the wall to one side and a
 * brush on the floor on the other. Clicking the button flushes (the button sinks, the water in
 * the bowl drains and comes back; once per `flushSeconds`); clicking the seat lifts or lowers the
 * lid (`lidSpot`, placed by the builder with `placeWith`). Wall-hung with `y: 0`: origin on the
 * floor at the wall, +z into the room. Collides over the whole thing.
 */
export class Toilet extends THREE.Group implements Furniture, Interactable, Updatable {
  readonly footprint: THREE.Box3;
  readonly hitboxes: THREE.Object3D[];
  /** The click target on the seat that lifts and lowers the lid. */
  readonly lidSpot: ClickSpot;
  private readonly button: THREE.Mesh;
  private readonly lid = new THREE.Group();
  private readonly water: THREE.Mesh;
  private readonly flushSeconds: number;
  private flushLeft = 0;
  private lidTarget = 0;
  private lidOpenness = 0;

  constructor(private readonly options: ToiletOptions = {}) {
    super();
    this.name = 'Toilet';
    this.flushSeconds = options.flushSeconds ?? 8;
    this.button = this.buildCistern();
    this.water = this.buildPan();
    if (options.accessories ?? true) this.buildAccessories();

    const hitbox = invisibleHitbox(0.1, 0.05, 0.12, { x: BUTTON_X, y: CISTERN_TOP + 0.02, z: CISTERN_DEPTH / 2 });
    this.add(hitbox);
    this.hitboxes = [hitbox];
    this.lidSpot = new ClickSpot({
      size: [0.38, 0.1, 0.44],
      label: () => (this.lidTarget > 0 ? 'Click to put the lid down' : 'Click to lift the lid'),
      onClick: () => (this.lidTarget = this.lidTarget > 0 ? 0 : 1),
    });
    this.lidSpot.position.set(0, PAN_H + 0.05, PAN_Z + 0.02);

    this.footprint = new THREE.Box3(new THREE.Vector3(FOOTPRINT.minX, 0, 0), new THREE.Vector3(FOOTPRINT.maxX, CISTERN_TOP, FOOTPRINT.depth));
  }

  update(dt: number): void {
    if (this.lidOpenness !== this.lidTarget) {
      const step = dt / LID_SECONDS;
      this.lidOpenness = this.lidTarget > this.lidOpenness ? Math.min(1, this.lidOpenness + step) : Math.max(0, this.lidOpenness - step);
      this.lid.rotation.x = LID_OPEN * THREE.MathUtils.smoothstep(this.lidOpenness, 0, 1);
    }
    if (this.flushLeft <= 0) return;
    this.flushLeft = Math.max(0, this.flushLeft - dt);
    const t = 1 - this.flushLeft / this.flushSeconds;
    const since = t * this.flushSeconds;
    this.button.position.y = CISTERN_TOP + 0.003 - (since < PRESS_SECONDS ? PRESS_DEPTH : 0);
    // The water shrinks away down the throat and spreads back as the cistern refills the bowl.
    const level = t < EMPTY_BY ? 1 - t / EMPTY_BY : t < FULL_BY ? 0 : Math.min(1, (t - FULL_BY) / (1 - FULL_BY) * 1.6);
    const spread = 0.35 + 0.65 * level;
    this.water.scale.set(spread, 1, WATER_OVAL * spread);
    this.water.position.y = WATER_Y - 0.012 * (1 - level);
  }

  // --- Interactable -------------------------------------------------------------------------

  setHovered(_hovered: boolean): void {}

  label(): string | null {
    return this.flushLeft > 0 ? 'The cistern is refilling' : 'Click to flush';
  }

  activate(_session: SessionActions): void {
    if (this.flushLeft > 0) return;
    this.flushLeft = this.flushSeconds;
    this.options.onFlush?.();
  }

  /** The tank, its lid and the flush button (returned: it sinks when pressed). */
  private buildCistern(): THREE.Mesh {
    const z = CISTERN_DEPTH / 2;
    part(this, CISTERN_W, CISTERN_H, CISTERN_DEPTH, CERAMIC, { y: CISTERN_BOTTOM + CISTERN_H / 2, z });
    part(this, CISTERN_W + 0.02, 0.03, CISTERN_DEPTH + 0.02, CERAMIC, { y: CISTERN_TOP - 0.015, z: z + 0.01 });
    // Dual flush button, off-centre so there is room for a plant on the lid.
    const button = cylinderMesh(0.02, 0.006, CHROME, { x: BUTTON_X, y: CISTERN_TOP + 0.003, z }, { segments: 16 });
    this.add(button);
    return button;
  }

  /**
   * An oval pedestal (a cylinder stretched along z), the block joining it to the cistern, the
   * water in the bowl (returned: a flush drains it), the seat ring and the lid on its hinge.
   */
  private buildPan(): THREE.Mesh {
    const pan = cylinderMesh(0.17, PAN_H, CERAMIC, { y: PAN_H / 2, z: PAN_Z }, { radiusBottom: 0.12, segments: 24 });
    pan.scale.z = 1.4;
    this.add(pan);
    part(this, 0.3, PAN_H - 0.02, 0.24, CERAMIC, { y: (PAN_H - 0.02) / 2, z: CISTERN_DEPTH + 0.1 });
    // The bowl's inside, seen with the lid up: a darker glaze, the water on it.
    const throat = new THREE.Mesh(new THREE.CircleGeometry(0.135, 24), THROAT);
    throat.rotation.x = -Math.PI / 2;
    throat.scale.y = 1.35;
    throat.position.set(0, PAN_H + 0.001, PAN_Z + 0.01);
    const water = new THREE.Mesh(new THREE.CircleGeometry(0.1, 20).rotateX(-Math.PI / 2), STILL_WATER);
    water.scale.z = WATER_OVAL;
    water.position.set(0, WATER_Y, PAN_Z + 0.03);
    this.add(throat, water);

    const seat = new THREE.Mesh(new THREE.TorusGeometry(0.155, 0.028, 8, 28), WHITE_PLASTIC);
    seat.rotation.x = Math.PI / 2;
    seat.scale.set(1, 1.3, 0.36);
    seat.position.set(0, PAN_H + 0.01, PAN_Z);
    seat.castShadow = true;
    const lid = cylinderMesh(0.19, 0.014, WHITE_PLASTIC, { z: PAN_Z - 0.005 - HINGE.z }, { segments: 24 });
    lid.scale.z = 1.32;
    this.lid.position.set(0, HINGE.y, HINGE.z);
    this.lid.add(lid);
    this.add(seat, this.lid);
    // The hinge blocks where the lid meets the cistern.
    for (const dx of [-0.07, 0.07]) part(this, 0.03, 0.02, 0.04, WHITE_PLASTIC, { x: dx, y: PAN_H + 0.02, z: CISTERN_DEPTH + 0.02 });
    return water;
  }

  /** Chrome roll holder with a roll on it; a brush standing in its pot. */
  private buildAccessories(): void {
    const rollY = 0.7;
    part(this, 0.04, 0.05, 0.008, CHROME, { x: ROLL_X, y: rollY, z: 0.004 });
    const arm = cylinderMesh(0.005, 0.1, CHROME, { x: ROLL_X, y: rollY, z: 0.05 }, { segments: 8 });
    arm.rotation.x = Math.PI / 2;
    const axle = cylinderMesh(0.005, 0.13, CHROME, { x: ROLL_X + 0.06, y: rollY, z: 0.1 }, { segments: 8 });
    axle.rotation.z = Math.PI / 2;
    const roll = cylinderMesh(0.055, 0.1, PAPER, { x: ROLL_X + 0.065, y: rollY, z: 0.1 }, { segments: 18 });
    roll.rotation.z = Math.PI / 2;
    this.add(arm, axle, roll);
    // A loose end of paper hanging off the roll.
    const tail = part(this, 0.1, 0.12, 0.003, PAPER, { x: ROLL_X + 0.065, y: rollY - 0.09, z: 0.156 });
    tail.castShadow = false;

    const brushZ = 0.14;
    this.add(cylinderMesh(0.045, 0.13, DARK, { x: BRUSH_X, y: 0.065, z: brushZ }, { radiusBottom: 0.04, segments: 16 }));
    this.add(cylinderMesh(0.007, 0.3, CHROME, { x: BRUSH_X, y: 0.27, z: brushZ }, { segments: 8 }));
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), DARK);
    knob.position.set(BRUSH_X, 0.43, brushZ);
    this.add(knob);
  }
}
