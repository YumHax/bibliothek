import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SeatLike, SessionActions } from '@/game/SessionActions';
import type { Furniture } from '../Furniture';
import { FACING_OUT, eyePoseAt, invisibleHitbox } from '../meshUtils';
import { cloth, paint, timber } from '../materials/palette';
import { GLASS, asGlass } from '../materials/glass';
import { part } from '../props/Prop';
import { HoverGlint } from '../props/hoverGlint';
import { UsableProp, type UseOptions } from '../props/UsableProp';

/*
 * The film night's things in the yard (`YardCinema` sets them out): the folding chairs, the trestle the projector
 * stands on (two wine crates under it, the evening's drinks at its end), the sheet hung on the workshop's wall or
 * rolled up under its parapet, the chairs stacked against the wall the rest of the time, the projector's lead.
 */

const SEAT = { width: 0.42, depth: 0.4, height: 0.45 };
/** Seated on one, the eye is this high over the floor, a little behind the seat's middle. */
const EYE = new THREE.Vector3(0, 1.16, -0.02);
const FRAME = paint(0x3d4a44, 0.45);
const SLATS = timber(0x9a6a3a, 0.6);
const LINEN = cloth(0xf2efe6, 0.95);
const CORD = paint(0x8a7a5a, 0.9);
/** How far the hung sheet bellies out towards the yard at its middle (m). */
const BELLY = 0.006;

/** A folding chair's frame and slats (origin on the floor at the seat's middle, +z the way a sitter faces), added to `parent`. */
function chairModel(parent: THREE.Object3D): THREE.Mesh {
  const { width, depth, height } = SEAT;
  // Two crossed legs a side: front up to the seat's back edge, back up to the backrest.
  for (const x of [-1, 1]) {
    const side = x * (width / 2 - 0.015);
    for (const [from, to] of [
      [depth / 2, -depth / 2 + 0.03],
      [-depth / 2, depth / 2 - 0.03],
    ] as const) {
      const length = Math.hypot(height, to - from);
      const leg = part(parent, 0.022, length, 0.022, FRAME, { x: side, y: height / 2, z: (from + to) / 2 });
      leg.rotation.x = Math.atan2(to - from, height);
    }
    part(parent, 0.022, 0.42, 0.022, FRAME, { x: side, y: height + 0.21, z: -depth / 2 + 0.03 });
  }
  const seat = part(parent, width - 0.03, 0.025, depth - 0.04, SLATS, { y: height + 0.0125 });
  part(parent, width - 0.03, 0.12, 0.018, SLATS, { y: height + 0.32, z: -depth / 2 + 0.03 });
  return seat;
}

/**
 * A folding chair set out for the film: a resident sits on it (`taken`), or the player (a click; any movement key
 * stands up). Origin on the floor at the seat's middle, +z the way a sitter faces.
 */
export class FoldingChair extends THREE.Group implements Furniture, Interactable, SeatLike {
  readonly hitboxes: THREE.Object3D[];
  /** A resident sits here: not offered to the player. */
  taken = false;
  private readonly glint: HoverGlint;

  constructor(blanket: number | null) {
    super();
    this.name = 'FoldingChair';
    const seat = chairModel(this);
    // In the cold: a plaid folded over the seat's back, for the knees.
    if (blanket !== null) part(this, SEAT.width - 0.06, 0.2, 0.04, cloth(blanket, 1), { y: SEAT.height + 0.26, z: -SEAT.depth / 2 + 0.06 });
    this.glint = HoverGlint.of(seat);
    const hitbox = invisibleHitbox(SEAT.width, SEAT.height + 0.45, SEAT.depth, { y: (SEAT.height + 0.45) / 2 });
    this.add(hitbox);
    this.hitboxes = [hitbox];
  }

  /** The seat's height, for whoever sits on it. */
  static get seatHeight(): number {
    return SEAT.height;
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(-SEAT.width / 2, 0, -SEAT.depth / 2), new THREE.Vector3(SEAT.width / 2, SEAT.height + 0.45, SEAT.depth / 2));
  }

  eyePose(): { position: THREE.Vector3; yaw: number } {
    return eyePoseAt(this, EYE, FACING_OUT);
  }

  setHovered(hovered: boolean): void {
    this.glint.set(!this.taken && hovered);
  }

  label(): string | null {
    return this.taken ? null : 'A chair · sit down';
  }

  activate(session: SessionActions): void {
    if (!this.taken) session.sit(this);
  }
}

const TABLE = { width: 1.2, depth: 0.6, height: 0.72 };
const CRATE = { width: 0.5, depth: 0.33, height: 0.26 };
/** A crate's boards' thickness. */
const BOARD = 0.015;

/** How high the trestle and its two crates put the projector. */
export const TRESTLE_TOP = TABLE.height + 2 * CRATE.height;

/**
 * The trestle: a board on two folding trestles, two wine crates stacked at its middle for the projector to stand on,
 * at its end the evening's drinks (a jug of lemonade and glasses in summer, a thermos and mugs when it is cold).
 * Origin on the floor at the board's middle; +z the way the projector throws.
 */
