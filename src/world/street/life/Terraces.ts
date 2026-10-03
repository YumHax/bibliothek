import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../../Furniture';
import type { DayNight } from '../../props/DayNight';
import { streetBusyAt, type Weekday } from '@/time/wakefulness';
import { Walker } from '../../people/Walker';
import { randomLook } from '../../people/looks';
import type { Season } from '@/time/season';
import { snowCovered } from '../snowCover';
import { shopDoors, type Vec2 } from '../streetPlan';
import { Figure } from './Figure';
import type { TalkRole } from './streetTalk';
import { terraceOut, terraceWeather } from './terraceWeather';

export interface TerraceSpec {
  /** The stretch of pavement the tables stand along (same z at both ends). */
  from: Vec2;
  to: Vec2;
  tables: number;
  /** Game hours the tables are out. */
  hours: readonly [number, number];
  /** How many people sit out at most while it is open (fewer when the hour is quiet). */
  customers: number;
}

export interface TerracesOptions {
  terraces: readonly TerraceSpec[];
  viewer: THREE.Object3D;
  /** The zone's own collision set (world boxes) and its frame: the tables' boxes follow the layout. */
  collisions: { add(box: THREE.Box3): void; remove(box: THREE.Box3): void };
  toWorld: (point: THREE.Vector3) => THREE.Vector3;
  place: (walker: Walker, at: THREE.Vector3) => void;
  talk: (role: TalkRole) => string;
  /** Today's weekday (how busy the hour is), and the season the customers dress for. */
  weekday: () => Weekday;
  season: Season['name'];
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
/** A customer stays this many real seconds over their cup; the waiter brings it this long after they sit down. */
const STAY = [45, 140] as const;
const SERVED_AFTER = [4, 12] as const;
/** The waiter stands this long at a table, and waits by the door this far along from it, a step off the wall. */
const AT_TABLE = 2.5;
const WAITER_BY_DOOR = 0.75;
/** Customers come up from the pavement's lane (this far from the road's middle) and leave along it. */
const LANE_Z = 10.1;
const WALK_OFF = 4.5;

interface Seat {
  at: THREE.Vector3;
  yaw: number;
  /** Its table's middle (where the waiter stands to serve it, on the road side). */
  table: THREE.Vector3;
}

type CustomerState = 'away' | 'arriving' | 'seated' | 'leaving';

interface Customer {
  figure: Figure;
  state: CustomerState;
  seat: Seat | null;
  /** Real seconds left at the table; until the waiter is called over. */
  stay: number;
  serve: number;
}

interface Waiter {
  figure: Figure;
  /** Where they wait (by the door, a step off the wall), and the yaw they face there. */
  home: THREE.Vector3;
  yaw: number;
  busy: boolean;
  /** Seconds left at a table before going back to the door. */
  wait: number;
}

interface Terrace {
  spec: TerraceSpec;
  open: THREE.Group;
  closed: THREE.Group;
  isOpen: boolean;
  openBoxes: THREE.Box3[];
  closedBoxes: THREE.Box3[];
  seats: Seat[];
  customers: Customer[];
  waiter: Waiter | null;
  centre: THREE.Vector3;
}

/**
 * The café's and the bars' terraces: little round bistro tables with a chair either side along the
 * pavement, out in front of them during their hours in dry weather (`terraceWeather`, the rule the
 * chatter's sound goes by too); outside those hours or in the rain the chairs are stacked on the
 * tables pushed against the wall, chained. Each layout is merged per material (metal, table tops,
 * rattan), and switches only while the player is not close by. The tables collide as laid out
 * (their boxes go in and out of the zone's collision set). Customers come and go: as many as the
 * hour is busy walk up from the pavement to a free chair and sit, the waiter (by the door between
 * rounds) brings their cup, and after a while they get up and walk off along the pavement; all go
 * when it shuts. `seated(i)` says how many sit at each. They fade in and out, and with distance.
 */
export class Terraces extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  private readonly terraces: Terrace[] = [];
  private readonly materials: Record<Finish, THREE.MeshStandardMaterial>;
  private readonly eye = new THREE.Vector3();
  private readonly local = new THREE.Vector3();
  private clock = CHECK_EVERY;
  /** Just (re)activated: the next look at the clock lays every terrace out as it says, near or not (the player has only just arrived). */
  private fresh = true;

