import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { QUALITY } from '@/graphics/quality';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { Prop } from '../props/Prop';
import { INSET } from '../props/joinery';
import { instancedStandard, paint, standard } from '../materials/palette';
import { isShared } from '../materials/sharedResources';
import { plasterBumpMap } from '../materials/surfaces';
import { STAIRWELL_PLAN as plan, STOREY, STOREYS, landingY, type Rect } from './stairwellPlan';
import { flightTreads } from './flights';
import { STAIR_ATTRIBUTE, stairFloors, stairWalls, type StairFloors, type StairWalls } from './stairFinish';

/** `wall`: the painted walls (dado, creases: `stairFinish`); `plaster`: the ceilings, soffits and cornices. */
type Finish = 'stone' | 'plaster' | 'wall' | 'iron' | 'wood' | 'hall' | 'tread';

/** Which floor lines a wall stands over (see `stairWalls`): the stair's sides, the landings' walls, the hall's. */
type WallProfile = 'west' | 'east' | 'north' | 'south' | 'strip' | 'hall';

/** How high a step up the feet may take in one go (a stair's riser, with room to spare). */
const STEP_UP = 0.45;
const SLAB = 0.18;
const RAIL_HEIGHT = 0.95;
const BAR_SPACING = 0.12;
/** A cast-iron baluster, turned: (radius, height) up its profile, for a 0.95 m rail. */
const BALUSTER: readonly [number, number][] = [
  [0.014, 0],
  [0.014, 0.04],
  [0.008, 0.07],
  [0.016, 0.2],
  [0.008, 0.33],
  [0.006, 0.6],
  [0.011, 0.78],
  [0.006, 0.84],
  [0.006, 0.95],
];
/** The cornice round each landing's ceiling: its height down the wall, how far it stands out. */
const CORNICE = { drop: 0.07, out: 0.05 };
/** The skylight's iron: its frame round the glass, the bars between the panes. */
const SKYLIGHT = { width: 2.6, depth: 3.4, panesX: 4, panesZ: 6, frame: 0.1, bar: 0.03 };
/** The treads' nosings, rounded this much (with `QUALITY.bevels`) so each step catches the light. */
const NOSING = 0.008;
/** The shaft's walls and our strip's run up to here (the roof over our landing). */
const TOP = landingY(0) + 2.8;

/** A tread of a flight: the floor landing above it (`k`), which flight, which tread from the top. */
type OnFlight = { k: number; which: 'A' | 'B'; tread: number };

const inside = (r: Rect, x: number, z: number): boolean => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;

/**
 * The building's staircase, from our landing on the fifth floor down to the entrance hall: the
 * shaft's plaster walls, stone floor landings and half landings, ten flights of nine steps round
 * the lift's well (flight A down the west side, flight B down the east side, a storey every two),
 * an iron balustrade with a wooden handrail along the well, the strip of landing from the flat's
 * front door, the entrance hall's cabochon tiles. Merged per material (a draw call each); the
 * walls and the well's edges are `colliders`. `floorAt` is the height of the stone under the feet
 * (flights stack one above the other: the one just under the feet), the player's ground here.
 */
export class Staircase extends Prop {
  readonly contactShadow = false;
  readonly colliders: THREE.Box3[] = [];
  private readonly parts = new Map<Finish, THREE.BufferGeometry[]>();
  private readonly balusters: THREE.Matrix4[] = [];
  private readonly flightRun = plan.treads * 0.28;
  private readonly half = STOREY / 2;
  private readonly walls: StairWalls;
  private readonly floors: StairFloors[] = [];

