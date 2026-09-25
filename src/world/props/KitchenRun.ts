import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { cylinderMesh } from '../meshUtils';
import { part, matte } from './Prop';
import { SwingLeaf, revealWhileOpen } from './SwingLeaf';
import { SlideDrawer } from './SlideDrawer';
import { DropDoor } from './DropDoor';

/**
 * One cabinet of a run, left to right as seen from the room. `doors`: one door under 0.5 m, two
 * above; `drawers`: a stack of three; `sink`: a steel basin let into the worktop with its tap,
 * a door below; `oven`: the hob on top and the oven built in below; `blank`: a plain panel (the
 * dead corner of an L, hidden behind the other run).
 */
export interface KitchenUnit {
  kind: 'doors' | 'drawers' | 'sink' | 'oven' | 'blank';
  width: number;
  /** The side a single door is hung on (a pair always hangs on its outer edges). Default 'left'. */
  hinge?: 'left' | 'right';
}

export interface KitchenRunOptions {
  units: KitchenUnit[];
  /** Colour of the doors and drawer fronts. Default sage. */
  front?: number;
  /** Worktop colour. Default oiled oak. */
  worktop?: number;
  /** Height of the tiled splashback above the worktop (0 for none). Default 0.55, up to the wall cabinets. */
  splashback?: number;
}

/** Standard fitted-kitchen dimensions: 0.9 m worktop, 0.6 m deep, on a recessed plinth. */
export const WORKTOP_HEIGHT = 0.9;
export const RUN_DEPTH = 0.6;
const WORKTOP_THICKNESS = 0.04;
/** The worktop overhangs the doors by this much. */
const OVERHANG = 0.02;
const PLINTH_HEIGHT = 0.1;
const PLINTH_RECESS = 0.05;
const DOOR_THICKNESS = 0.018;
/** Gap between two fronts, and between a front and its neighbour unit. */
const GAP = 0.003;
const HANDLE_LENGTH = 0.16;
const HANDLE_RADIUS = 0.005;
const SPLASHBACK_THICKNESS = 0.012;
/** Inside size and depth of the sink basin. */
const BASIN = { width: 0.44, depth: 0.36, height: 0.18 };
const HOB = { width: 0.58, depth: 0.5 };

const CARCASS = matte(0xe9e4da, 0.8);
const PLINTH = matte(0x2e2e30, 0.7);
const TILE = matte(0xf1ede4, 0.3);
const STEEL = new THREE.MeshStandardMaterial({ color: 0xbfc2c6, metalness: 0.7, roughness: 0.35 });
const DARK_STEEL = new THREE.MeshStandardMaterial({ color: 0x6f7378, metalness: 0.7, roughness: 0.4 });
const HOB_GLASS = new THREE.MeshStandardMaterial({ color: 0x0f1013, metalness: 0.3, roughness: 0.12 });
const HOB_RING = matte(0x3a3b40, 0.5);
const OVEN_GLASS = new THREE.MeshStandardMaterial({ color: 0x15171a, metalness: 0.2, roughness: 0.15 });
const OVEN_FASCIA = matte(0x2a2c30, 0.5);
const OVEN_ENAMEL = matte(0x1d1e22, 0.35);
/** The oven's lamp, lit while its door is open: an emissive lens, not a light. */
const OVEN_LAMP = new THREE.MeshStandardMaterial({ color: 0xfff1d0, emissive: 0xffd28a, emissiveIntensity: 1.2 });
/** Thickness of the carcass boards (back, bottom, the sides between units). */
const CARCASS_WALL = 0.016;
/** Base doors open square to the run: past 90° a leaf would sweep into the next unit's front. */
const BASE_DOOR_ANGLE = Math.PI / 2;
/** A drawer's box, front to back, and how far it pulls out. */
const DRAWER_DEPTH = 0.46;
const DRAWER_TRAVEL = 0.36;

