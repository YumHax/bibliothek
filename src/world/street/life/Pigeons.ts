import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../../Furniture';
import type { DayNight } from '../../props/DayNight';
import type { Vec2 } from '../streetPlan';
import { PARK_STREET, PARK_WALK, WALKABLE } from '@/world/measures/street';
import { random, within } from '@/random';

interface PigeonsOptions {
  /** The flocks: where each pecks about and how many birds it has. */
  flocks: readonly { at: Vec2; count: number }[];
  viewer: THREE.Object3D;
  /** Birds per flock are scaled by this (fewer on low quality). */
  share?: number;
  /** A flock took off from `at` (the flutter of wings, for whoever plays it). */
  onTakeOff?: (at: Vec2) => void;
  /** Everyone else in the street (zone-local, a live list): those on the move scare the birds as the player does (not someone sitting or standing). */
  walkers?: readonly { readonly position: THREE.Vector3; readonly isPresent: boolean; readonly isWalking: boolean }[];
  /** The dogs out on their leads (zone-local, a live list): they scare the birds walking or not. */
  dogs?: readonly { readonly position: THREE.Vector3; readonly visible: boolean }[];
  /** A pigeon of a flock pecking on the ground at `at` coos (now and then, by day). */
  onCoo?: (at: Vec2) => void;
  /** Ledges by day (zone-local, y up): the lamps' arms, the shopfronts' cornices. Some of each flock sit up there. */
  perches?: readonly THREE.Vector3[];
  /** Where crumbs fall now (the terraces' tables with someone at them): the flock nearby hops over (zone-local). */
  crumbs?: () => readonly THREE.Vector3[];
}

/** A pigeon takes off when the player (or a passer-by) comes this close; its flockmates this close to it follow. */
const SCARE = 3;
const SPREAD = 2.2;
/** How far round its flock's spot a pigeon pecks, and how far away it may land. */
const FORAGE = 1.6;
const LAND_MIN = 7;
const LAND_MAX = 14;
const FLIGHT_SPEED = 7;
const GREYS = [0x8a8e96, 0x7a7e86, 0x9a9ca2, 0x6a6e76, 0xb0aca4, 0x5a5650];
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
/** Below this daylight they fly up to roost on the roofs' edges (and come down again above it). */
const ROOST_BELOW = 0.12;
/** Where they roost: this high, on the building line over their pavement, spread along it. */
const ROOST = { y: 15.5, line: 12.4, spread: 6 };
/** A flock on the ground coos every this many seconds or so. */
const COO_EVERY = [5, 16] as const;
/** In the park's gardens a flock roosts in the trees, this high. */
const TREE_ROOST = 9;
/** Of each flock about this share sit on a ledge by day; every so often one comes down and another goes up (s). */
const PERCHED_SHARE = 0.22;
const PERCH_SWAP = [10, 35] as const;
/** A ledge this far from a flock's spot at most is one of its own. */
const PERCH_REACH = 18;
/** Crumbs this close to a flock draw it over, a hop at a time. */
const CRUMBS_REACH = 7;
/** A flock called to someone's crumbs (`feedAt`) flies there from this far at most. */
const FEED_REACH = 28;

interface Bird {
  flock: number;
  x: number;
  z: number;
  y: number;
  yaw: number;
  flying: boolean;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  duration: number;
  /** Seconds before it takes off (a flock goes up in a ripple, not all at once), or -1. */
  startle: number;
  hop: number;
  hopFrom: [number, number];
  hopTo: [number, number];
  hopT: number;
  peck: number;
  /** Up on the roofs for the night: not drawn. */
  gone: boolean;
  /** This flight goes up to roost (it is gone once there). */
  roosting: boolean;
  /** The ledge it sits on (or is flying up to), or -1: on the ground. */
  perch: number;
}

