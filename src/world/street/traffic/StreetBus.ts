import * as THREE from 'three';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { inHours } from '@/time/clock';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import type { ZoneId } from '../../zoneIds';
import { invisibleHitbox } from '../../meshUtils';
import type { DayNight } from '../../props/DayNight';
import { BUS, busGeometries, vehicleGlass } from '../carModel';
import { nightnessOf } from '../streetAir';
import { snowCovered } from '../snowCover';
import { standard } from '../../materials/palette';
import { LampMaterial } from './lampMaterial';
import { WheelMaterial } from './wheelSpin';
import { VEHICLES } from '../../city/vehicles';
import { wakefulnessAt } from '@/time/wakefulness';
import { lcg, random } from '@/random';
import type { Vec2 } from '../streetPlan';
import { ScriptedVehicle, type CollisionSet } from './ScriptedVehicle';
import type { StreetTraffic } from './StreetTraffic';
import { CRUISE as CITY_CRUISE } from '../../city/traffic';
import { formatCoins } from '@/text/money';
import { rideBy } from '../../travel/rideVia';

interface StreetBusOptions {
  traffic: StreetTraffic;
  viewer: THREE.Object3D;
  /** The line it drives (route 0 of the traffic): it pulls in to `stop` on the way. */
  route: readonly Vec2[];
  stop: { at: Vec2; dwell: number };
  /** Game minutes between two buses by day, and at night. */
  every: number;
  nightEvery: number;
  /** The line's number, on the destination board. */
  line: string;
  stopFor: number;
  collisions?: CollisionSet;
  /**
   * Riding it (`STREET_PLAN.busRide`): the fare, and where it takes the player today (null: nowhere, it is not
   * offered). Without, the bus is only seen (the views of the street).
   */
  ride?: {
    fare: number;
    /** Where it goes now (`board`: the words on its destination board, else the line's terminus). */
    destination: () => { to: ZoneId; label: string; board?: string } | null;
    /** Why there is nowhere to ride to now (the market shut for the night, and when it opens), for the caption. */
    closed?: () => string | null;
    /** More than one stop on now: the builder deals the pick (`ui/street/ChoicePanel`) and `board`s the one chosen; true when it did. */
    choose?: (session: SessionActions, board: (to: ZoneId, label: string) => void) => boolean;
  };
}

/** Never closer than this (real seconds) between two buses, whatever the timetable says: a game day is only ten minutes. */
const MIN_GAP_S = 80;
const NIGHT_MIN_GAP_S = 160;
const CRUISE = CITY_CRUISE.bus;
/** How far the doors slide open along the side, and how long they take. */
const DOOR_SLIDE = 0.42;
const DOOR_TIME = 0.8;
/** How far before the stop the indicator starts blinking, and how long after pulling away it keeps on. */
const SIGNAL_BEFORE = 30;
const SIGNAL_AFTER = 3;
const LIVERY = 0xe9e6dc;
const STRIPE = 0x2f7a4a;
/** Where the line ends, on the board when it takes the player nowhere in particular. */
const TERMINUS = 'CENTRAL STATION';
/** How many sit aboard (besides the driver), at the busiest hour and at the quietest. */
const ABOARD = { most: 9, least: 1 } as const;
const SKINS = [0xf1c7a8, 0xe3b08e, 0xc99b7c, 0xa8775a, 0x8a5a3e, 0x5e3b28];
/** Its axles along the body (`carModel` puts its wheels there): the rear follows the front's line. */
const AXLES = { front: 3.9, rear: -3.4 } as const;
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

/**
 * The city bus (line `line`): comes up Park Street on the traffic's first route, turns into Front
 * Street, and pulls in at the shelter (`stop`, in the far parking lane) with its indicator
 * blinking; there the doors slide open, `traffic.busAtStop` goes true for the queue to board,
 * and after `dwell` seconds it closes up, indicates and pulls out, on towards the side street.
 * One every `every` game minutes by day, `nightEvery` at night (never closer than a minute and
 * a bit in real time). A single mesh set of its own (body with its livery stripe, glass, tyres
 * with the front pair steering, lamps on the street's `LampMaterial` (brake, indicators, reversing),
 * the two door leaves, the driver and the passengers through the glass, more by day; the lit
 * destination board, reading where it takes the player now), solid while it stands. While its doors
 * stand open the player can get on (`ride`: the fare paid, then the trip there).
 */