export class CinemaTrestle extends THREE.Group implements Furniture {
  readonly contactShadow = true;
  readonly colliders: THREE.Box3[];

  constructor(warm: boolean) {
    super();
    this.name = 'CinemaTrestle';
    const { width, depth, height } = TABLE;
    const wood = timber(0xb08a5a, 0.65);
    part(this, width, 0.03, depth, wood, { y: height - 0.015 });
    for (const x of [-1, 1]) {
      for (const z of [-1, 1]) {
        const leg = part(this, 0.04, height - 0.03, 0.04, timber(0x7a5a3a, 0.7), { x: x * (width / 2 - 0.12), y: (height - 0.03) / 2, z: z * (depth / 2 - 0.1) });
        leg.rotation.x = z * 0.12;
      }
      part(this, 0.04, 0.04, depth - 0.1, timber(0x7a5a3a, 0.7), { x: x * (width / 2 - 0.12), y: height - 0.05 });
    }
    const crate = timber(0xc4a070, 0.75);
    for (let i = 0; i < 2; i++) {
      const y = height + i * CRATE.height;
      // Four sides and a bottom, slats with gaps reading as a crate.
      part(this, CRATE.width, BOARD, CRATE.depth, crate, { y: y + BOARD / 2 });
      for (const z of [-1, 1]) for (const h of [0.05, 0.19]) part(this, CRATE.width, 0.08, BOARD, crate, { y: y + h, z: z * (CRATE.depth - BOARD) / 2 });
      for (const x of [-1, 1]) for (const h of [0.05, 0.19]) part(this, BOARD, 0.08, CRATE.depth - 2 * BOARD, crate, { x: x * (CRATE.width - BOARD) / 2, y: y + h });
      part(this, CRATE.width - 2 * BOARD, BOARD, CRATE.depth - 2 * BOARD, crate, { y: y + CRATE.height - BOARD / 2 });
    }
    const drinksX = width / 2 - 0.13;
    const top = height;
    if (warm) {
      // A thermos and three mugs.
      const flask = paint(0x2a5a8a, 0.4);
      const flaskBody = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.3, 16), flask);
      flaskBody.position.set(drinksX, top + 0.15, -0.08);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.06, 16), paint(0x1a1a1e, 0.5));
      cap.position.set(drinksX, top + 0.33, -0.08);
      this.add(flaskBody, cap);
      [0, 1, 2].forEach((i) => {
        const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.036, 0.09, 14), paint([0xd84a3a, 0xe8e2d4, 0x3a6a3a][i]!, 0.35));
        mug.position.set(drinksX - 0.12 + i * 0.09, top + 0.045, 0.12);
        this.add(mug);
      });
    } else {
      // A jug of lemonade and three glasses.
      const glass = GLASS.ware;
      const jug = asGlass(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.22, 18), glass));
      jug.position.set(drinksX, top + 0.11, -0.08);
      const lemonade = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.15, 18), paint(0xf2e27a, 0.2));
      lemonade.position.set(drinksX, top + 0.08, -0.08);
      this.add(lemonade, jug);
      [0, 1, 2].forEach((i) => {
        const cup = asGlass(new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.028, 0.1, 14), glass));
        cup.position.set(drinksX - 0.12 + i * 0.09, top + 0.05, 0.12);
        this.add(cup);
      });
    }
    for (const child of this.children) if ((child as THREE.Mesh).isMesh && child.position.y > top) child.castShadow = false;
    this.colliders = [new THREE.Box3(new THREE.Vector3(-width / 2, 0, -depth / 2), new THREE.Vector3(width / 2, height, depth / 2))];
  }

  get footprint(): THREE.Box3 {
    return this.colliders[0]!.clone();
  }
}

/** Where the sheet hangs, in the cinema's frame: on the wall's plane (x), its middle (z), the cloth's top and bottom, its width. */
export interface SheetSpot {
  /** The cord's distance off the wall (the sheet faces +x, the yard). */
  off: number;
  width: number;
  top: number;
  bottom: number;
}

/**
 * The sheet: hung (`setHung(true)`) a white cloth on a cord between two nails, pegged, a broom handle in its hem to
 * keep it flat; rolled up (false) a bundle tied under the parapet. Origin on the wall's face at the sheet's middle on
 * the ground, +x into the yard (the builder turns it). A click is the builder's: put a film on, or change it.
 */
export class CinemaSheet extends UsableProp {
  private readonly hung = new THREE.Group();
  private readonly rolled = new THREE.Group();