  /** `paint`: the walls' colours as the co-owners voted them (`STAIR_PAINTS`). */
  constructor(wallPaint = 'cream') {
    super();
    this.name = 'Staircase';
    this.buildWalls();
    for (let k = 0; k <= STOREYS; k++) this.buildFloorLanding(k);
    for (let k = 0; k < STOREYS; k++) {
      this.buildHalfLanding(k);
      this.buildFlight(k, 'A');
      this.buildFlight(k, 'B');
      this.buildRails(k);
    }
    this.buildHall();
    this.buildNewel();
    this.buildCornices();
    this.buildSkylight();
    this.buildColliders();

    this.walls = stairWalls(wallPaint);
    const stone = new THREE.MeshStandardMaterial({ color: 0xcfc8ba, roughness: 0.75 });
    const tread = new THREE.MeshStandardMaterial({ map: treadTexture(), roughness: 0.6 });
    const hall = new THREE.MeshStandardMaterial({ map: cabochonTexture(), roughness: 0.35 });
    this.floors = [stairFloors(stone, 'stone'), stairFloors(tread, 'tread'), stairFloors(hall, 'hall')];
    const plaster = new THREE.MeshStandardMaterial({ color: 0xe9e0cc, roughness: 0.95 });
    if (QUALITY.detailedMaterials) {
      plaster.bumpMap = plasterBumpMap();
      plaster.bumpScale = 0.3;
    }
    const materials: Record<Finish, THREE.Material> = {
      stone,
      tread,
      plaster,
      wall: this.walls.material,
      iron: standard({ color: 0x1c1d20, roughness: 0.45, metalness: 0 }),
      wood: paint(0x4a2c1c, 0.5),
      hall,
    };
    for (const [finish, geometries] of this.parts) {
      const mesh = new THREE.Mesh(mergeGeometries(geometries)!, materials[finish]);
      for (const g of geometries) g.dispose();
      mesh.receiveShadow = true;
      mesh.castShadow = finish !== 'plaster' && finish !== 'wall';
      this.add(mesh);
    }
    for (const [finish, material] of Object.entries(materials)) if (!this.parts.has(finish as Finish) && !isShared(material)) material.dispose();

    // The balusters, one turned cast-iron bar instanced all the way down (one draw).
    const lathe = new THREE.LatheGeometry(BALUSTER.map(([r, y]) => new THREE.Vector2(r, y)), 6);
    const bars = new THREE.InstancedMesh(lathe, instancedStandard({ color: 0x1c1d20, roughness: 0.45, metalness: 0 }), this.balusters.length);
    this.balusters.forEach((m, i) => bars.setMatrixAt(i, m));
    bars.castShadow = false;
    bars.receiveShadow = true;
    bars.computeBoundingSphere();
    this.add(bars);
  }

  /** Repaints the walls (a key of `STAIR_PAINTS`: the co-owners' vote). */
  setPaint(id: string): void {
    this.walls.setPaint(id);
  }

  /** Whether a runner covers the flights (the stone's wear shows only without one). */
  setRunner(on: boolean): void {
    for (const f of this.floors) f.setRunner(on);
  }

  /**
   * The height (local) of the floor under (x, z) for feet at `feet` (local): of every landing,
   * flight and floor there, the highest no more than a step above the feet. Null where the
   * stairwell has no floor (anywhere else in the world). On a flight it is the tread under the
   * feet (`stepped`, the player's: the controller eases each step and dips the eye stepping down),
   * or the slope along the nosings (a resident's feet, which would hop from tread to tread).
   */
  floorAt(x: number, z: number, feet: number, stepped = true): number | null {
    return this.find(x, z, feet, stepped)?.height ?? null;
  }

  /** Which tread of which flight (landing `k` above it, `A` or `B`, 1 from the top) the feet at (x, z) stand on; null off the flights. */
  treadAt(x: number, z: number, feet: number): { k: number; flight: 'A' | 'B'; tread: number } | null {
    const found = this.find(x, z, feet, true);
    return found?.flight ? { k: found.flight.k, flight: found.flight.which, tread: found.flight.tread } : null;
  }