/**
 * A run of fitted base cabinets under one continuous worktop: plinth, carcass, painted doors and
 * drawer fronts with steel bar handles, and per unit a sink with its tap or a hob over an oven. A
 * tiled splashback rises behind it. Wall-hung with `y: 0`: origin on the floor at the wall, +z
 * into the room, units laid out left to right along +x. Collides as one block up to the worktop.
 * An L-shaped kitchen is two runs; the one whose corner is hidden gets a `blank` unit there.
 * Every door, drawer and the oven door opens on a click (`leaves`, placed by the builder with
 * `placeLeaves`): the carcass is an open box per unit, and what is inside a unit (pans, the
 * sink's trap and cleaning things, cutlery, the oven's rack) is only drawn while it is open.
 * The fronts never collide, open or shut: the run's block stops the player before them.
 */
export class KitchenRun extends THREE.Group implements Furniture {
  readonly footprint: THREE.Box3;
  /** Total length along the wall. */
  readonly width: number;
  /** The doors, drawers and oven door, left to right. */
  readonly leaves: (SwingLeaf | SlideDrawer | DropDoor)[] = [];

  constructor(options: KitchenRunOptions) {
    super();
    this.name = 'KitchenRun';
    const front = matte(options.front ?? 0x8d9c85, 0.65);
    const worktop = matte(options.worktop ?? 0x9a7248, 0.5);
    const width = options.units.reduce((sum, u) => sum + u.width, 0);
    this.width = width;

    // Plinth; then the carcass as open boxes: one back and one bottom board over the whole
    // length, a side board at every unit boundary. The fronts close them.
    const carcassH = WORKTOP_HEIGHT - WORKTOP_THICKNESS - PLINTH_HEIGHT;
    const doorZ = RUN_DEPTH - OVERHANG;
    const innerD = doorZ - DOOR_THICKNESS;
    part(this, width, PLINTH_HEIGHT, doorZ - PLINTH_RECESS, PLINTH, { y: PLINTH_HEIGHT / 2, z: (doorZ - PLINTH_RECESS) / 2 });
    part(this, width, carcassH, CARCASS_WALL, CARCASS, { y: PLINTH_HEIGHT + carcassH / 2, z: CARCASS_WALL / 2 });
    part(this, width, CARCASS_WALL, innerD, CARCASS, { y: PLINTH_HEIGHT + CARCASS_WALL / 2, z: innerD / 2 });

    // Doors and drawer fronts unit by unit; the worktop is laid per unit too so the sink can be a real hole.
    const topY = WORKTOP_HEIGHT - WORKTOP_THICKNESS / 2;
    let x = -width / 2;
    for (const unit of options.units) {
      const cx = x + unit.width / 2;
      part(this, CARCASS_WALL, carcassH, innerD, CARCASS, { x: x + CARCASS_WALL / 2, y: PLINTH_HEIGHT + carcassH / 2, z: innerD / 2 }).castShadow = false;
      if (unit.kind === 'sink') this.buildSinkTop(cx, unit.width, worktop);
      else part(this, unit.width, WORKTOP_THICKNESS, RUN_DEPTH, worktop, { x: cx, y: topY, z: RUN_DEPTH / 2 });
      const frontBottom = PLINTH_HEIGHT;
      const frontTop = WORKTOP_HEIGHT - WORKTOP_THICKNESS;
      switch (unit.kind) {
        case 'doors':
        case 'sink':
          this.buildDoors(cx, unit, frontBottom, frontTop, front, doorZ);
          break;
        case 'drawers':
          this.buildDrawers(cx, unit.width, frontBottom, frontTop, front, doorZ);
          break;
        case 'oven':
          this.buildOven(cx, unit.width, frontBottom, frontTop, doorZ);
          this.buildHob(cx);
          break;
        case 'blank':
          part(this, unit.width - 2 * GAP, frontTop - frontBottom - 2 * GAP, DOOR_THICKNESS, front, { x: cx, y: (frontBottom + frontTop) / 2, z: doorZ - DOOR_THICKNESS / 2 });
          break;
      }
      x += unit.width;
    }
    part(this, CARCASS_WALL, carcassH, innerD, CARCASS, { x: width / 2 - CARCASS_WALL / 2, y: PLINTH_HEIGHT + carcassH / 2, z: innerD / 2 }).castShadow = false;

    const splash = options.splashback ?? 0.55;
    if (splash > 0) this.buildSplashback(width, splash);

    this.footprint = new THREE.Box3(new THREE.Vector3(-width / 2, 0, 0), new THREE.Vector3(width / 2, WORKTOP_HEIGHT, RUN_DEPTH));
  }