  constructor(private readonly dayNight: DayNight, private readonly options: TerracesOptions) {
    super();
    this.name = 'Terraces';
    this.materials = {
      metal: snowCovered(new THREE.MeshStandardMaterial({ color: 0x23272a, roughness: 0.45 })),
      top: snowCovered(new THREE.MeshStandardMaterial({ color: 0xe6e1d6, roughness: 0.35 })),
      rattan: snowCovered(new THREE.MeshStandardMaterial({ color: 0xb08a52, roughness: 0.85 })),
    };
    let seed = 500;
    const person = (label: string, role: TalkRole, apron: boolean): Figure => {
      const s = seed++;
      const look = randomLook(s + 200, apron ? 'vendor' : 'shopper', { season: apron ? 'summer' : options.season });
      if (apron) look.apron = 0x2a2a2a;
      const walker = new Walker({ viewer: options.viewer, seed: s, look, speed: 1.05, talk: () => options.talk(role), label, labelWithin: 4, corners: 0.3, fade: true });
      walker.traverse((o) => {
        o.castShadow = false;
      });
      options.place(walker, new THREE.Vector3());
      return new Figure(walker);
    };
    for (const spec of options.terraces) {
      const terrace = this.build(spec);
      const count = Math.min(spec.customers, options.maxCustomers ?? spec.customers);
      for (let i = 0; i < count; i++) {
        terrace.customers.push({ figure: person('Customer · say hello', 'terrace', false), state: 'away', seat: null, stay: 0, serve: 0 });
      }
      // The waiter, by the door between rounds (not on low quality: `maxCustomers`).
      const door = this.doorOf(spec);
      if (door && options.maxCustomers === undefined) {
        const wall = Math.sign(spec.from[1]);
        const home = new THREE.Vector3(door[0] + WAITER_BY_DOOR, 0, door[1] - wall * 0.55);
        terrace.waiter = { figure: person('Waiter · say hello', 'terrace', true), home, yaw: wall > 0 ? Math.PI : 0, busy: false, wait: 0 };
      }
      for (const box of terrace.closedBoxes) options.collisions.add(box);
      this.terraces.push(terrace);
    }
  }

  /** How many customers sit at terrace `i` now (`SeatedCount`, for its chatter: 0 while it is stacked). */
  seated(i: number): number {
    const t = this.terraces[i];
    if (!t?.isOpen) return 0;
    let n = 0;
    for (const c of t.customers) if (c.state === 'seated' || c.state === 'arriving') n++;
    return n;
  }

  /** The door of the café or bar a terrace stands in front of (the plan's: its painted one is close by). */
  private doorOf(spec: TerraceSpec): Vec2 | null {
    const [x0, z] = spec.from;
    const [x1] = spec.to;
    const lo = Math.min(x0, x1) - 0.5;
    const hi = Math.max(x0, x1) + 0.5;
    const door = shopDoors().find((d) => Math.abs(d.at[1] - z) < 2 && d.at[0] > lo && d.at[0] < hi && (d.shop.kind === 'cafe' || d.shop.kind === 'bar'));
    return door ? door.at : null;
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  setZoneActive(active: boolean): void {
    if (!active) return;
    this.fresh = true;
    this.clock = CHECK_EVERY;
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
      // How busy the hour is: so many of the chairs taken.
      const busy = Math.min(1, streetBusyAt(s.hours, this.options.weekday()));
      this.local.copy(this.eye);
      this.worldToLocal(this.local);
      for (const t of this.terraces) {
        const wanted = terraceOut(t.spec.hours, s);
        if (wanted !== t.isOpen && (this.fresh || this.local.distanceTo(t.centre) > UNSEEN)) this.setOpen(t, wanted);
        const open = t.isOpen && wanted && terraceWeather(s);
        this.tendCustomers(t, open ? Math.max(1, Math.round(t.customers.length * (0.35 + 0.65 * busy))) : 0, this.fresh);
        this.tendWaiter(t, open);
      }
      this.fresh = false;
    }
    for (const t of this.terraces) {
      const w = t.waiter;
      if (w && w.wait > 0 && (w.wait -= dt) <= 0 && w.figure.shown) {
        w.figure.walker.walk([w.home.clone()], () => {
          w.figure.walker.stand(w.yaw, 'hips');
          w.busy = false;
        });
      }
      for (const c of t.customers) {
        if (c.state === 'seated') {
          c.stay -= dt;
          // The waiter busy at another table: asked again a moment later (else the cup never comes).
          if (c.serve > 0 && (c.serve -= dt) <= 0 && !this.callWaiter(t, c)) c.serve = 2;
        }
        c.figure.update(dt, this.eye, this.options.drawDistance, this.options.fade);
      }
      t.waiter?.figure.update(dt, this.eye, this.options.drawDistance, this.options.fade);
    }
  }