  private find(x: number, z: number, feet: number, stepped: boolean): { height: number; flight: OnFlight | null } | null {
    let best = -Infinity;
    let lowest = Infinity;
    let bestFlight: OnFlight | null = null;
    let lowestFlight: OnFlight | null = null;
    const offer = (h: number, flight: OnFlight | null = null): void => {
      if (h < lowest) {
        lowest = h;
        lowestFlight = flight;
      }
      if (h <= feet + STEP_UP && h > best) {
        best = h;
        bestFlight = flight;
      }
    };
    const { treads } = plan;
    // How far down a flight the feet are, 0 at its head .. 1 at its foot: on the tread's top, or on the slope.
    const drop = (along: number): { share: number; tread: number } => {
      const tread = THREE.MathUtils.clamp(Math.ceil(along * treads), 1, treads);
      return { share: stepped ? tread / treads : along, tread };
    };
    const { shaft, floorLanding, halfLanding, flightA, flightB, strip, hall } = plan;
    if (inside(strip, x, z)) offer(landingY(0));
    if (inside(hall, x, z)) offer(0);
    if (x >= shaft.x0 && x <= shaft.x1) {
      if (z >= floorLanding.z0 && z <= floorLanding.z1) for (let k = 0; k <= STOREYS; k++) offer(landingY(k));
      if (z >= halfLanding.z0 && z <= halfLanding.z1) for (let k = 0; k < STOREYS; k++) offer(landingY(k) - this.half);
      if (z > halfLanding.z1 && z < floorLanding.z0) {
        // Down flight A going south from the floor landing; down flight B going north from the half landing.
        const a = drop((floorLanding.z0 - z) / this.flightRun);
        const b = drop((z - halfLanding.z1) / this.flightRun);
        for (let k = 0; k < STOREYS; k++) {
          if (x >= flightA.x0 && x <= flightA.x1) offer(landingY(k) - this.half * a.share, { k, which: 'A', tread: a.tread });
          if (x >= flightB.x0 && x <= flightB.x1) offer(landingY(k) - this.half - this.half * b.share, { k, which: 'B', tread: b.tread });
        }
      }
    }
    if (lowest === Infinity) return null;
    return best === -Infinity ? { height: lowest, flight: lowestFlight } : { height: best, flight: bestFlight };
  }

  private put(finish: Finish, geometry: THREE.BufferGeometry): void {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (g !== geometry) geometry.dispose();
    metreUvs(g);
    const list = this.parts.get(finish) ?? [];
    list.push(g);
    this.parts.set(finish, list);
  }