  /**
   * One or two doors filling the unit (a pair hung on its outer edges, a single one on
   * `unit.hinge`), a horizontal bar handle at the top near the free edge; behind them what the
   * cupboard holds, drawn while a door is ajar.
   */
  private buildDoors(cx: number, unit: KitchenUnit, bottom: number, top: number, front: THREE.Material, doorZ: number): void {
    const count = unit.width > 0.5 ? 2 : 1;
    const w = unit.width / count - 2 * GAP;
    const h = top - bottom - 2 * GAP;
    const interior = new THREE.Group();
    this.add(interior);
    if (unit.kind === 'sink') this.fillUnderSink(interior, cx, unit.width, bottom, doorZ - DOOR_THICKNESS);
    else this.fillCupboard(interior, cx, unit.width, bottom, top, doorZ - DOOR_THICKNESS);
    const reveal = revealWhileOpen(interior, count);
    for (let i = 0; i < count; i++) {
      const hinge = count === 1 ? (unit.hinge ?? 'left') : i === 0 ? 'left' : 'right';
      const leaf = new SwingLeaf({ width: w, height: h, thickness: DOOR_THICKNESS, hinge, noun: 'cupboard', maxAngle: BASE_DOOR_ANGLE, onOpenness: reveal(i) });
      part(leaf.panel, w, h, DOOR_THICKNESS, front, { x: leaf.edge(w / 2), y: h / 2, z: DOOR_THICKNESS / 2 });
      this.buildHandle(leaf.panel, leaf.edge(w - 0.12), h - 0.06 + GAP, DOOR_THICKNESS);
      const left = cx - unit.width / 2 + i * (unit.width / count) + GAP;
      leaf.position.set(hinge === 'left' ? left : left + w, bottom + GAP, doorZ - DOOR_THICKNESS);
      this.leaves.push(leaf);
    }
  }

  /** Three drawers, the top one shallower, each front with its own handle and a box of things behind it. */
  private buildDrawers(cx: number, width: number, bottom: number, top: number, front: THREE.Material, doorZ: number): void {
    const total = top - bottom;
    const heights = [0.18, 0.28, total - 0.46].map((h) => h - 2 * GAP);
    const w = width - 2 * GAP;
    let y = top;
    heights.forEach((h, i) => {
      const drawer = new SlideDrawer({ width: w, height: h, travel: DRAWER_TRAVEL, seconds: 0.45 });
      part(drawer.front, w, h, DOOR_THICKNESS, front, { y: h / 2, z: DOOR_THICKNESS / 2 });
      this.buildHandle(drawer.front, 0, h / 2, DOOR_THICKNESS);
      this.fillDrawer(drawer.inside, i, w, h);
      drawer.position.set(cx, y - GAP - h, doorZ - DOOR_THICKNESS);
      this.leaves.push(drawer);
      y -= h + 2 * GAP;
    });
  }

  /** A steel bar handle on two short posts, horizontal, centred at (x, y) on a front whose face is at `faceZ`. */
  private buildHandle(parent: THREE.Object3D, x: number, y: number, faceZ: number): void {
    const bar = cylinderMesh(HANDLE_RADIUS, HANDLE_LENGTH, STEEL, { x, y, z: faceZ + 0.03 }, { segments: 10 });
    bar.rotation.z = Math.PI / 2;
    bar.castShadow = false;
    parent.add(bar);
    for (const dx of [-HANDLE_LENGTH / 2 + 0.015, HANDLE_LENGTH / 2 - 0.015]) {
      const post = cylinderMesh(0.004, 0.03, STEEL, { x: x + dx, y, z: faceZ + 0.015 }, { segments: 8 });
      post.rotation.x = Math.PI / 2;
      post.castShadow = false;
      parent.add(post);
    }
  }