  /**
   * As many customers seated as the hour wants (`wanted`): newcomers walk up from the pavement to a free chair and
   * sit; whoever has had their cup gets up and walks off along the pavement; all go when the terrace shuts.
   */
  private tendCustomers(t: Terrace, wanted: number, instantly: boolean): void {
    let seated = 0;
    for (const c of t.customers) {
      if (c.state === 'leaving' && c.figure.gone) c.state = 'away';
      if (c.state === 'seated' && (wanted === 0 || c.stay <= 0)) this.leave(t, c);
      else if (c.state === 'seated' || c.state === 'arriving') seated++;
    }
    const taken = new Set(t.customers.map((c) => c.seat).filter((s): s is Seat => s !== null));
    for (const c of t.customers) {
      if (seated >= wanted) break;
      if (c.state !== 'away') continue;
      const free = t.seats.filter((s) => !taken.has(s));
      const seat = free[Math.floor(Math.random() * free.length)];
      if (!seat) break;
      taken.add(seat);
      seated++;
      this.arrive(t, c, seat, instantly);
    }
  }

  private arrive(t: Terrace, c: Customer, seat: Seat, instantly: boolean): void {
    c.seat = seat;
    c.stay = between(STAY);
    c.serve = instantly ? 0 : between(SERVED_AFTER);
    const walker = c.figure.walker;
    const sit = (): void => {
      c.state = 'seated';
      walker.sit(seat.yaw, CHAIR.seat, 'lap');
    };
    if (instantly) {
      c.figure.show(seat.at.clone(), true);
      sit();
      return;
    }
    // Up from the pavement's lane, along it from one side, to the chair.
    const side = Math.sign(t.spec.from[1]);
    const lane = new THREE.Vector3(seat.at.x, 0, side * LANE_Z);
    const from = lane.clone().add(new THREE.Vector3((Math.random() < 0.5 ? -1 : 1) * WALK_OFF, 0, 0));
    c.state = 'arriving';
    c.figure.show(from);
    walker.walk([lane, seat.at.clone()], sit);
  }

  private leave(t: Terrace, c: Customer): void {
    const seat = c.seat;
    c.state = 'leaving';
    c.seat = null;
    const walker = c.figure.walker;
    if (!seat) {
      c.figure.hide();
      return;
    }
    const side = Math.sign(t.spec.from[1]);
    const lane = new THREE.Vector3(seat.at.x, 0, side * LANE_Z);
    // Along the pavement, fading out over its last metre or so.
    const way = (Math.random() < 0.5 ? -1 : 1) * WALK_OFF;
    const fadeFrom = lane.clone().add(new THREE.Vector3(way * 0.7, 0, 0));
    const off = lane.clone().add(new THREE.Vector3(way, 0, 0));
    walker.walk([lane, fadeFrom], () => {
      c.figure.hide();
      walker.walk([off]);
    });
  }

  /** The waiter: by the door while the terrace is out, gone in when it shuts. */
  private tendWaiter(t: Terrace, open: boolean): void {
    const w = t.waiter;
    if (!w) return;
    if (open && !w.figure.shown) {
      w.figure.show(w.home.clone(), this.fresh);
      w.figure.walker.stand(w.yaw, 'hips');
      w.busy = false;
    } else if (!open && w.figure.shown) w.figure.hide();
  }

  /**
   * The waiter brings `c` their cup: out to their table, a moment there, back to the door. False when the waiter
   * cannot come now (busy, gone in); true when on their way, or when there is no waiter to wait for.
   */
  private callWaiter(t: Terrace, c: Customer): boolean {
    const w = t.waiter;
    const seat = c.seat;
    if (!w || !seat) return true;
    if (w.busy || !w.figure.shown) return false;
    w.busy = true;
    const walker = w.figure.walker;
    const side = Math.sign(t.spec.from[1]);
    // At the table's road side, facing the customer.
    const spot = seat.table.clone().add(new THREE.Vector3(0, 0, -side * 0.55));
    walker.walk([spot], () => {
      walker.stand(Math.atan2(seat.at.x - spot.x, seat.at.z - spot.z), 'stand');
      walker.gesture('nudge');
      c.figure.walker.react('good');
      w.wait = AT_TABLE;
    });
    return true;
  }

  private setOpen(t: Terrace, open: boolean): void {
    for (const box of t.isOpen ? t.openBoxes : t.closedBoxes) this.options.collisions.remove(box);
    t.isOpen = open;
    t.open.visible = open;
    t.closed.visible = !open;
    for (const box of open ? t.openBoxes : t.closedBoxes) this.options.collisions.add(box);
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
        seats.push({ at: new THREE.Vector3(x + side * (CHAIR_OFF + 0.16), 0, z), yaw, table: new THREE.Vector3(x, 0, z) });
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
    return { spec, open, closed, isOpen: false, openBoxes, closedBoxes, seats, customers: [], waiter: null, centre: new THREE.Vector3((lo + hi) / 2, 0, z) };
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

function between([lo, hi]: readonly [number, number]): number {
  return lo + Math.random() * (hi - lo);
}