  /** A box from (x0, y0, z0) to (x1, y1, z1). */
  private box(finish: Finish, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
    this.put(finish, new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2));
  }

  /** A step: a box whose edges are rounded a few millimetres on the better qualities (`QUALITY.bevels`). */
  private tread(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
    if (!QUALITY.bevels) {
      this.box('tread', x0, y0, z0, x1, y1, z1);
      return;
    }
    const g = new RoundedBoxGeometry(x1 - x0, y1 - y0, z1 - z0, 1, NOSING);
    this.put('tread', g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2));
  }

  /**
   * A painted wall face from (ax, az) to (bx, bz), y0 to y1, facing the left-hand normal (-dz, dx); uvs in metres.
   * Cut where the stair breaks along it (a flight's head and foot), each piece carrying the floor lines it stands
   * over (`STAIR_ATTRIBUTE`, see `stairWalls`).
   */
  private wall(ax: number, az: number, bx: number, bz: number, y0: number, y1: number): void {
    const profile = wallProfile(ax, az, bx, bz);
    const cuts = profile === 'west' || profile === 'east' ? [plan.halfLanding.z1, plan.floorLanding.z0] : [];
    const along = (t: number): [number, number] => [ax + (bx - ax) * t, az + (bz - az) * t];
    const ts = [0, ...cuts.map((z) => (bz === az ? -1 : (z - az) / (bz - az))).filter((t) => t > 1e-4 && t < 1 - 1e-4), 1].sort((a, b) => a - b);
    for (let i = 0; i + 1 < ts.length; i++) {
      const [x0, z0] = along(ts[i]!);
      const [x1, z1] = along(ts[i + 1]!);
      const length = Math.hypot(x1 - x0, z1 - z0);
      const g = new THREE.PlaneGeometry(length, y1 - y0);
      // A plane faces +z; turn it to face (-dz, dx).
      g.rotateY(Math.atan2(-(bz - az), bx - ax));
      g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      const n = floorLines(profile, (z0 + z1) / 2).n;
      const pos = g.getAttribute('position');
      const stair = new Float32Array(pos.count * 2);
      for (let v = 0; v < pos.count; v++) {
        stair[v * 2] = floorLines(profile, pos.getZ(v)).p;
        stair[v * 2 + 1] = n;
      }
      g.setAttribute(STAIR_ATTRIBUTE, new THREE.BufferAttribute(stair, 2));
      this.put('wall', g);
    }
  }

  /** A horizontal quad over a rectangle at height y, facing up (or down). */
  private flat(finish: Finish, r: Rect, y: number, down = false): void {
    const g = new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0).rotateX(down ? Math.PI / 2 : -Math.PI / 2);
    g.translate((r.x0 + r.x1) / 2, y, (r.z0 + r.z1) / 2);
    this.put(finish, g);
  }

  private buildWalls(): void {
    const { shaft, strip, opening, frontDoor, flightA, floorLanding } = plan;
    const top0 = landingY(0);
    // The shaft, all the way up: west (facing +x; open onto our strip at the top), east, south, north (open onto the hall at the bottom).
    this.wall(shaft.x0, shaft.z1, shaft.x0, strip.z0, 0, top0);
    this.wall(shaft.x0, shaft.z1, shaft.x0, strip.z0, top0 + strip.ceiling, TOP);
    this.wall(shaft.x0, strip.z0, shaft.x0, shaft.z0, 0, TOP);
    this.wall(shaft.x1, shaft.z0, shaft.x1, shaft.z1, 0, TOP);
    this.wall(shaft.x0, shaft.z0, shaft.x1, shaft.z0, 0, TOP);
    this.wall(shaft.x1, shaft.z1, opening.x0, shaft.z1, opening.height, TOP);
    this.wall(opening.x0, shaft.z1, shaft.x0, shaft.z1, 0, TOP);
    // The roof over the shaft (the lights lay a skylight on it), the stone floor at its foot.
    this.flat('plaster', shaft, TOP, true);
    this.flat('stone', { x0: shaft.x0, x1: shaft.x1, z0: shaft.z0, z1: floorLanding.z0 }, 0);
    // The cupboard under flight A's foot, off the hall's landing.
    this.wall(flightA.x0, floorLanding.z0, flightA.x1, floorLanding.z0, 0, 2.2);
    // Our strip: floor, ceiling, its two long walls, and its west end round the flat's front door.
    this.flat('tread', strip, top0);
    this.flat('plaster', strip, top0 + strip.ceiling, true);
    this.wall(strip.x1, strip.z1, strip.x0, strip.z1, top0, top0 + strip.ceiling);
    this.wall(strip.x0, strip.z0, strip.x1, strip.z0, top0, top0 + strip.ceiling);
    const d0 = frontDoor.z - frontDoor.width / 2 - 0.07;
    const d1 = frontDoor.z + frontDoor.width / 2 + 0.07;
    this.wall(strip.x0, strip.z1, strip.x0, d1, top0, top0 + strip.ceiling);
    this.wall(strip.x0, d0, strip.x0, strip.z0, top0, top0 + strip.ceiling);
    this.wall(strip.x0, d1, strip.x0, d0, top0 + frontDoor.height + 0.07, top0 + strip.ceiling);
  }

  private buildFloorLanding(k: number): void {
    const y = landingY(k);
    const { shaft, floorLanding } = plan;
    const r: Rect = { x0: shaft.x0, x1: shaft.x1, z0: floorLanding.z0, z1: floorLanding.z1 };
    if (k === STOREYS) {
      // The ground floor: the hall's tiles run on under the last flight's foot.
      this.flat('hall', r, 0.001);
      return;
    }
    this.flat('tread', r, y);
    this.box('stone', r.x0, y - SLAB, r.z0, r.x1, y - INSET, r.z1); // its top just under the tread's
  }

  private buildHalfLanding(k: number): void {
    const y = landingY(k) - this.half;
    const { shaft, halfLanding } = plan;
    const r: Rect = { x0: shaft.x0, x1: shaft.x1, z0: halfLanding.z0, z1: halfLanding.z1 };
    this.flat('tread', r, y);
    this.box('stone', r.x0, y - SLAB, r.z0, r.x1, y - INSET, r.z1); // its top just under the tread's
  }

  /** Nine steps from the floor landing down to the half landing (A, south), or from there to the next floor (B, north); the stone soffit under them. */
  private buildFlight(k: number, which: 'A' | 'B'): void {
    const { floorLanding, halfLanding } = plan;
    const lane = which === 'A' ? plan.flightA : plan.flightB;
    const top = which === 'A' ? landingY(k) : landingY(k) - this.half;
    // The last tread is level with the landing below it; at the foot of the building's last flight the shaft's stone floor is that tread.
    for (const t of flightTreads(k, which)) if (!t.floor) this.tread(t.x0, t.bottom, t.z0, t.x1, t.top, t.z1);
    // The soffit: a slab along the slope, under the steps.
    const zTop = which === 'A' ? floorLanding.z0 : halfLanding.z1;
    const zBottom = which === 'A' ? halfLanding.z1 : floorLanding.z0;
    const length = Math.hypot(this.flightRun, this.half);
    const soffit = new THREE.BoxGeometry(lane.x1 - lane.x0, 0.14, length);
    const slope = Math.atan2(this.half, this.flightRun);
    soffit.rotateX(which === 'A' ? -slope : slope);
    soffit.translate((lane.x0 + lane.x1) / 2, top - this.half / 2 - 0.2, (zTop + zBottom) / 2);
    this.put('plaster', soffit);
  }

  /** The balustrade along the well: flight A's inner edge, the half landing's, flight B's; the floor landing's either side of the lift gate. */
  private buildRails(k: number): void {
    const { well, car, floorLanding, halfLanding } = plan;
    const yTop = landingY(k);
    const yHalf = yTop - this.half;
    const yNext = landingY(k + 1);
    // Along flight A (x = well.x0), sloping from the floor landing down to the half landing.
    this.rail(well.x0, floorLanding.z0, yTop, well.x0, halfLanding.z1, yHalf);
    // The half landing's edge (z = well.z0), level.
    this.rail(well.x0, well.z0, yHalf, well.x1, well.z0, yHalf);
    // Along flight B (x = well.x1), sloping from the half landing down to the next floor.
    this.rail(well.x1, halfLanding.z1, yHalf, well.x1, floorLanding.z0, yNext);
    // The next floor landing's edge either side of the lift gate.
    this.rail(well.x0, well.z1, yNext, car.x0, well.z1, yNext);
    this.rail(car.x1, well.z1, yNext, well.x1, well.z1, yNext);
    if (k === 0) {
      this.rail(well.x0, well.z1, yTop, car.x0, well.z1, yTop);
      this.rail(car.x1, well.z1, yTop, well.x1, well.z1, yTop);
      // Our landing's edge over flight B's head (there is no flight up from the top floor).
      this.rail(plan.flightB.x0, floorLanding.z0, yTop, plan.flightB.x1, floorLanding.z0, yTop);
    }
  }

  /** A run of balustrade from (ax, ay, az) to (bx, by, bz), floor heights at either end: bars, a bottom rail, the handrail. */
  private rail(ax: number, az: number, ay: number, bx: number, bz: number, by: number): void {
    const length = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(length / BAR_SPACING));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      const y = ay + (by - ay) * t;
      this.balusters.push(new THREE.Matrix4().makeTranslation(x, y, z));
    }
    const drop = by - ay;
    const run = Math.hypot(length, drop);
    const yaw = Math.atan2(bx - ax, bz - az);
    const pitch = Math.atan2(-drop, length);
    for (const [finish, h, w, t] of [['wood', RAIL_HEIGHT, 0.06, 0.05], ['iron', 0.06, 0.03, 0.03]] as const) {
      const g = new THREE.BoxGeometry(w, t, run);
      g.rotateX(pitch);
      g.rotateY(yaw);
      g.translate((ax + bx) / 2, (ay + by) / 2 + h, (az + bz) / 2);
      this.put(finish, g);
    }
  }

  /** The entrance hall on the street: tiled floor, plaster walls and ceiling; the hall's south wall east of the shaft's opening. */
  private buildHall(): void {
    const { hall, shaft } = plan;
    this.flat('hall', hall, 0.001);
    this.flat('plaster', hall, hall.height, true);
    this.wall(hall.x0, hall.z1, hall.x0, hall.z0, 0, hall.height);
    // The east wall, round the concierge's lodge window (`STAIRWELL_PLAN.lodge`).
    const { window: pane } = plan.lodge;
    const w0 = pane.z - pane.width / 2;
    const w1 = pane.z + pane.width / 2;
    this.wall(hall.x1, hall.z0, hall.x1, w0, 0, hall.height);
    this.wall(hall.x1, w0, hall.x1, w1, 0, pane.sill);
    this.wall(hall.x1, w0, hall.x1, w1, pane.sill + pane.height, hall.height);
    this.wall(hall.x1, w1, hall.x1, hall.z1, 0, hall.height);
    this.wall(hall.x1, hall.z1, hall.x0, hall.z1, 0, hall.height);
    this.wall(shaft.x1, hall.z0, hall.x1, hall.z0, 0, hall.height);
    // A marble dado round the hall, knee high.
    this.box('stone', hall.x0, 0, hall.z0, hall.x0 + 0.02, 1.0, hall.z1);
    this.box('stone', hall.x1 - 0.02, 0, hall.z0, hall.x1, 1.0, hall.z1);
  }

  /** The newel post at the foot of the balustrade in the hall: a turned oak post, the handrail curling round its top in a volute. */
  private buildNewel(): void {
    const { well, floorLanding } = plan;
    const post = new THREE.LatheGeometry(
      [
        [0.05, 0],
        [0.05, 0.08],
        [0.035, 0.12],
        [0.03, 0.75],
        [0.045, 0.82],
        [0.03, 0.9],
        [0.0, 0.9],
      ].map(([r, y]) => new THREE.Vector2(r, y)),
      10,
    );
    this.put('wood', post.translate(well.x1, 0, floorLanding.z0));
    const volute = new THREE.TorusGeometry(0.075, 0.026, 6, 18, Math.PI * 1.6).rotateX(Math.PI / 2);
    this.put('wood', volute.translate(well.x1, RAIL_HEIGHT - 0.01, floorLanding.z0));
    this.put('iron', new THREE.SphereGeometry(0.035, 10, 6).translate(well.x1, 0.94, floorLanding.z0));
  }

  /** A stepped plaster cornice under every landing's ceiling (the slab above), round the shaft's top and the hall's. */
  private buildCornices(): void {
    const { shaft, floorLanding, halfLanding, hall } = plan;
    for (let k = 1; k <= STOREYS; k++) {
      const floor = landingY(k - 1) - SLAB;
      this.cornice(floor, { x0: shaft.x0, x1: shaft.x1, z0: floorLanding.z0, z1: shaft.z1 }, ['n', 'w', 'e']);
      if (k < STOREYS) this.cornice(floor - this.half, { x0: shaft.x0, x1: shaft.x1, z0: shaft.z0, z1: halfLanding.z1 }, ['s', 'w', 'e']);
    }
    this.cornice(TOP, { x0: shaft.x0, x1: shaft.x1, z0: shaft.z0, z1: shaft.z1 }, ['n', 's', 'w', 'e']);
    this.cornice(hall.height, { x0: hall.x0, x1: hall.x1, z0: hall.z0, z1: hall.z1 }, ['n', 'w', 'e']);
  }

  /** The cornice under a ceiling at `y` along the named sides of `r` (n: +z, s: -z, w: -x, e: +x), standing into it. */
  private cornice(y: number, r: Rect, sides: readonly ('n' | 's' | 'w' | 'e')[]): void {
    const { drop, out } = CORNICE;
    // Two steps: the deep upper one, a thinner lip under it; a millimetre into the wall and the ceiling.
    for (const [d, o] of [[drop / 2, out], [drop, out * 0.45]] as const) {
      const y0 = y - d;
      const y1 = y + 0.001;
      for (const side of sides) {
        if (side === 'n') this.box('plaster', r.x0, y0, r.z1 - o, r.x1, y1, r.z1 + 0.001);
        if (side === 's') this.box('plaster', r.x0, y0, r.z0 - 0.001, r.x1, y1, r.z0 + o);
        if (side === 'w') this.box('plaster', r.x0 - 0.001, y0, r.z0, r.x0 + o, y1, r.z1);
        if (side === 'e') this.box('plaster', r.x1 - o, y0, r.z0, r.x1 + 0.001, y1, r.z1);
      }
    }
  }

  /** The skylight's cast iron under the roof's glass (its glow is `StairLights`'): a frame and the glazing bars between the panes. */
  private buildSkylight(): void {
    const { well } = plan;
    const { width, depth, panesX, panesZ, frame, bar } = SKYLIGHT;
    const cx = (well.x0 + well.x1) / 2;
    const cz = (well.z0 + well.z1) / 2;
    const x0 = cx - width / 2;
    const x1 = cx + width / 2;
    const z0 = cz - depth / 2;
    const z1 = cz + depth / 2;
    const y0 = TOP - 0.06;
    const y1 = TOP - 0.012;
    this.box('iron', x0 - frame, y0, z0 - frame, x1 + frame, y1, z0);
    this.box('iron', x0 - frame, y0, z1, x1 + frame, y1, z1 + frame);
    this.box('iron', x0 - frame, y0, z0, x0, y1, z1);
    this.box('iron', x1, y0, z0, x1 + frame, y1, z1);
    for (let i = 1; i < panesX; i++) {
      const x = x0 + (i * width) / panesX;
      this.box('iron', x - bar / 2, y0 + 0.01, z0, x + bar / 2, y1, z1);
    }
    for (let j = 1; j < panesZ; j++) {
      const z = z0 + (j * depth) / panesZ;
      this.box('iron', x0, y0 + 0.015, z - bar / 2, x1, y1, z + bar / 2);
    }
  }

  /** The walls (world-facing boxes, zone-local), the well's sides and the gaps no flight fills. */
  private buildColliders(): void {
    const { shaft, strip, hall, opening, well, car, flightA, flightB, floorLanding } = plan;
    const top0 = landingY(0);
    const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void => {
      this.colliders.push(new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1)));
    };
    const T = 0.1;
    // Our strip's long walls.
    box(strip.x0, top0, strip.z1, strip.x1, top0 + strip.ceiling, strip.z1 + T);
    box(strip.x0, top0, strip.z0 - T, strip.x1, top0 + strip.ceiling, strip.z0);
    // The shaft: west (open onto our strip at the top), east, south, north (open onto the hall at the bottom).
    box(shaft.x0 - T, 0, shaft.z0, shaft.x0, TOP, strip.z0);
    box(shaft.x0 - T, 0, strip.z0, shaft.x0, top0, shaft.z1);
    box(shaft.x1, 0, shaft.z0, shaft.x1 + T, TOP, shaft.z1);
    box(shaft.x0, 0, shaft.z0 - T, shaft.x1, TOP, shaft.z0);
    box(shaft.x0, 0, shaft.z1, opening.x0, TOP, shaft.z1 + T);
    box(opening.x0, opening.height, shaft.z1, shaft.x1, TOP, shaft.z1 + T);
    // The hall.
    box(hall.x0 - T, 0, hall.z0, hall.x0, hall.height, hall.z1);
    box(hall.x1, 0, hall.z0, hall.x1 + T, hall.height, hall.z1);
    box(hall.x0, 0, hall.z1, hall.x1, hall.height, hall.z1 + T);
    box(shaft.x1, 0, hall.z0 - T, hall.x1, hall.height, hall.z0);
    // The well, all the way up, but for the lift car's shaft (its gates are the lift's).
    box(well.x0, 0, well.z0, car.x0, TOP, well.z1);
    box(car.x1, 0, well.z0, well.x1, TOP, well.z1);
    box(car.x0, 0, well.z0, car.x1, TOP, car.z0);
    // No flight up from our landing (over flight B's head), no flight down from the hall (under flight A's foot: a cupboard).
    box(flightB.x0, top0, floorLanding.z0 - T, flightB.x1, top0 + 1.1, floorLanding.z0);
    box(flightA.x0, 0, floorLanding.z0 - T, flightA.x1, 2.2, floorLanding.z0);
  }
}