  /** A cupboard: a shelf halfway up, saucepans and a colander below, tins and a mixing bowl on the shelf. */
  private fillCupboard(interior: THREE.Group, cx: number, width: number, bottom: number, top: number, depth: number): void {
    const inner = width - 2 * CARCASS_WALL;
    const floor = bottom + CARCASS_WALL;
    const shelfY = (bottom + top) / 2;
    const z = CARCASS_WALL + (depth - CARCASS_WALL) / 2;
    part(interior, inner, 0.016, depth - CARCASS_WALL - 0.02, CARCASS, { x: cx, y: shelfY, z }).castShadow = false;
    // Two pans nested by size, a lid on the bigger one, a steel colander.
    const pan = Math.min(0.11, inner / 4);
    interior.add(cylinderMesh(pan, 0.12, DARK_STEEL, { x: cx - inner / 4, y: floor + 0.06, z }, { segments: 20 }));
    interior.add(cylinderMesh(pan * 1.02, 0.01, STEEL, { x: cx - inner / 4, y: floor + 0.125, z }, { segments: 20 }));
    interior.add(cylinderMesh(pan * 0.8, 0.09, matte(0xb5452f, 0.4), { x: cx + inner / 4, y: floor + 0.045, z: z + 0.05 }, { segments: 18 }));
    // On the shelf: tins in a row and a bowl.
    const tins = [0xc0392b, 0x2f6fb3, 0xe8b64a];
    tins.forEach((colour, i) => interior.add(cylinderMesh(0.037, 0.11, matte(colour, 0.4), { x: cx - inner / 2 + 0.05 + i * 0.08, y: shelfY + 0.063, z: z - 0.08 }, { segments: 14 })));
    interior.add(cylinderMesh(0.09, 0.08, matte(0xe9e2d0, 0.3), { x: cx + inner / 2 - 0.1, y: shelfY + 0.048, z: z + 0.05 }, { radiusBottom: 0.05, segments: 18 }));
  }

  /** Under the sink: the waste trap from the basin's drain back into the wall, a bucket and the cleaning bottles. */
  private fillUnderSink(interior: THREE.Group, cx: number, width: number, bottom: number, depth: number): void {
    const floor = bottom + CARCASS_WALL;
    const drainZ = 0.14 + BASIN.depth / 2;
    const basinFloor = WORKTOP_HEIGHT - BASIN.height;
    const pipe = matte(0xd9d9d4, 0.5);
    interior.add(cylinderMesh(0.02, 0.14, pipe, { x: cx, y: basinFloor - 0.07, z: drainZ }, { segments: 12 }));
    interior.add(cylinderMesh(0.035, 0.1, pipe, { x: cx, y: basinFloor - 0.19, z: drainZ }, { segments: 14 }));
    const run = cylinderMesh(0.02, drainZ, pipe, { x: cx, y: basinFloor - 0.2, z: drainZ / 2 }, { segments: 12 });
    run.rotation.x = Math.PI / 2;
    interior.add(run);
    // Supply hoses to the tap, one blue one red.
    for (const [dx, colour] of [
      [-0.03, 0x2f6fb3],
      [0.03, 0xc0392b],
    ] as const) {
      interior.add(cylinderMesh(0.005, 0.3, matte(colour, 0.5), { x: cx + dx, y: WORKTOP_HEIGHT - 0.2, z: 0.05 }, { segments: 6 }));
    }
    const inner = width - 2 * CARCASS_WALL;
    interior.add(cylinderMesh(0.11, 0.22, matte(0x3f8fb0, 0.5), { x: cx - inner / 2 + 0.13, y: floor + 0.11, z: depth - 0.16 }, { radiusBottom: 0.09, segments: 18 }));
    const bottles: [number, number, number][] = [
      [0.1, 0xf2c230, 0.24],
      [0.17, 0x3aa56b, 0.2],
      [0.23, 0xe8e8e8, 0.26],
    ];
    for (const [dx, colour, tall] of bottles) interior.add(cylinderMesh(0.03, tall, matte(colour, 0.35), { x: cx + dx, y: floor + tall / 2, z: depth - 0.12 }, { segments: 12 }));
  }

