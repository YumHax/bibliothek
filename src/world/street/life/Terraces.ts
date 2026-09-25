import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../../Furniture';
import type { DayNight } from '../../props/DayNight';
import { wakefulnessAt } from '../../props/outdoors/wakefulness';
import { Walker } from '../../people/Walker';
import { snowCovered } from '../snowCover';
import { shopDoors, type Vec2 } from '../streetPlan';
import { Figure } from './Figure';

export interface TerraceSpec {
  /** The stretch of pavement the tables stand along (same z at both ends). */
  from: Vec2;
  to: Vec2;
  tables: number;
  /** Game hours the tables are out. */
  hours: readonly [number, number];
  /** How many people sit out while it is open. */
  customers: number;
}

export interface TerracesOptions {
  terraces: readonly TerraceSpec[];
  viewer: THREE.Object3D;
  /** The zone's own collision set (world boxes) and its frame: the tables' boxes follow the layout. */
  collisions: { add(box: THREE.Box3): void; remove(box: THREE.Box3): void };
  toWorld: (point: THREE.Vector3) => THREE.Vector3;
  place: (walker: Walker, at: THREE.Vector3) => void;
  talk: () => string;
  drawDistance: number;
  fade: number;
  /** Fewer customers (low quality): at most this many per terrace. */
  maxCustomers?: number;
}

type Finish = 'metal' | 'top' | 'rattan';

const TABLE = { radius: 0.32, height: 0.72 };
const CHAIR = { seat: 0.46, width: 0.4 };
/** A chair stands this far from its table's middle, either side along the pavement. */
const CHAIR_OFF = 0.5;
/** Stacked away: the tables this far off the wall. */
const WALL_GAP = 0.45;
/** The layout only changes while the player is further than this from the terrace (nobody sees chairs jump). */
const UNSEEN = 14;
/** Seconds between two looks at the clock and the weather. */
const CHECK_EVERY = 1;
/** No table nearer a shop door than this (along the pavement): people go in and out there. */
const DOOR_CLEAR = 0.8;

interface Seat {
  at: THREE.Vector3;
  yaw: number;
}

interface Terrace {
  spec: TerraceSpec;
  open: THREE.Group;
  closed: THREE.Group;
  isOpen: boolean;
  openBoxes: THREE.Box3[];
  closedBoxes: THREE.Box3[];
  seats: Seat[];
  customers: Figure[];
  centre: THREE.Vector3;
}

/**
 * The café's and the bars' terraces: little round bistro tables with a chair either side along the
 * pavement, out in front of them during their hours in dry weather, with a customer or two sat
 * over a cup; outside those hours or in the rain the chairs are stacked on the tables pushed
 * against the wall, chained. Each layout is merged per material (metal, table tops, rattan), and
 * switches only while the player is not close by. The tables collide as laid out (their boxes go
 * in and out of the zone's collision set). Customers fade in and out, and with distance.
 */