/** Which floor lines the wall from (ax, az) to (bx, bz) stands over: the shaft's four sides, our strip, or the hall's (and the cupboard's) floor. */
function wallProfile(ax: number, az: number, bx: number, bz: number): WallProfile {
  const { shaft, strip } = plan;
  const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-4;
  const inShaftZ = (z: number): boolean => z >= shaft.z0 - 1e-4 && z <= shaft.z1 + 1e-4;
  const inShaftX = (x: number): boolean => x >= shaft.x0 - 1e-4 && x <= shaft.x1 + 1e-4;
  if (near(ax, bx)) {
    if (near(ax, shaft.x0) && inShaftZ(az) && inShaftZ(bz)) return 'west';
    if (near(ax, shaft.x1) && inShaftZ(az) && inShaftZ(bz)) return 'east';
    return near(ax, strip.x0) ? 'strip' : 'hall';
  }
  if (near(az, shaft.z0)) return 'south';
  if (near(az, shaft.z1) && inShaftX(ax) && inShaftX(bx)) return 'north';
  return ax < shaft.x0 - 1e-4 || bx < shaft.x0 - 1e-4 ? 'strip' : 'hall';
}

/**
 * The floor lines under a wall of `profile` at `z`: p + i·STOREY for i = 0 .. n (the floor never below 0). Up the
 * west wall they follow flight A (the half landing, the slope, the floor landing); up the east wall flight B; the
 * north wall stands over the floor landings, the south over the half landings; our strip over our landing alone, the
 * hall over its floor.
 */