  /** What a drawer holds, by its place in the stack: cutlery, tea towels, tubs and a roll of foil. */
  private fillDrawer(box: THREE.Group, index: number, width: number, height: number): void {
    const inner = width - 0.04;
    const boxH = height - 0.04;
    const depth = DRAWER_DEPTH;
    const z = -depth / 2;
    // The box: two sides, a back and a floor behind the front.
    for (const side of [-1, 1]) part(box, 0.012, boxH, depth, CARCASS, { x: side * (inner / 2 - 0.006), y: 0.02 + boxH / 2, z }).castShadow = false;
    part(box, inner, boxH, 0.012, CARCASS, { y: 0.02 + boxH / 2, z: -depth + 0.006 }).castShadow = false;
    part(box, inner, 0.01, depth, CARCASS, { y: 0.025, z }).castShadow = false;
    const floor = 0.03;
    if (index === 0) {
      // A cutlery tray: four compartments, forks, knives and spoons lying in them.
      part(box, inner - 0.03, 0.005, depth - 0.04, matte(0x6e5a44, 0.8), { y: floor + 0.0025, z }).castShadow = false;
      const lanes = 4;
      for (let i = 1; i < lanes; i++) part(box, 0.006, 0.04, depth - 0.06, matte(0x6e5a44, 0.8), { x: -inner / 2 + 0.015 + (i * (inner - 0.03)) / lanes, y: floor + 0.02, z }).castShadow = false;
      for (let i = 0; i < lanes; i++) {
        const lx = -inner / 2 + 0.015 + ((i + 0.5) * (inner - 0.03)) / lanes;
        for (let k = 0; k < 3; k++) part(box, 0.018, 0.004, 0.19, STEEL, { x: lx + (k - 1) * 0.012, y: floor + 0.008 + k * 0.004, z: z + 0.02 }).castShadow = false;
      }
    } else if (index === 1) {
      // Folded tea towels in two piles.
      const towels = [0xd9d2c3, 0x9fb7c9, 0xc9785a, 0xe8e2d4];
      towels.forEach((colour, i) => part(box, inner / 2 - 0.03, 0.03, 0.22, matte(colour, 0.95), { x: (i % 2 ? 1 : -1) * (inner / 4), y: floor + 0.015 + Math.floor(i / 2) * 0.03, z: z + 0.06 }));
    } else {
      // Food tubs with coloured lids and a roll of foil.
      for (let i = 0; i < 2; i++) {
        part(box, 0.14, 0.09, 0.14, matte(0xf1f1ee, 0.3), { x: -inner / 2 + 0.09 + i * 0.16, y: floor + 0.045, z: z + 0.08 });
        part(box, 0.145, 0.012, 0.145, matte(i ? 0x3aa56b : 0x2f6fb3, 0.4), { x: -inner / 2 + 0.09 + i * 0.16, y: floor + 0.096, z: z + 0.08 });
      }
      const foil = cylinderMesh(0.022, Math.min(0.3, inner - 0.04), matte(0xa0a4a8, 0.3), { y: floor + 0.022, z: z - 0.12 }, { segments: 12 });
      foil.rotation.z = Math.PI / 2;
      box.add(foil);
    }
  }