/**
 * Pigeons pecking about the pavement in little flocks: each bird bobs its head at the ground,
 * hops a step now and then, turns; when the player comes within `SCARE` metres it takes off, its
 * flockmates in a ripple after it, and the flock flies off in an arc (wings beating) to land a way
 * along the pavement, clear of the player, where it goes on pecking. At dusk every flock takes off
 * towards the roofs' edges and is gone once up there (`onTakeOff` rings their wings), down again at dawn (a flock in
 * the park's gardens roosts in its trees). By day some of each flock sit up on the ledges near it (`perches`: the
 * lamps' arms, the shopfronts' cornices), one coming down and another going up now and then; a flock near crumbs (the
 * terraces' tables, `crumbs`) hops over to them, and one called to someone's crusts (`feedAt`) flies down round their
 * feet. A flock lands within its own ground: the walkable street (its end moves on with the works) or the gardens. One
 * instanced mesh for the bodies, one for the wings (two per bird): two draw calls for them all.
 */
export class Pigeons extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  private readonly birds: Bird[] = [];
  private readonly bodies: THREE.InstancedMesh;
  private readonly wings: THREE.InstancedMesh;
  private readonly spots: THREE.Vector3[];
  private readonly grounded: THREE.Vector3[] = [];
  /** Per flock: seconds to its next coo. */
  private readonly coos: number[];
  /** Ledges taken (by a bird's index), and seconds to the next swap of one up for one down. */
  private readonly ledges: (number | null)[];
  private swap = within(random, PERCH_SWAP);
  /** Round every bird, drawn or not (the meshes' bounds for culling): recomputed each frame from the birds. */
  private readonly bounds = new THREE.Box3();
  private readonly eye = new THREE.Vector3();
  /** This frame's scarers (the player's eye first, then every present walker), x and z pairs: filled once a frame. */
  private readonly scarers: number[] = [];
  private readonly pose = new THREE.Matrix4();
  private readonly turn = new THREE.Quaternion();
  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly spot = new THREE.Vector3();
  private readonly unit = new THREE.Vector3(1, 1, 1);
  private readonly lift = new THREE.Matrix4();
  private readonly wingOffset = new THREE.Matrix4();
  private time = 0;
  /** Whether it is roosting time (dusk to dawn): the flocks are on their way up, or up. */
  private roosted = false;
  /** Just (re)activated: at night the birds are already up there, by day already down. */
  private fresh = true;

  constructor(private readonly dayNight: DayNight, private readonly options: PigeonsOptions) {
    super();
    this.name = 'Pigeons';
    const share = options.share ?? 1;
    this.spots = options.flocks.map(({ at }) => new THREE.Vector3(at[0], 0, at[1]));
    this.coos = options.flocks.map(() => COO_EVERY[0] + random() * (COO_EVERY[1] - COO_EVERY[0]));
    options.flocks.forEach(({ at, count }, flock) => {
      for (let i = 0; i < Math.max(1, Math.round(count * share)); i++) {
        const [x, z] = [at[0] + (random() - 0.5) * 2 * FORAGE, at[1] + (random() - 0.5) * FORAGE];
        this.birds.push({
          flock, x, z, y: 0, yaw: random() * Math.PI * 2, flying: false, from: new THREE.Vector3(), to: new THREE.Vector3(), t: 0, duration: 1,
          startle: -1, hop: 1 + random() * 4, hopFrom: [x, z], hopTo: [x, z], hopT: 1, peck: random() * 10, gone: false, roosting: false, perch: -1,
        });
      }
    });
    this.ledges = (options.perches ?? []).map(() => null);
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, flatShading: true });
    this.bodies = new THREE.InstancedMesh(bodyGeometry(), material, this.birds.length);
    this.wings = new THREE.InstancedMesh(wingGeometry(), new THREE.MeshStandardMaterial({ color: 0x7a7e86, roughness: 0.9, side: THREE.DoubleSide, flatShading: true }), this.birds.length * 2);
    const color = new THREE.Color();
    this.birds.forEach((_, i) => {
      color.setHex(GREYS[i % GREYS.length]!);
      this.bodies.setColorAt(i, color);
    });
    for (const mesh of [this.bodies, this.wings]) {
      // Culled by a sphere round all the birds, kept up to date as they fly (`draw`).
      mesh.boundingSphere = new THREE.Sphere();
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.add(mesh);
    }
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  setZoneActive(active: boolean): void {
    if (active) this.fresh = true;
  }

  update(dt: number): void {
    this.time += dt;
    // Off to roost at dusk: each flock takes off in its ripple towards the roofs, and is gone once up there; down again at dawn.
    const night = this.dayNight.state.daylight <= ROOST_BELOW;
    if (this.fresh) {
      this.fresh = false;
      this.roosted = night;
      for (const bird of this.birds) {
        bird.gone = night;
        bird.flying = false;
        bird.startle = -1;
      }
      this.ledges.fill(null);
      for (const bird of this.birds) bird.perch = -1;
      if (!night) this.perchSome();
    } else if (night !== this.roosted) {
      this.roosted = night;
      if (night) this.flyUp();
      else this.comeDown();
    }
    const anyone = this.birds.some((b) => !b.gone);
    this.visible = anyone;
    if (!anyone) return;
    this.options.viewer.getWorldPosition(this.eye);
    this.worldToLocal(this.eye);
    this.scarers.length = 0;
    this.scarers.push(this.eye.x, this.eye.z);
    for (const walker of this.options.walkers ?? []) if (walker.isPresent && walker.isWalking) this.scarers.push(walker.position.x, walker.position.z);
    for (const dog of this.options.dogs ?? []) if (dog.visible) this.scarers.push(dog.position.x, dog.position.z);
    this.coo(dt);
    for (const bird of this.birds) {
      if (bird.gone) continue;
      if (bird.flying) this.fly(bird, dt);
      else if (this.roosted) {
        // Waiting for its turn in the ripple up.
        if (bird.startle >= 0 && (bird.startle -= dt) < 0) this.takeOffToRoost(bird);
      } else if (bird.perch >= 0) bird.peck += dt * 0.3;
      else this.forage(bird, dt);
    }
    if (!this.roosted && this.ledges.length && (this.swap -= dt) <= 0) {
      this.swap = within(random, PERCH_SWAP);
      this.swapPerch();
    }
    this.draw();
  }

  /** Dusk: every flock goes up in a ripple, one wing-clatter per flock. */
  private flyUp(): void {
    const told = new Set<number>();
    for (const bird of this.birds) {
      if (bird.gone) continue;
      if (!told.has(bird.flock)) {
        told.add(bird.flock);
        this.options.onTakeOff?.([bird.x, bird.z]);
      }
      if (!bird.flying) bird.startle = random() * 1.2;
      else bird.roosting = true;
    }
  }

  private takeOffToRoost(bird: Bird): void {
    bird.startle = -1;
    bird.flying = true;
    bird.roosting = true;
    this.release(bird);
    bird.from.set(bird.x, bird.y, bird.z);
    const side = Math.sign(bird.z) || 1;
    // In the gardens up into the trees; on the street onto the roofs' edges over its pavement.
    if (inPark(this.spots[bird.flock]!)) bird.to.set(bird.x + (random() - 0.5) * 6, TREE_ROOST + random() * 2, bird.z + (random() - 0.5) * 6);
    else bird.to.set(bird.x + (random() - 0.5) * 2 * ROOST.spread, ROOST.y + random() * 2, side * ROOST.line);
    bird.duration = Math.max(1.6, bird.from.distanceTo(bird.to) / FLIGHT_SPEED);
    bird.t = 0;
    bird.yaw = Math.atan2(bird.to.x - bird.x, bird.to.z - bird.z);
  }

  /** Dawn: down from the roofs onto their flock's spot. */
  private comeDown(): void {
    this.ledges.fill(null);
    for (const bird of this.birds) {
      const spot = this.spots[bird.flock]!;
      const side = Math.sign(spot.z) || 1;
      bird.gone = false;
      bird.roosting = false;
      bird.startle = -1;
      bird.flying = true;
      bird.perch = -1;
      if (inPark(spot)) bird.from.set(spot.x + (random() - 0.5) * 6, TREE_ROOST, spot.z + (random() - 0.5) * 6);
      else bird.from.set(spot.x + (random() - 0.5) * 2 * ROOST.spread, ROOST.y, side * ROOST.line);
      bird.to.set(spot.x + (random() - 0.5) * 2 * FORAGE, 0, spot.z + (random() - 0.5) * FORAGE);
      bird.x = bird.from.x;
      bird.y = bird.from.y;
      bird.z = bird.from.z;
      bird.duration = Math.max(1.6, bird.from.distanceTo(bird.to) / FLIGHT_SPEED) + random();
      bird.t = 0;
      bird.yaw = Math.atan2(bird.to.x - bird.x, bird.to.z - bird.z);
    }
  }

  private forage(bird: Bird, dt: number): void {
    if (bird.startle >= 0) {
      bird.startle -= dt;
      if (bird.startle < 0) this.takeOff(bird);
      return;
    }
    if (this.scared(bird)) {
      this.scare(bird);
      return;
    }
    // A hop to a nearby spot now and then; pecking in between (or over towards crumbs under a table).
    bird.hop -= dt;
    if (bird.hop <= 0 && bird.hopT >= 1) {
      bird.hop = 1.5 + random() * 4;
      const spot = this.spots[bird.flock]!;
      bird.hopFrom = [bird.x, bird.z];
      const crumb = random() < 0.3 ? this.crumbNear(spot) : null;
      if (crumb) {
        const dx = crumb.x - bird.x;
        const dz = crumb.z - bird.z;
        const d = Math.hypot(dx, dz) || 1;
        const step = Math.min(d - 0.15, 0.7);
        bird.hopTo = [bird.x + (dx / d) * step, bird.z + (dz / d) * step];
      } else {
        bird.hopTo = [
          THREE.MathUtils.clamp(bird.x + (random() - 0.5) * 0.8, spot.x - FORAGE * 1.5, spot.x + FORAGE * 1.5),
          THREE.MathUtils.clamp(bird.z + (random() - 0.5) * 0.5, spot.z - FORAGE, spot.z + FORAGE),
        ];
      }
      bird.hopT = 0;
      bird.yaw = Math.atan2(bird.hopTo[0] - bird.x, bird.hopTo[1] - bird.z);
    }
    if (bird.hopT < 1) {
      bird.hopT = Math.min(1, bird.hopT + dt * 2.2);
      bird.x = THREE.MathUtils.lerp(bird.hopFrom[0], bird.hopTo[0], bird.hopT);
      bird.z = THREE.MathUtils.lerp(bird.hopFrom[1], bird.hopTo[1], bird.hopT);
      bird.y = Math.sin(bird.hopT * Math.PI) * 0.06;
    } else bird.y = 0;
    bird.peck += dt;
  }

  /** Whether the player or anyone walking is within `SCARE` of this bird. */
  private scared(bird: Bird): boolean {
    const s = this.scarers;
    for (let i = 0; i < s.length; i += 2) {
      const dx = s[i]! - bird.x;
      const dz = s[i + 1]! - bird.z;
      if (dx * dx + dz * dz < SCARE * SCARE) return true;
    }
    return false;
  }

  /** This bird and its flockmates close by take off, one after another. */
  private scare(bird: Bird): void {
    for (const other of this.birds) {
      if (other.flying || other.startle >= 0 || other.flock !== bird.flock) continue;
      const d = Math.hypot(other.x - bird.x, other.z - bird.z);
      if (d < SPREAD || other === bird) other.startle = other === bird ? 0 : 0.05 + random() * 0.35;
    }
  }

  private takeOff(bird: Bird): void {
    // Somewhere along the same pavement, well clear of the player; the whole flock moves there.
    const spot = this.spots[bird.flock]!;
    if (spot.distanceTo(this.eye) < LAND_MIN || !this.birds.some((b) => b.flock === bird.flock && b.flying)) {
      const away = Math.sign(spot.x - this.eye.x) || 1;
      spot.x += away * (LAND_MIN + random() * (LAND_MAX - LAND_MIN));
      // Within its own ground: the walkable street (its end moves on with the works), or the park's gardens.
      const [lo, hi] = landX(spot);
      spot.x = THREE.MathUtils.clamp(spot.x, lo, hi);
      if (Math.abs(spot.x - this.eye.x) < LAND_MIN) spot.x = this.eye.x - away * LAND_MIN;
      this.options.onTakeOff?.([bird.x, bird.z]);
    }
    bird.flying = true;
    bird.from.set(bird.x, bird.y, bird.z);
    bird.to.set(spot.x + (random() - 0.5) * 2 * FORAGE, 0, spot.z + (random() - 0.5) * FORAGE);
    bird.duration = Math.max(1.4, bird.from.distanceTo(bird.to) / FLIGHT_SPEED);
    bird.t = 0;
    bird.yaw = Math.atan2(bird.to.x - bird.x, bird.to.z - bird.z);
  }

  private fly(bird: Bird, dt: number): void {
    bird.t = Math.min(1, bird.t + dt / bird.duration);
    const t = bird.t;
    bird.x = THREE.MathUtils.lerp(bird.from.x, bird.to.x, t);
    bird.z = THREE.MathUtils.lerp(bird.from.z, bird.to.z, t);
    // Up (or down) to where it lands, in an arc over the straight line.
    bird.y = THREE.MathUtils.lerp(bird.from.y, bird.to.y, t) + Math.sin(t * Math.PI) * (2.2 + bird.duration * 0.6);
    if (t >= 1 && bird.roosting) {
      bird.flying = false;
      bird.gone = true;
      return;
    }
    if (t >= 1 && bird.perch >= 0) {
      bird.flying = false;
      bird.y = bird.to.y;
      return;
    }
    if (t >= 1) {
      bird.flying = false;
      bird.y = 0;
      bird.hopT = 1;
      bird.hop = 1 + random() * 3;
    }
  }

  /**
   * Someone throws crumbs at `at` (zone-local) for `seconds`: the nearest flock down by day flies over and pecks there
   * (a standing feeder does not scare them; the player still does). False if no flock is near enough.
   */
  feedAt(at: Vec2): boolean {
    if (this.roosted) return false;
    let best = -1;
    let bestD = FEED_REACH;
    for (let f = 0; f < this.spots.length; f++) {
      const spot = this.spots[f]!;
      const d = Math.hypot(spot.x - at[0], spot.z - at[1]);
      if (d < bestD && this.birds.some((b) => b.flock === f && !b.gone)) {
        bestD = d;
        best = f;
      }
    }
    if (best < 0) return false;
    const spot = this.spots[best]!;
    spot.set(at[0], 0, at[1]);
    for (const bird of this.birds) {
      if (bird.flock !== best || bird.gone || bird.flying || bird.perch >= 0) continue;
      bird.flying = true;
      bird.startle = -1;
      bird.from.set(bird.x, bird.y, bird.z);
      bird.to.set(spot.x + (random() - 0.5) * FORAGE, 0, spot.z + (random() - 0.5) * FORAGE * 0.6);
      bird.duration = Math.max(1, bird.from.distanceTo(bird.to) / FLIGHT_SPEED) + random() * 0.6;
      bird.t = 0;
      bird.yaw = Math.atan2(bird.to.x - bird.x, bird.to.z - bird.z);
    }
    return true;
  }

  /** By day, some of each flock up on the ledges near it at once (on arrival). */
  private perchSome(): void {
    const perches = this.options.perches ?? [];
    if (!perches.length) return;
    this.birds.forEach((bird, i) => {
      if (bird.gone || random() > PERCHED_SHARE) return;
      const ledge = this.freeLedge(this.spots[bird.flock]!);
      if (ledge < 0) return;
      const p = perches[ledge]!;
      this.ledges[ledge] = i;
      bird.perch = ledge;
      bird.x = p.x + (random() - 0.5) * 0.2;
      bird.y = p.y;
      bird.z = p.z;
      bird.yaw = random() * Math.PI * 2;
    });
  }

  /** One on a ledge comes down to its flock, and one of a flock on the ground flies up to a free ledge near it. */
  private swapPerch(): void {
    const perches = this.options.perches ?? [];
    const up = this.birds.filter((b) => b.perch >= 0 && !b.flying && !b.gone);
    const down = up[Math.floor(random() * up.length)];
    if (down && random() < 0.6) {
      const spot = this.spots[down.flock]!;
      this.release(down);
      this.flyTo(down, spot.x + (random() - 0.5) * 2 * FORAGE, 0, spot.z + (random() - 0.5) * FORAGE);
    }
    const ground = this.birds.filter((b) => b.perch < 0 && !b.flying && !b.gone && b.startle < 0);
    const bird = ground[Math.floor(random() * ground.length)];
    if (!bird) return;
    const ledge = this.freeLedge(new THREE.Vector3(bird.x, 0, bird.z));
    if (ledge < 0) return;
    const p = perches[ledge]!;
    this.ledges[ledge] = this.birds.indexOf(bird);
    bird.perch = ledge;
    this.flyTo(bird, p.x + (random() - 0.5) * 0.2, p.y, p.z);
  }

  /** The nearest free ledge within reach of `near`, or -1. */
  private freeLedge(near: THREE.Vector3): number {
    const perches = this.options.perches ?? [];
    let best = -1;
    let bestD = PERCH_REACH;
    for (let i = 0; i < perches.length; i++) {
      if (this.ledges[i] !== null) continue;
      const p = perches[i]!;
      const d = Math.hypot(p.x - near.x, p.z - near.z) + random() * 3;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  /** Off its ledge (it is free again). */
  private release(bird: Bird): void {
    if (bird.perch >= 0 && this.ledges[bird.perch] === this.birds.indexOf(bird)) this.ledges[bird.perch] = null;
    bird.perch = -1;
  }

  private flyTo(bird: Bird, x: number, y: number, z: number): void {
    bird.flying = true;
    bird.startle = -1;
    bird.from.set(bird.x, bird.y, bird.z);
    bird.to.set(x, y, z);
    bird.duration = Math.max(1.2, bird.from.distanceTo(bird.to) / FLIGHT_SPEED);
    bird.t = 0;
    bird.yaw = Math.atan2(bird.to.x - bird.x, bird.to.z - bird.z);
  }

  /** Crumbs within reach of a flock's spot, if any (one of them). */
  private crumbNear(spot: THREE.Vector3): THREE.Vector3 | null {
    const crumbs = this.options.crumbs?.() ?? [];
    for (const c of crumbs) if (Math.hypot(c.x - spot.x, c.z - spot.z) < CRUMBS_REACH) return c;
    return null;
  }

  /** Where the flocks peck about now, those with a bird on the ground (zone-local): what a dog on a lead pulls towards. */
  onTheGround(): readonly THREE.Vector3[] {
    this.grounded.length = 0;
    if (this.roosted || !this.visible) return this.grounded;
    for (let f = 0; f < this.spots.length; f++) if (this.birds.some((b) => b.flock === f && !b.flying && !b.gone && b.perch < 0)) this.grounded.push(this.spots[f]!);
    return this.grounded;
  }

  /** Now and then one of a flock on the ground coos (not while it is up on the roofs, not at night). */
  private coo(dt: number): void {
    if (!this.options.onCoo || this.roosted) return;
    for (let f = 0; f < this.coos.length; f++) {
      this.coos[f]! -= dt;
      if (this.coos[f]! > 0) continue;
      this.coos[f] = COO_EVERY[0] + random() * (COO_EVERY[1] - COO_EVERY[0]);
      const bird = this.birds.find((b) => b.flock === f && !b.flying && !b.gone);
      if (bird) this.options.onCoo([bird.x, bird.z]);
    }
  }

  private draw(): void {
    this.bounds.makeEmpty();
    for (let i = 0; i < this.birds.length; i++) {
      const bird = this.birds[i]!;
      // Pecking pitches the body forward in quick dips; in flight it is level and the wings beat.
      // On a ledge only a look about now and then.
      const peck = bird.flying ? 0 : bird.perch >= 0 ? Math.max(0, Math.sin(bird.peck * 4 + i)) ** 10 * 0.3 : Math.max(0, Math.sin(bird.peck * 5 + i)) ** 6 * 0.7;
      this.euler.set(peck, bird.yaw, 0);
      this.turn.setFromEuler(this.euler);
      this.spot.set(bird.x, bird.y, bird.z);
      this.pose.compose(this.spot, this.turn, this.unit);
      if (bird.gone) this.pose.copy(HIDDEN);
      this.bodies.setMatrixAt(i, this.pose);
      if (!bird.gone) this.bounds.expandByPoint(this.spot);
      if (!bird.flying || bird.gone) {
        this.wings.setMatrixAt(2 * i, HIDDEN);
        this.wings.setMatrixAt(2 * i + 1, HIDDEN);
        continue;
      }
      const beat = Math.sin(this.time * 24 + i) * 0.9;
      for (const side of [-1, 1] as const) {
        this.wingOffset.makeRotationZ(side * (0.2 + beat)).premultiply(this.lift.makeTranslation(side * 0.035, 0.2, 0));
        if (side < 0) this.wingOffset.multiply(MIRROR);
        this.wings.setMatrixAt(2 * i + (side > 0 ? 1 : 0), this.wingOffset.premultiply(this.pose));
      }
    }
    // The bounds the renderer culls by: round the birds, plus a wing's span.
    if (!this.bounds.isEmpty()) {
      for (const mesh of [this.bodies, this.wings]) {
        this.bounds.getBoundingSphere(mesh.boundingSphere!);
        mesh.boundingSphere!.radius += 0.4;
      }
    }
    this.bodies.instanceMatrix.needsUpdate = true;
    this.wings.instanceMatrix.needsUpdate = true;
  }
}

const MIRROR = new THREE.Matrix4().makeScale(-1, 1, 1);

/** A flock in the park's gardens (beyond the hedge), not on the street's pavements. */
function inPark(spot: THREE.Vector3): boolean {
  return spot.x < PARK_STREET.hedge;
}

/** Where a flock may land along its ground (x): inside the walkable street, short of its ends (read now: the end moves on with the works), or the gardens. */
function landX(spot: THREE.Vector3): readonly [number, number] {
  return inPark(spot) ? [PARK_WALK.minX + 2, PARK_WALK.maxX - 2] : [WALKABLE.minX + 1.5, WALKABLE.maxX - 2];
}

/** A pigeon at rest, beak to +z: a plump body, the head on a short neck, a tail; about 32 cm long. */
function bodyGeometry(): THREE.BufferGeometry {
  const body = new THREE.IcosahedronGeometry(0.1, 1).scale(0.85, 0.8, 1.35).translate(0, 0.14, 0);
  const head = new THREE.IcosahedronGeometry(0.045, 1).translate(0, 0.24, 0.12);
  const beak = new THREE.ConeGeometry(0.012, 0.04, 4).rotateX(Math.PI / 2).translate(0, 0.235, 0.17);
  const tail = new THREE.BoxGeometry(0.08, 0.015, 0.12).rotateX(-0.25).translate(0, 0.13, -0.17);
  const legs = new THREE.BoxGeometry(0.05, 0.07, 0.015).translate(0, 0.035, 0.01);
  const parts = [body, head, beak, tail, legs].map((g) => (g.index ? g.toNonIndexed() : g));
  const merged = mergeGeometries(parts.map((g) => {
    g.deleteAttribute('uv');
    return g;
  }))!;
  merged.computeVertexNormals();
  return merged;
}

/** One wing, spreading along +x from the shoulder: a flat tapering blade. */
function wingGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape([new THREE.Vector2(0, -0.06), new THREE.Vector2(0.24, -0.02), new THREE.Vector2(0.26, 0.02), new THREE.Vector2(0, 0.06)]);
  return new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
}