function floorLines(profile: WallProfile, z: number): { p: number; n: number } {
  const half = STOREY / 2;
  const { halfLanding, floorLanding } = plan;
  // 0 at the half landing's edge .. 1 at the floor landing's, along a flight.
  const s = THREE.MathUtils.clamp((z - halfLanding.z1) / (floorLanding.z0 - halfLanding.z1), 0, 1) * half;
  switch (profile) {
    case 'west':
      return { p: s - half, n: STOREYS };
    case 'east':
      // Over the floor landings the east wall also stands over ours, which has no flight B up from it.
      return { p: -half - s, n: z > floorLanding.z0 + 1e-4 ? STOREYS + 1 : STOREYS };
    case 'north':
    case 'strip':
      return { p: 0, n: STOREYS };
    case 'south':
      return { p: -half, n: STOREYS };
    case 'hall':
      return { p: 0, n: 0 };
  }
}

/**
 * Every part's uvs in metres, projected along its faces' main axis (the top of a tread or a
 * landing on x/z, a riser on x/y, a side on z/y): one tile size on every step, landing and floor.
 */
function metreUvs(g: THREE.BufferGeometry): void {
  const pos = g.getAttribute('position');
  const normal = g.getAttribute('normal');
  const uv = g.getAttribute('uv');
  if (!pos || !normal || !uv) return;
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(normal.getX(i));
    const ay = Math.abs(normal.getY(i));
    const az = Math.abs(normal.getZ(i));
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if (ay >= ax && ay >= az) uv.setXY(i, x, z);
    else if (ax >= az) uv.setXY(i, z, y);
    else uv.setXY(i, x, y);
  }
  uv.needsUpdate = true;
}