  /**
   * The worktop of the sink unit in four slabs round a hole, the steel basin hanging in it (floor
   * and four walls, open at the top) and a swan-neck mixer tap standing behind it.
   */
  private buildSinkTop(cx: number, width: number, worktop: THREE.Material): void {
    const topY = WORKTOP_HEIGHT - WORKTOP_THICKNESS / 2;
    const holeZ = 0.14 + BASIN.depth / 2; // the basin sits nearer the back of the worktop, the tap clear of a window's kick rail
    const sideW = (width - BASIN.width) / 2;
    part(this, sideW, WORKTOP_THICKNESS, RUN_DEPTH, worktop, { x: cx - width / 2 + sideW / 2, y: topY, z: RUN_DEPTH / 2 });
    part(this, sideW, WORKTOP_THICKNESS, RUN_DEPTH, worktop, { x: cx + width / 2 - sideW / 2, y: topY, z: RUN_DEPTH / 2 });
    const backD = holeZ - BASIN.depth / 2;
    const frontD = RUN_DEPTH - holeZ - BASIN.depth / 2;
    part(this, BASIN.width, WORKTOP_THICKNESS, backD, worktop, { x: cx, y: topY, z: backD / 2 });
    part(this, BASIN.width, WORKTOP_THICKNESS, frontD, worktop, { x: cx, y: topY, z: RUN_DEPTH - frontD / 2 });

    // The basin: a thin steel rim over the joint, then walls and a floor with a drain.
    const rimY = WORKTOP_HEIGHT + 0.003;
    const t = 0.006;
    const rim = 0.025;
    const wallH = BASIN.height;
    const wallY = WORKTOP_HEIGHT - wallH / 2;
    part(this, BASIN.width + 2 * rim, t, rim, STEEL, { x: cx, y: rimY, z: holeZ - BASIN.depth / 2 - rim / 2 });
    part(this, BASIN.width + 2 * rim, t, rim, STEEL, { x: cx, y: rimY, z: holeZ + BASIN.depth / 2 + rim / 2 });
    part(this, rim, t, BASIN.depth, STEEL, { x: cx - BASIN.width / 2 - rim / 2, y: rimY, z: holeZ });
    part(this, rim, t, BASIN.depth, STEEL, { x: cx + BASIN.width / 2 + rim / 2, y: rimY, z: holeZ });
    part(this, t, wallH, BASIN.depth, DARK_STEEL, { x: cx - BASIN.width / 2 + t / 2, y: wallY, z: holeZ });
    part(this, t, wallH, BASIN.depth, DARK_STEEL, { x: cx + BASIN.width / 2 - t / 2, y: wallY, z: holeZ });
    part(this, BASIN.width, wallH, t, DARK_STEEL, { x: cx, y: wallY, z: holeZ - BASIN.depth / 2 + t / 2 });
    part(this, BASIN.width, wallH, t, DARK_STEEL, { x: cx, y: wallY, z: holeZ + BASIN.depth / 2 - t / 2 });
    part(this, BASIN.width, t, BASIN.depth, DARK_STEEL, { x: cx, y: WORKTOP_HEIGHT - wallH + t / 2, z: holeZ });
    const drain = cylinderMesh(0.02, 0.004, matte(0x2a2c2f, 0.4), { x: cx, y: WORKTOP_HEIGHT - wallH + t + 0.002, z: holeZ }, { segments: 16 });
    drain.castShadow = false;
    this.add(drain);

    // The mixer: a riser behind the basin, an arched spout reaching over it, one lever on top.
    const tapZ = holeZ - BASIN.depth / 2 - 0.06;
    const riserH = 0.22;
    this.add(cylinderMesh(0.018, 0.008, STEEL, { x: cx, y: WORKTOP_HEIGHT + 0.004, z: tapZ }, { segments: 16 }));
    this.add(cylinderMesh(0.011, riserH, STEEL, { x: cx, y: WORKTOP_HEIGHT + riserH / 2, z: tapZ }, { segments: 12 }));
    const arch = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.009, 8, 20, Math.PI), STEEL);
    arch.position.set(cx, WORKTOP_HEIGHT + riserH, tapZ + 0.11);
    arch.rotation.y = -Math.PI / 2;
    arch.castShadow = true;
    this.add(arch);
    this.add(cylinderMesh(0.009, 0.05, STEEL, { x: cx, y: WORKTOP_HEIGHT + riserH - 0.025, z: tapZ + 0.22 }, { segments: 10 }));
    const lever = cylinderMesh(0.006, 0.09, STEEL, { x: cx + 0.04, y: WORKTOP_HEIGHT + riserH + 0.02, z: tapZ }, { segments: 8 });
    lever.rotation.z = Math.PI / 2 - 0.35;
    this.add(lever);
  }

  /** A black glass hob on the worktop with four burner rings and a row of touch marks at the front. */
  private buildHob(cx: number): void {
    const z = RUN_DEPTH / 2 - 0.02;
    const y = WORKTOP_HEIGHT + 0.004;
    part(this, HOB.width, 0.008, HOB.depth, HOB_GLASS, { x: cx, y, z }).castShadow = false;
    const rings: [number, number, number][] = [
      [-0.15, -0.12, 0.09],
      [0.15, -0.12, 0.07],
      [-0.15, 0.1, 0.07],
      [0.15, 0.1, 0.1],
    ];
    for (const [dx, dz, r] of rings) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.006, r, 32), HOB_RING);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(cx + dx, y + 0.0045, z + dz);
      this.add(ring);
      const inner = new THREE.Mesh(new THREE.RingGeometry(r * 0.45, r * 0.45 + 0.004, 24), HOB_RING);
      inner.rotation.x = -Math.PI / 2;
      inner.position.set(cx + dx, y + 0.0045, z + dz);
      this.add(inner);
    }
    for (let i = 0; i < 5; i++) {
      const mark = new THREE.Mesh(new THREE.CircleGeometry(0.006, 12), HOB_RING);
      mark.rotation.x = -Math.PI / 2;
      mark.position.set(cx - 0.08 + i * 0.04, y + 0.0045, z + HOB.depth / 2 - 0.03);
      this.add(mark);
    }
  }

  /**
   * The built-in oven: a dark fascia with two knobs and a display over a glass door with a long bar
   * handle, which drops open onto the enamel cavity (lamp, a rack, a roasting tin); a drawer of trays below.
   */
  private buildOven(cx: number, width: number, bottom: number, top: number, doorZ: number): void {
    const fasciaH = 0.1;
    const w = width - 2 * GAP;
    const z = doorZ - DOOR_THICKNESS / 2;
    part(this, w, fasciaH, DOOR_THICKNESS, OVEN_FASCIA, { x: cx, y: top - GAP - fasciaH / 2, z });
    for (const dx of [-0.2, 0.2]) {
      const knob = cylinderMesh(0.014, 0.02, STEEL, { x: cx + dx, y: top - GAP - fasciaH / 2, z: doorZ + 0.01 }, { segments: 14 });
      knob.rotation.x = Math.PI / 2;
      this.add(knob);
    }
    const display = part(this, 0.1, 0.02, 0.002, new THREE.MeshStandardMaterial({ color: 0x101214, emissive: 0xff7a1a, emissiveIntensity: 0.9 }), { x: cx, y: top - GAP - fasciaH / 2, z: doorZ + 0.001 });
    display.castShadow = false;

    // The door: steel frame, glass in the middle, the bar handle along its top; it drops open about its bottom edge.
    const doorH = 0.6;
    const doorBottom = top - GAP - fasciaH - doorH;
    const interior = new THREE.Group();
    this.add(interior);
    this.buildOvenCavity(interior, cx, w, doorBottom, doorBottom + doorH, doorZ - DOOR_THICKNESS);
    const reveal = revealWhileOpen(interior, 1);
    const door = new DropDoor({ width: w, height: doorH, thickness: DOOR_THICKNESS, noun: 'oven', onOpenness: reveal(0) });
    const { panel } = door;
    part(panel, w, doorH, DOOR_THICKNESS, STEEL, { y: doorH / 2, z: DOOR_THICKNESS / 2 });
    part(panel, w - 0.1, doorH - 0.12, 0.002, OVEN_GLASS, { y: doorH / 2, z: DOOR_THICKNESS + 0.001 }).castShadow = false;
    part(panel, w - 0.1, doorH - 0.12, 0.002, OVEN_GLASS, { y: doorH / 2, z: -0.001 }).castShadow = false;
    const bar = cylinderMesh(0.008, w - 0.1, STEEL, { y: doorH - 0.03, z: DOOR_THICKNESS + 0.04 }, { segments: 10 });
    bar.rotation.z = Math.PI / 2;
    panel.add(bar);
    for (const dx of [-(w / 2 - 0.07), w / 2 - 0.07]) {
      const post = cylinderMesh(0.006, 0.04, STEEL, { x: dx, y: doorH - 0.03, z: DOOR_THICKNESS + 0.02 }, { segments: 8 });
      post.rotation.x = Math.PI / 2;
      panel.add(post);
    }
    door.position.set(cx, doorBottom, doorZ - DOOR_THICKNESS);
    this.leaves.push(door);

    const drawerTop = doorBottom - GAP;
    part(this, w, drawerTop - bottom - GAP, DOOR_THICKNESS, OVEN_FASCIA, { x: cx, y: (drawerTop + bottom) / 2, z });
  }

  /** The oven's inside: dark enamel walls, the lamp glowing at the back, runners, a wire rack with a roasting tin on it. */
  private buildOvenCavity(interior: THREE.Group, cx: number, width: number, bottom: number, top: number, depth: number): void {
    const w = width - 0.06;
    const h = top - bottom - 0.04;
    const d = depth - 0.06;
    const y = bottom + 0.02 + h / 2;
    const z = depth - d / 2;
    part(interior, w, h, 0.01, OVEN_ENAMEL, { x: cx, y, z: depth - d }).castShadow = false;
    for (const side of [-1, 1]) part(interior, 0.01, h, d, OVEN_ENAMEL, { x: cx + side * (w / 2), y, z }).castShadow = false;
    for (const dy of [-h / 2, h / 2]) part(interior, w, 0.01, d, OVEN_ENAMEL, { x: cx, y: y + dy, z }).castShadow = false;
    part(interior, 0.06, 0.04, 0.004, OVEN_LAMP, { x: cx + w / 2 - 0.06, y: y + h / 2 - 0.05, z: depth - d + 0.008 }).castShadow = false;
    // Runners at three levels on both sides, the rack on the middle pair.
    for (let level = 0; level < 3; level++) {
      const ry = bottom + 0.02 + (h * (level + 1)) / 4;
      for (const side of [-1, 1]) part(interior, 0.012, 0.006, d - 0.02, STEEL, { x: cx + side * (w / 2 - 0.012), y: ry, z }).castShadow = false;
    }
    const rackY = bottom + 0.02 + h / 2 + 0.006;
    for (let i = 0; i < 7; i++) part(interior, 0.004, 0.004, d - 0.04, STEEL, { x: cx - w / 2 + 0.03 + (i * (w - 0.06)) / 6, y: rackY, z }).castShadow = false;
    part(interior, w - 0.03, 0.004, 0.004, STEEL, { x: cx, y: rackY, z: depth - 0.04 }).castShadow = false;
    // A roasting tin with something golden in it.
    part(interior, 0.3, 0.05, 0.22, DARK_STEEL, { x: cx, y: rackY + 0.027, z: z + 0.02 }).castShadow = false;
    const roast = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 10), matte(0xb8742e, 0.6));
    roast.scale.set(1.3, 0.6, 1);
    roast.position.set(cx, rackY + 0.06, z + 0.02);
    interior.add(roast);
  }

  /** White metro tiles behind the worktop: one slab wearing a painted brick-bond tile texture (a short one is a plain upstand). */
  private buildSplashback(width: number, height: number): void {
    const material = height < 0.12 ? TILE : new THREE.MeshStandardMaterial({ map: tileTexture(width, height), roughness: 0.3 });
    part(this, width, height, SPLASHBACK_THICKNESS, material, { y: WORKTOP_HEIGHT + height / 2, z: SPLASHBACK_THICKNESS / 2 }).castShadow = false;
  }
}