export class StreetBus extends ScriptedVehicle implements Interactable {
  readonly hitboxes: THREE.Object3D[];
  private readonly lamps: LampMaterial;
  private readonly signMaterial: THREE.MeshBasicMaterial;
  /** The passengers seen through the glass band (heads and shoulders), the driver first. */
  private readonly heads: THREE.InstancedMesh;
  private readonly shoulders: THREE.InstancedMesh;
  private readonly seats: THREE.Vector3[] = [];
  private boardText = '';
  private readonly doors: THREE.Mesh[] = [];
  private doorOpen = 0;
  private waitClock = 6;
  private sinceLeaving = Infinity;

  constructor(private readonly dayNight: DayNight, private readonly bus: StreetBusOptions) {
    // The line through the stop (its front axle's): the first route's points, with the pull-in and pull-out spliced in around it.
    const [sx, sz] = bus.stop.at;
    super({
      traffic: bus.traffic,
      viewer: bus.viewer,
      route: withStop(bus.route, [sx + AXLES.front, sz]),
      cruise: CRUISE,
      size: { length: BUS.length, width: BUS.width, height: BUS.height },
      kind: 'bus',
      stops: [{ at: [sx + AXLES.front, sz], dwell: bus.stop.dwell }],
      stopFor: bus.stopFor,
      collisions: bus.collisions,
      accel: 1.2,
      axles: AXLES,
    });
    this.name = 'StreetBus';
    const g = busGeometries();
    const body = new THREE.Mesh(g.body, snowCovered(new THREE.MeshStandardMaterial({ color: LIVERY, roughness: 0.35 })));
    const stripe = new THREE.Mesh(g.stripe, standard({ color: STRIPE, roughness: 0.4 }));
    const glass = new THREE.Mesh(g.glass, vehicleGlass(0x18222a));
    // The street's lamp and wheel materials: head, tail, brake, indicators and reversing lamps by role; the front pair steering.
    this.lamps = new LampMaterial();
    const tyres = new WheelMaterial(false);
    this.lampFace = this.lamps;
    this.wheelFace = { material: tyres, radius: VEHICLES.bus.wheelRadius, base: 7.3 };
    const wheels = new THREE.Mesh(g.wheels, tyres);
    const lamps = new THREE.Mesh(g.lamps, this.lamps);
    for (const mesh of [body, stripe, glass, wheels]) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
    this.add(body, stripe, glass, wheels, lamps);

    // Who rides it: the driver, and passengers in the seats along the glass band.
    const { driver, rows, sides, belt } = BUS.seats;
    this.seats.push(new THREE.Vector3(driver[0], belt, driver[1]));
    for (const x of rows) for (const z of sides) this.seats.push(new THREE.Vector3(x, belt, z));
    this.heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 10, 8).translate(0.02, 0.38, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }), this.seats.length);
    this.shoulders = new THREE.InstancedMesh(new THREE.BoxGeometry(0.24, 0.27, 0.42).translate(-0.04, 0.125, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }), this.seats.length);
    const people = lcg(3838);
    const colour = new THREE.Color();
    for (let i = 0; i < this.seats.length; i++) {
      this.heads.setColorAt(i, colour.setHex(SKINS[Math.floor(people() * SKINS.length)]!));
      this.shoulders.setColorAt(i, colour.setHSL(people(), 0.3, 0.2 + 0.3 * people()));
    }
    this.add(this.heads, this.shoulders);
    this.seatPassengers(ABOARD.least);

    // The door leaves: dark glass in a frame, on the kerb side (+z), sliding outwards and apart.
    const leafMaterial = standard({ color: 0x2a3438, roughness: 0.1 });
    for (const x of BUS.doors) {
      for (const side of [-1, 1]) {
        const leaf = new THREE.Mesh(new THREE.BoxGeometry(BUS.doorWidth / 2 - 0.02, BUS.doorHeight - 0.2, 0.04), leafMaterial);
        leaf.position.set(x + (side * BUS.doorWidth) / 4, 0.45 + (BUS.doorHeight - 0.2) / 2, BUS.width / 2 + 0.03);
        leaf.userData.closedX = leaf.position.x;
        leaf.userData.side = side;
        this.doors.push(leaf);
        this.add(leaf);
      }
    }

    // Getting on: a box along the kerb side, where the doors are.
    const board = invisibleHitbox(BUS.length * 0.8, BUS.doorHeight, 0.5, { y: 0.45 + BUS.doorHeight / 2, z: BUS.width / 2 });
    // Only there for the crosshair while it has something to say (a bus driving past never swallows a click behind it).
    board.raycast = (raycaster, hits) => {
      if (this.label()) THREE.Mesh.prototype.raycast.call(board, raycaster, hits);
    };
    this.add(board);
    this.hitboxes = [board];

    // The destination board over the windscreen, front and back (repainted with where it goes as it sets off).
    this.boardText = TERMINUS;
    this.signMaterial = new THREE.MeshBasicMaterial({ map: signTexture(bus.line, this.boardText), color: 0x999999 });
    const { y, width, height } = BUS.sign;
    for (const facing of [1, -1] as const) {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(facing > 0 ? width : width * 0.5, height), this.signMaterial);
      sign.rotation.y = (facing * Math.PI) / 2;
      sign.position.set(facing * (BUS.length / 2 + 0.035), y, 0);
      this.add(sign);
    }
  }

  /** Whether its doors stand open at the stop: the player may get on. */
  get boarding(): boolean {
    return this.state === 'stopped' && this.doorOpen >= 1;
  }

  /** Real seconds until the next bus stands at the stop (0 while one does), roughly: its wait plus the drive there. */
  get dueIn(): number {
    if (this.state === 'stopped') return 0;
    if (this.state === 'driving') return Math.max(0, this.toNextStop) / CRUISE;
    return Math.max(0, this.waitClock) + (this.stopDistances[0] ?? 0) / CRUISE;
  }

  setHovered(): void {
    // A bus does not glow; the caption says it.
  }

  label(): string | null {
    const ride = this.bus.ride;
    if (!ride || !this.boarding) return null;
    const where = ride.destination();
    if (!where) {
      const why = ride.closed?.();
      return why ? `Bus ${this.bus.line} · ${why}` : null;
    }
    return `Bus ${this.bus.line} · get on to ${where.label} (${formatCoins(ride.fare)})`;
  }

  activate(session: SessionActions): void {
    const ride = this.bus.ride;
    const where = ride?.destination();
    if (!ride || !where || !this.boarding) return;
    // Two stops on now: which one first (`ride.choose`), then the fare.
    if (ride.choose?.(session, (to, label) => this.board(session, ride.fare, to, label))) return;
    this.board(session, ride.fare, where.to, where.label);
  }

  /** The fare paid, off to `to`. */
  private board(session: SessionActions, fare: number, to: ZoneId, label: string): void {
    session.pay({
      price: fare,
      paid: () => {
        rideBy('bus');
        session.travel(to);
        return `You pay the driver and take a seat, off to ${label}.`;
      },
    });
  }

  protected schedule(dt: number): void {
    if (this.active) return;
    this.waitClock -= dt;
    if (this.waitClock > 0) return;
    const night = inHours(this.dayNight.state.hours, [22.5, 6]);
    const gameMinute = this.dayNight.dayLength / (24 * 60);
    this.waitClock = Math.max(night ? NIGHT_MIN_GAP_S : MIN_GAP_S, (night ? this.bus.nightEvery : this.bus.every) * gameMinute);
    this.setBoard(this.bus.ride?.destination()?.board ?? TERMINUS);
    // Fuller by day, a few aboard late at night.
    const busy = wakefulnessAt(this.dayNight.state.hours);
    this.seatPassengers(Math.round(ABOARD.least + (ABOARD.most - ABOARD.least) * busy * (0.6 + 0.4 * random())));
    this.depart();
  }

  /** The destination board reads `where` (repainted only when it changes). */
  private setBoard(where: string): void {
    if (where === this.boardText) return;
    this.boardText = where;
    this.signMaterial.map?.dispose();
    this.signMaterial.map = signTexture(this.bus.line, where);
    this.signMaterial.needsUpdate = true;
  }

  /** `count` passengers in seats along the band (and always the driver), scattered over the rows. */
  private seatPassengers(count: number): void {
    const free = this.seats.slice(1).map((_, i) => i + 1);
    const taken = new Set<number>([0]);
    for (let k = 0; k < count && free.length; k++) taken.add(free.splice(Math.floor(random() * free.length), 1)[0]!);
    const m = new THREE.Matrix4();
    this.seats.forEach((seat, i) => {
      const shown = taken.has(i);
      m.makeTranslation(seat.x, seat.y, seat.z);
      this.heads.setMatrixAt(i, shown ? m : HIDDEN);
      this.shoulders.setMatrixAt(i, shown ? m : HIDDEN);
    });
    this.heads.instanceMatrix.needsUpdate = true;
    this.shoulders.instanceMatrix.needsUpdate = true;
    // Their culling sphere round the seats taken now (three keeps the first one it computed otherwise).
    this.heads.computeBoundingSphere();
    this.shoulders.computeBoundingSphere();
  }

  protected override arrived(): void {
    this.sinceLeaving = Infinity;
  }

  protected override leaving(): void {
    this.sinceLeaving = 0;
    this.bus.traffic.busAtStop = false;
  }

  protected override finished(): void {
    this.bus.traffic.busAtStop = false;
  }

  /** At the stop: stay till the doors have shut again after the dwell. */
  protected override keepWaiting(index: number): boolean {
    return super.keepWaiting(index) || this.doorOpen > 0;
  }

  protected override animate(dt: number): void {
    const s = this.dayNight.state;
    const night = THREE.MathUtils.smoothstep(nightnessOf(s), 0.2, 0.6);
    this.lamps.setNight(Math.max(night, 0.55 * this.bus.traffic.murk));
    this.signMaterial.color.setScalar(0.9 + 1.1 * night);

    // Doors: open once stood a moment, shut a moment before the dwell is up.
    const standing = this.state === 'stopped';
    const dwell = this.bus.stop.dwell;
    const wantOpen = standing && this.stoodFor > 0.8 && this.stoodFor < dwell - DOOR_TIME;
    this.doorOpen = THREE.MathUtils.clamp(this.doorOpen + (wantOpen ? dt : -dt) / DOOR_TIME, 0, 1);
    for (const leaf of this.doors) {
      const t = this.doorOpen;
      leaf.position.x = (leaf.userData.closedX as number) + (leaf.userData.side as number) * DOOR_SLIDE * Math.min(1, t * 1.4);
      leaf.position.z = BUS.width / 2 + 0.03 + 0.1 * Math.min(1, t * 3);
    }
    this.bus.traffic.busAtStop = standing && this.doorOpen >= 1;

    // The indicators: right pulling in to the stop ahead, left pulling out again (the bends' own otherwise).
    this.sinceLeaving += dt;
    const pullingIn = this.state === 'driving' && this.toNextStop < SIGNAL_BEFORE;
    const pullingOut = (standing && this.stoodFor > dwell - 2) || this.sinceLeaving < SIGNAL_AFTER;
    this.signalOverride = pullingOut ? -1 : pullingIn ? 1 : standing ? 0 : null;
  }
}