  constructor(use: UseOptions, spot: SheetSpot, rollY: number) {
    super(use);
    this.name = 'CinemaSheet';
    const { off, width, top, bottom } = spot;
    const height = top - bottom;
    // The cloth: a little slack between the pegs, a ripple down it (vertices moved off its plane, towards the yard).
    const geometry = new THREE.PlaneGeometry(width, height, 24, 12);
    const pos = geometry.attributes.position!;
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i) / width + 0.5;
      const v = pos.getY(i) / height + 0.5;
      const sag = Math.sin(u * Math.PI * 6) * 0.004 * v;
      pos.setZ(i, sag + BELLY * Math.sin(v * Math.PI));
    }
    geometry.computeVertexNormals();
    const sheet = new THREE.Mesh(geometry, LINEN);
    sheet.rotation.y = Math.PI / 2;
    sheet.position.set(off, bottom + height / 2, 0);
    sheet.castShadow = false;
    sheet.receiveShadow = true;
    this.hung.add(sheet);
    // The cord from nail to nail, over the cloth's top; pegs along it; the broom handle in the hem.
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, width + 0.3, 6), CORD);
    cord.rotation.x = Math.PI / 2;
    cord.position.set(off, top + 0.01, 0);
    this.hung.add(cord);
    for (const z of [-1, 1]) part(this.hung, off + 0.01, 0.02, 0.02, paint(0x2a2a2c, 0.5), { x: off / 2, y: top + 0.01, z: z * (width / 2 + 0.15) });
    const peg = paint(0xd8b070, 0.6);
    for (let i = 0; i <= 5; i++) part(this.hung, 0.012, 0.06, 0.014, peg, { x: off + 0.012, y: top - 0.015, z: -width / 2 + 0.1 + (i * (width - 0.2)) / 5 });
    const broom = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, width + 0.06, 10), timber(0x8a6a4a, 0.6));
    broom.rotation.x = Math.PI / 2;
    broom.position.set(off + 0.01, bottom - 0.01, 0);
    broom.castShadow = false;
    this.hung.add(broom);
    this.add(this.hung);

    // Rolled up: the bundle on two loops of string from the nails.
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, width + 0.06, 16), LINEN);
    roll.rotation.x = Math.PI / 2;
    roll.position.set(0.09, rollY, 0);
    this.rolled.add(roll);
    for (const z of [-1, 1]) {
      part(this.rolled, 0.1, 0.02, 0.02, paint(0x2a2a2c, 0.5), { x: 0.05, y: rollY + 0.1, z: z * (width / 2 - 0.25) });
      const loop = new THREE.Mesh(new THREE.TorusGeometry(0.078, 0.004, 6, 20), CORD);
      loop.position.set(0.09, rollY, z * (width / 2 - 0.25));
      this.rolled.add(loop);
    }
    this.add(this.rolled);
    this.target(0.3, height, width, { x: off + 0.1, y: bottom + height / 2 });
    this.setHung(false);
  }

  setHung(hung: boolean): void {
    this.hung.visible = hung;
    this.rolled.visible = !hung;
  }
}

/** The folding chairs stacked against the wall while no film is on: four, leant back. Origin on the floor by the wall, +x into the yard. */
export class ChairPile extends THREE.Group implements Furniture {
  readonly contactShadow = true;
  readonly footprint = new THREE.Box3(new THREE.Vector3(0, 0, -0.25), new THREE.Vector3(0.5, 1, 0.25));

  constructor() {
    super();
    this.name = 'ChairPile';
    for (let i = 0; i < 4; i++) {
      const folded = new THREE.Group();
      // Folded flat: the seat up against the back, the whole leant on the wall.
      part(folded, 0.022, 0.86, 0.022, FRAME, { x: 0, y: 0.43, z: -0.19 });
      part(folded, 0.022, 0.86, 0.022, FRAME, { x: 0, y: 0.43, z: 0.19 });
      part(folded, 0.025, 0.4, 0.37, SLATS, { x: 0.015, y: 0.5 });
      part(folded, 0.018, 0.12, 0.37, SLATS, { x: 0.015, y: 0.78 });
      folded.position.set(0.18 + i * 0.045, 0, 0);
      folded.rotation.z = 0.2;
      this.add(folded);
    }
  }
}

/** The projector's lead along the ground, from the trestle to our back door: `points` in the cinema's frame, on the floor. */
export class CinemaLead extends THREE.Group implements Furniture {
  readonly contactShadow = false;
  readonly footprint = new THREE.Box3();

  constructor(points: readonly THREE.Vector3[]) {
    super();
    this.name = 'CinemaLead';
    const curve = new THREE.CatmullRomCurve3(points.map((p) => p.clone().setY(0.007)), false, 'centripetal');
    const lead = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(16, points.length * 12), 0.006, 6, false), paint(0x1e1e22, 0.6));
    lead.castShadow = false;
    lead.receiveShadow = true;
    this.add(lead);
  }
}

/** Every piece of the film night in a row, the sheet hung and rolled (the headless checks: `surface/zfightCatalogue`). */
export function cinemaSample(): THREE.Group {
  const g = new THREE.Group();
  const use: UseOptions = { label: () => null, use: () => {} };
  const spot: SheetSpot = { off: 0.06, width: 3, top: 3, bottom: 0.95 };
  const rolled = new CinemaSheet(use, spot, 3.25);
  const hung = new CinemaSheet(use, spot, 3.25);
  hung.setHung(true);
  const pieces: THREE.Object3D[] = [new FoldingChair(null), new FoldingChair(0x8a2a2a), new CinemaTrestle(true), new CinemaTrestle(false), new ChairPile(), rolled, hung];
  pieces.forEach((p, i) => {
    p.position.x = i * 4;
    g.add(p);
  });
  return g;
}