export class Terraces extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  private readonly terraces: Terrace[] = [];
  private readonly materials: Record<Finish, THREE.MeshStandardMaterial>;
  private readonly eye = new THREE.Vector3();
  private readonly local = new THREE.Vector3();
  private clock = CHECK_EVERY;

  constructor(private readonly dayNight: DayNight, private readonly options: TerracesOptions) {
    super();
    this.name = 'Terraces';
    this.materials = {
      metal: snowCovered(new THREE.MeshStandardMaterial({ color: 0x23272a, roughness: 0.45, metalness: 0.6 })),
      top: snowCovered(new THREE.MeshStandardMaterial({ color: 0xe6e1d6, roughness: 0.35 })),
      rattan: snowCovered(new THREE.MeshStandardMaterial({ color: 0xb08a52, roughness: 0.85 })),
    };
    let seed = 500;
    for (const spec of options.terraces) {
      const terrace = this.build(spec);
      const count = Math.min(spec.customers, options.maxCustomers ?? spec.customers);
      for (let i = 0; i < count; i++) {
        const walker = new Walker({ viewer: options.viewer, seed: seed++, talk: options.talk, label: 'Click to say hello', fade: true });
        walker.traverse((o) => {
          o.castShadow = false;
        });
        options.place(walker, new THREE.Vector3());
        terrace.customers.push(new Figure(walker));
      }
      for (const box of terrace.closedBoxes) options.collisions.add(box);
      this.terraces.push(terrace);
    }
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  dispose(): void {
    for (const t of this.terraces) for (const box of t.isOpen ? t.openBoxes : t.closedBoxes) this.options.collisions.remove(box);
  }

  update(dt: number): void {
    this.options.viewer.getWorldPosition(this.eye);
    this.clock += dt;
    if (this.clock >= CHECK_EVERY) {
      this.clock = 0;
      const s = this.dayNight.state;
      const dry = s.rain < 0.08 && s.snow < 0.05 && s.snowCover < 0.4;
      const awake = wakefulnessAt(s.hours);
      this.local.copy(this.eye);
      this.worldToLocal(this.local);
      for (const t of this.terraces) {
        const [from, to] = t.spec.hours;
        const wanted = dry && s.hours >= from && s.hours < to;
        if (wanted !== t.isOpen && this.local.distanceTo(t.centre) > UNSEEN) this.setOpen(t, wanted);
        this.seatCustomers(t, t.isOpen && awake > 0.25);
      }
    }
    for (const t of this.terraces) for (const c of t.customers) c.update(dt, this.eye, this.options.drawDistance, this.options.fade);
  }

  private setOpen(t: Terrace, open: boolean): void {
    for (const box of t.isOpen ? t.openBoxes : t.closedBoxes) this.options.collisions.remove(box);
    t.isOpen = open;
    t.open.visible = open;
    t.closed.visible = !open;
    for (const box of open ? t.openBoxes : t.closedBoxes) this.options.collisions.add(box);
  }

  /** Customers sit down at free chairs while it is open (and the city is up), and go when it shuts. */
  private seatCustomers(t: Terrace, open: boolean): void {
    const free = [...t.seats];
    for (const c of t.customers) {
      if (open && !c.shown) {
        const seat = free.splice(Math.floor(Math.random() * free.length), 1)[0];
        if (!seat) continue;
        c.show(seat.at.clone());
        c.walker.sit(seat.yaw, CHAIR.seat, 'lap');
      } else if (!open && c.shown) c.hide();
    }
  }

  /** Both layouts of one terrace, the seats of the open one and the boxes of each. */
  private build(spec: TerraceSpec): Terrace {
    const [x0, z] = spec.from;
    const [x1] = spec.to;
    // The wall is behind the pavement: further from the road than the terrace.
    const wallSide = Math.sign(z);
    const step = (x1 - x0) / Math.max(1, spec.tables);
    const openParts: Record<Finish, THREE.BufferGeometry[]> = { metal: [], top: [], rattan: [] };
    const closedParts: Record<Finish, THREE.BufferGeometry[]> = { metal: [], top: [], rattan: [] };
    const seats: Seat[] = [];
    const openBoxes: THREE.Box3[] = [];
    const lo = Math.min(x0, x1);
    const hi = Math.max(x0, x1);
    const doors = shopDoors().filter((d) => Math.abs(d.at[1] - z) < 2).map((d) => d.at[0]);
    for (let i = 0; i < spec.tables; i++) {
      const x = x0 + step * (i + 0.5);
      if (doors.some((d) => Math.abs(d - x) < DOOR_CLEAR)) continue;
      table(openParts, x, z, true);
      for (const side of [-1, 1] as const) {
        // Each chair faces the table: its back away from it along the pavement.
        const yaw = side < 0 ? Math.PI / 2 : -Math.PI / 2;
        chair(openParts, x + side * CHAIR_OFF, z, yaw, 0);
        seats.push({ at: new THREE.Vector3(x + side * (CHAIR_OFF + 0.16), 0, z), yaw });
      }
      openBoxes.push(this.worldBox(x - CHAIR_OFF - 0.25, z - 0.4, x + CHAIR_OFF + 0.25, z + 0.4, 0.9));
      // Stacked away: the table against the wall, its two chairs stacked beside it.
      const zw = z + wallSide * WALL_GAP;
      table(closedParts, x, zw, false);
      chair(closedParts, x + 0.45, zw, Math.PI, 0);
      chair(closedParts, x + 0.45, zw, Math.PI, 0.06);
    }
    // The chain along the stack.
    const zw = z + wallSide * (WALL_GAP - 0.2);
    closedParts.metal.push(new THREE.BoxGeometry(hi - lo + 0.6, 0.02, 0.02).translate((lo + hi) / 2, 0.55, zw));
    const [za, zb] = [z + wallSide * 0.1, z + wallSide * 0.85];
    const closedBoxes = [this.worldBox(lo - 0.4, Math.min(za, zb), hi + 0.8, Math.max(za, zb), 1.2)];
    const open = this.merge(openParts);
    const closed = this.merge(closedParts);
    open.visible = false;
    this.add(open, closed);
    return { spec, open, closed, isOpen: false, openBoxes, closedBoxes, seats, customers: [], centre: new THREE.Vector3((lo + hi) / 2, 0, z) };
  }

  private merge(parts: Record<Finish, THREE.BufferGeometry[]>): THREE.Group {
    const group = new THREE.Group();
    for (const finish of Object.keys(parts) as Finish[]) {
      const list = parts[finish];
      if (!list.length) continue;
      const mesh = new THREE.Mesh(mergeGeometries(list.map(plain))!, this.materials[finish]);
      for (const g of list) g.dispose();
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    return group;
  }

  /** A world-space box from zone-local corners (the terraces stand at the zone's origin, unrotated). */
  private worldBox(x0: number, z0: number, x1: number, z1: number, h: number): THREE.Box3 {
    const a = this.options.toWorld(new THREE.Vector3(x0, 0, z0));
    const b = this.options.toWorld(new THREE.Vector3(x1, h, z1));
    return new THREE.Box3().setFromPoints([a, b]);
  }
}

/** A round bistro table: base, post, marble top; a cup on it when laid out. */
function table(parts: Record<Finish, THREE.BufferGeometry[]>, x: number, z: number, laid: boolean): void {
  const { radius, height } = TABLE;
  parts.metal.push(new THREE.CylinderGeometry(0.2, 0.22, 0.03, 16).translate(x, 0.015, z));
  parts.metal.push(new THREE.CylinderGeometry(0.025, 0.03, height - 0.03, 8).translate(x, height / 2, z));
  parts.top.push(new THREE.CylinderGeometry(radius, radius, 0.03, 20).translate(x, height, z));
  if (laid) {
    parts.top.push(new THREE.CylinderGeometry(0.04, 0.032, 0.07, 10).translate(x - 0.1, height + 0.05, z + 0.05));
    parts.top.push(new THREE.CylinderGeometry(0.07, 0.07, 0.008, 12).translate(x - 0.1, height + 0.02, z + 0.05));
  }
}

/** A bistro chair facing `yaw` (0 = +z), lifted by `lift` (stacked); legs of metal, seat and back of rattan. */
function chair(parts: Record<Finish, THREE.BufferGeometry[]>, x: number, z: number, yaw: number, lift: number): void {
  const w = CHAIR.width;
  const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, lift, z);
  const put = (finish: Finish, g: THREE.BufferGeometry): void => {
    parts[finish].push(g.applyMatrix4(m));
  };
  put('rattan', new THREE.BoxGeometry(w, 0.035, w).translate(0, CHAIR.seat, 0));
  put('rattan', new THREE.BoxGeometry(w, 0.36, 0.03).rotateX(-0.12).translate(0, CHAIR.seat + 0.2, -w / 2 + 0.02));
  for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    put('metal', new THREE.BoxGeometry(0.02, CHAIR.seat, 0.02).translate(lx * (w / 2 - 0.03), CHAIR.seat / 2, lz * (w / 2 - 0.03)));
  }
}

/** Non-indexed with uvs, so every part merges with every other. */
function plain(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g;
  if (!out.getAttribute('uv')) out.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(out.getAttribute('position').count * 2), 2));
  return out;
}