/** Pale stone treads: a speckled terrazzo, a worn darker nosing strip. */
function treadTexture(): THREE.CanvasTexture {
  const size = 256;
  const [canvas, ctx] = createCanvas(size, size);
  ctx.fillStyle = '#d6cfc0';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 2600; i++) {
    const r = Math.random();
    ctx.fillStyle = r < 0.4 ? 'rgba(120,110,95,0.35)' : r < 0.7 ? 'rgba(250,246,238,0.5)' : 'rgba(150,80,60,0.25)';
    const s = 1 + Math.random() * 2.5;
    ctx.fillRect(Math.random() * size, Math.random() * size, s, s);
  }
  const texture = toTexture(canvas, 4);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2); // uvs are metres: a tile every half metre
  return texture;
}

/** The entrance hall's floor: white octagons with small black cabochons between. */
function cabochonTexture(): THREE.CanvasTexture {
  const size = 256;
  const [canvas, ctx] = createCanvas(size, size);
  const cell = size / 4;
  ctx.fillStyle = '#1a1a1c';
  ctx.fillRect(0, 0, size, size);
  const cut = cell * 0.29;
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const x = i * cell;
      const y = j * cell;
      ctx.fillStyle = (i + j) % 2 ? '#ece6da' : '#e6dfd1';
      ctx.beginPath();
      ctx.moveTo(x + cut, y + 1);
      ctx.lineTo(x + cell - cut, y + 1);
      ctx.lineTo(x + cell - 1, y + cut);
      ctx.lineTo(x + cell - 1, y + cell - cut);
      ctx.lineTo(x + cell - cut, y + cell - 1);
      ctx.lineTo(x + cut, y + cell - 1);
      ctx.lineTo(x + 1, y + cell - cut);
      ctx.lineTo(x + 1, y + cut);
      ctx.closePath();
      ctx.fill();
    }
  }
  const texture = toTexture(canvas, 4);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  // uvs are metres: four octagons a metre, the same on the hall and under the last flight.
  return texture;
}