/** Metro tiles 0.2 x 0.1 in brick bond over `width` x `height` metres, grout lines between them. */
function tileTexture(width: number, height: number): THREE.CanvasTexture {
  const PX_PER_M = 400;
  const W = Math.round(width * PX_PER_M);
  const H = Math.round(height * PX_PER_M);
  const [canvas, ctx] = createCanvas(W, H);
  ctx.fillStyle = '#d7d1c6';
  ctx.fillRect(0, 0, W, H);
  const tileW = 0.2 * PX_PER_M;
  const tileH = 0.1 * PX_PER_M;
  const joint = 2;
  const rows = Math.ceil(H / tileH);
  for (let r = 0; r < rows; r++) {
    const shift = r % 2 ? tileW / 2 : 0;
    // The top row is drawn first so the pattern starts flush with the worktop, at the bottom.
    const y = H - (r + 1) * tileH;
    for (let x = -tileW + shift; x < W; x += tileW) {
      // A touch of variation per tile so the wall does not read as a flat white sheet.
      const shade = 238 + Math.round(seeded(r * 131 + x) * 10);
      ctx.fillStyle = `rgb(${shade}, ${shade - 3}, ${shade - 9})`;
      ctx.fillRect(x + joint / 2, y + joint / 2, tileW - joint, tileH - joint);
      // Glazed highlight along the top edge of the tile.
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.fillRect(x + joint / 2, y + joint / 2, tileW - joint, 3);
    }
  }
  return toTexture(canvas, 4);
}

/** Deterministic 0..1 noise from an integer, so the tiles look the same every build. */
function seeded(n: number): number {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}