/**
 * The front axle's way in and out of the stop: metres along from where it stands, and how much of the way
 * across from the lane to the stop it is. A long S in, straight a wheelbase and more before the stop (the
 * bus stands square to the kerb), a gentler S out so its tail never swings onto the pavement; the nose and
 * the tail keep off the kerb and clear of the parked car behind and the works' barrier ahead (worked out
 * for the 12 m bus, `axles` on, in the bay between them).
 */
const PULL: readonly (readonly [number, number])[] = [
  [-26.5, 0], [-20.5, 0.11], [-14.5, 0.55], [-9.5, 0.91], [-6.5, 1], [0, 1], [5, 0.86], [10.5, 0.42], [19, 0],
];

/**
 * The route through the stop (`[sx, sz]`: where the front axle stands): the given points up to the
 * straight stretch of Front Street the stop is on, the pull-in to the stop (in the parking lane) and
 * the pull-out back to the lane (`PULL`), then the rest.
 */
function withStop(route: readonly Vec2[], [sx, sz]: Vec2): Vec2[] {
  const [first, last] = [PULL[0]![0], PULL[PULL.length - 1]![0]];
  const i = route.findIndex((p, k) => k + 1 < route.length && p[0] <= sx + first && route[k + 1]![0] >= sx + last && p[1] === route[k + 1]![1]);
  if (i < 0) return [...route];
  const lane = route[i]![1];
  return [...route.slice(0, i + 1), ...PULL.map(([along, across]): Vec2 => [sx + along, lane + (sz - lane) * across]), ...route.slice(i + 1)];
}

/** The destination board: amber dot-matrix letters on black, the line's number and `where`. */
function signTexture(line: string, where: string): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(256, 36);
  ctx.fillStyle = '#0a0a08';
  ctx.fillRect(0, 0, 256, 36);
  ctx.fillStyle = '#ffb020';
  ctx.font = 'bold 26px "Courier New", monospace';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(line, 8, 19);
  ctx.textAlign = 'center';
  ctx.fillText(where, 150, 19, 200);
  // The dot matrix: a grid of dark lines over the letters.
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  for (let x = 0; x < 256; x += 3) ctx.fillRect(x, 0, 1, 36);
  for (let y = 0; y < 36; y += 3) ctx.fillRect(0, y, 256, 1);
  return toTexture(canvas, 'facing');
}
