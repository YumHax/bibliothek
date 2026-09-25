import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { Prop } from '../props/Prop';
import { STAIRWELL_PLAN as plan, STOREY, STOREYS, landingY, type Rect } from './stairwellPlan';

type Finish = 'stone' | 'plaster' | 'iron' | 'wood' | 'hall' | 'tread';

/** How high a step up the feet may take in one go (a stair's riser, with room to spare). */
const STEP_UP = 0.45;
const SLAB = 0.18;
const RAIL_HEIGHT = 0.95;
const BAR = 0.016;
const BAR_SPACING = 0.12;
/** The shaft's walls and our strip's run up to here (the roof over our landing). */
const TOP = landingY(0) + 2.8;

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
  private readonly flightRun = plan.treads * 0.28;
  private readonly half = STOREY / 2;

  constructor() {
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
    this.buildColliders();

    const materials: Record<Finish, THREE.Material> = {
      stone: new THREE.MeshStandardMaterial({ color: 0xcfc8ba, roughness: 0.75 }),
      tread: new THREE.MeshStandardMaterial({ map: treadTexture(), roughness: 0.6 }),
      plaster: new THREE.MeshStandardMaterial({ color: 0xe6dcc6, roughness: 0.95 }),
      iron: new THREE.MeshStandardMaterial({ color: 0x1c1d20, roughness: 0.45, metalness: 0.6 }),
      wood: new THREE.MeshStandardMaterial({ color: 0x4a2c1c, roughness: 0.5 }),
      hall: new THREE.MeshStandardMaterial({ map: cabochonTexture(), roughness: 0.35 }),
    };
    for (const [finish, geometries] of this.parts) {
      const mesh = new THREE.Mesh(mergeGeometries(geometries)!, materials[finish]);
      for (const g of geometries) g.dispose();
      mesh.receiveShadow = true;
      mesh.castShadow = finish !== 'plaster';
      this.add(mesh);
    }
    for (const [finish, material] of Object.entries(materials)) if (!this.parts.has(finish as Finish)) material.dispose();
  }

  /**
   * The height (local) of the floor under (x, z) for feet at `feet` (local): of every landing,
   * flight and floor there, the highest no more than a step above the feet. Null where the
   * stairwell has no floor (anywhere else in the world).
   */
  floorAt(x: number, z: number, feet: number): number | null {
    let best = -Infinity;
    let lowest = Infinity;
    const offer = (h: number): void => {
      lowest = Math.min(lowest, h);
      if (h <= feet + STEP_UP && h > best) best = h;
    };
    const { shaft, floorLanding, halfLanding, flightA, flightB, strip, hall } = plan;
    if (inside(strip, x, z)) offer(landingY(0));
    if (inside(hall, x, z)) offer(0);
    if (x >= shaft.x0 && x <= shaft.x1) {
      if (z >= floorLanding.z0 && z <= floorLanding.z1) for (let k = 0; k <= STOREYS; k++) offer(landingY(k));
      if (z >= halfLanding.z0 && z <= halfLanding.z1) for (let k = 0; k < STOREYS; k++) offer(landingY(k) - this.half);
      if (z > halfLanding.z1 && z < floorLanding.z0) {
        // Down flight A going south from the floor landing; down flight B going north from the half landing.
        const alongA = (floorLanding.z0 - z) / this.flightRun;
        const alongB = (z - halfLanding.z1) / this.flightRun;
        for (let k = 0; k < STOREYS; k++) {
          if (x >= flightA.x0 && x <= flightA.x1) offer(landingY(k) - this.half * alongA);
          if (x >= flightB.x0 && x <= flightB.x1) offer(landingY(k) - this.half - this.half * alongB);
        }
      }
    }
    if (lowest === Infinity) return null;
    return best === -Infinity ? lowest : best;
  }

  private put(finish: Finish, geometry: THREE.BufferGeometry): void {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (g !== geometry) geometry.dispose();
    const list = this.parts.get(finish) ?? [];
    list.push(g);
    this.parts.set(finish, list);
  }

  /** A box from (x0, y0, z0) to (x1, y1, z1). */
  private box(finish: Finish, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
    this.put(finish, new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2));
  }

  /** A wall face from (ax, az) to (bx, bz), y0 to y1, facing the left-hand normal (-dz, dx); uvs in metres. */
  private wall(finish: Finish, ax: number, az: number, bx: number, bz: number, y0: number, y1: number): void {
    const length = Math.hypot(bx - ax, bz - az);
    const g = new THREE.PlaneGeometry(length, y1 - y0);
    // A plane faces +z; turn it to face (-dz, dx).
    g.rotateY(Math.atan2(-(bz - az), bx - ax));
    g.translate((ax + bx) / 2, (y0 + y1) / 2, (az + bz) / 2);
    this.put(finish, g);
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
    this.wall('plaster', shaft.x0, shaft.z1, shaft.x0, strip.z0, 0, top0);
    this.wall('plaster', shaft.x0, shaft.z1, shaft.x0, strip.z0, top0 + strip.ceiling, TOP);
    this.wall('plaster', shaft.x0, strip.z0, shaft.x0, shaft.z0, 0, TOP);
    this.wall('plaster', shaft.x1, shaft.z0, shaft.x1, shaft.z1, 0, TOP);
    this.wall('plaster', shaft.x0, shaft.z0, shaft.x1, shaft.z0, 0, TOP);
    this.wall('plaster', shaft.x1, shaft.z1, opening.x0, shaft.z1, opening.height, TOP);
    this.wall('plaster', opening.x0, shaft.z1, shaft.x0, shaft.z1, 0, TOP);
    // The roof over the shaft (the lights lay a skylight on it), the stone floor at its foot.
    this.flat('plaster', shaft, TOP, true);
    this.flat('stone', { x0: shaft.x0, x1: shaft.x1, z0: shaft.z0, z1: floorLanding.z0 }, 0);
    // The cupboard under flight A's foot, off the hall's landing.
    this.wall('plaster', flightA.x0, floorLanding.z0, flightA.x1, floorLanding.z0, 0, 2.2);
    // Our strip: floor, ceiling, its two long walls, and its west end round the flat's front door.
    this.flat('tread', strip, top0);
    this.flat('plaster', strip, top0 + strip.ceiling, true);
    this.wall('plaster', strip.x1, strip.z1, strip.x0, strip.z1, top0, top0 + strip.ceiling);
    this.wall('plaster', strip.x0, strip.z0, strip.x1, strip.z0, top0, top0 + strip.ceiling);
    const d0 = frontDoor.z - frontDoor.width / 2 - 0.07;
    const d1 = frontDoor.z + frontDoor.width / 2 + 0.07;
    this.wall('plaster', strip.x0, strip.z1, strip.x0, d1, top0, top0 + strip.ceiling);
    this.wall('plaster', strip.x0, d0, strip.x0, strip.z0, top0, top0 + strip.ceiling);
    this.wall('plaster', strip.x0, d1, strip.x0, d0, top0 + frontDoor.height + 0.07, top0 + strip.ceiling);
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
    this.box('stone', r.x0, y - SLAB, r.z0, r.x1, y - 0.001, r.z1);
  }

  private buildHalfLanding(k: number): void {
    const y = landingY(k) - this.half;
    const { shaft, halfLanding } = plan;
    const r: Rect = { x0: shaft.x0, x1: shaft.x1, z0: halfLanding.z0, z1: halfLanding.z1 };
    this.flat('tread', r, y);
    this.box('stone', r.x0, y - SLAB, r.z0, r.x1, y - 0.001, r.z1);
  }

  /** Nine steps from the floor landing down to the half landing (A, south), or from there to the next floor (B, north); the stone soffit under them. */
  private buildFlight(k: number, which: 'A' | 'B'): void {
    const { floorLanding, halfLanding, treads } = plan;
    const lane = which === 'A' ? plan.flightA : plan.flightB;
    const rise = this.half / treads;
    const depth = this.flightRun / treads;
    const top = which === 'A' ? landingY(k) : landingY(k) - this.half;
    for (let i = 1; i <= treads; i++) {
      const y = top - i * rise;
      // Flight A runs south (-z) from the floor landing; flight B north (+z) from the half landing.
      const z0 = which === 'A' ? floorLanding.z0 - i * depth : halfLanding.z1 + (i - 1) * depth;
      const z1 = z0 + depth;
      if (i < treads) this.box('tread', lane.x0, y - rise - 0.02, z0, lane.x1, y, z1);
    }
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
      this.put('iron', new THREE.BoxGeometry(BAR, RAIL_HEIGHT, BAR).translate(x, y + RAIL_HEIGHT / 2, z));
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
    this.wall('plaster', hall.x0, hall.z1, hall.x0, hall.z0, 0, hall.height);
    this.wall('plaster', hall.x1, hall.z0, hall.x1, hall.z1, 0, hall.height);
    this.wall('plaster', hall.x1, hall.z1, hall.x0, hall.z1, 0, hall.height);
    this.wall('plaster', shaft.x1, hall.z0, hall.x1, hall.z0, 0, hall.height);
    // A marble dado round the hall, knee high.
    this.box('stone', hall.x0, 0, hall.z0, hall.x0 + 0.02, 1.0, hall.z1);
    this.box('stone', hall.x1 - 0.02, 0, hall.z0, hall.x1, 1.0, hall.z1);
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
  texture.repeat.set(3, 6);
  return texture;
}
