import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { cylinderMesh } from '../meshUtils';
import { part, matte } from './Prop';

/**
 * One cabinet of a run, left to right as seen from the room. `doors`: one door under 0.5 m, two
 * above; `drawers`: a stack of three; `sink`: a steel basin let into the worktop with its tap,
 * a door below; `oven`: the hob on top and the oven built in below; `blank`: a plain panel (the
 * dead corner of an L, hidden behind the other run).
 */
export interface KitchenUnit {
  kind: 'doors' | 'drawers' | 'sink' | 'oven' | 'blank';
  width: number;
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

/**
 * A run of fitted base cabinets under one continuous worktop: plinth, carcass, painted doors and
 * drawer fronts with steel bar handles, and per unit a sink with its tap or a hob over an oven. A
 * tiled splashback rises behind it. Wall-hung with `y: 0`: origin on the floor at the wall, +z
 * into the room, units laid out left to right along +x. Collides as one block up to the worktop.
 * An L-shaped kitchen is two runs; the one whose corner is hidden gets a `blank` unit there.
 */
export class KitchenRun extends THREE.Group implements Furniture {
  readonly footprint: THREE.Box3;
  /** Total length along the wall. */
  readonly width: number;

  constructor(options: KitchenRunOptions) {
    super();
    this.name = 'KitchenRun';
    const front = matte(options.front ?? 0x8d9c85, 0.65);
    const worktop = matte(options.worktop ?? 0x9a7248, 0.5);
    const width = options.units.reduce((sum, u) => sum + u.width, 0);
    this.width = width;

    // Plinth, carcass, worktop: one box each over the whole length.
    const carcassH = WORKTOP_HEIGHT - WORKTOP_THICKNESS - PLINTH_HEIGHT;
    const doorZ = RUN_DEPTH - OVERHANG;
    part(this, width, PLINTH_HEIGHT, doorZ - PLINTH_RECESS, PLINTH, { y: PLINTH_HEIGHT / 2, z: (doorZ - PLINTH_RECESS) / 2 });
    part(this, width, carcassH, doorZ - DOOR_THICKNESS, CARCASS, { y: PLINTH_HEIGHT + carcassH / 2, z: (doorZ - DOOR_THICKNESS) / 2 });

    // Doors and drawer fronts unit by unit; the worktop is laid per unit too so the sink can be a real hole.
    const topY = WORKTOP_HEIGHT - WORKTOP_THICKNESS / 2;
    let x = -width / 2;
    for (const unit of options.units) {
      const cx = x + unit.width / 2;
      if (unit.kind === 'sink') this.buildSinkTop(cx, unit.width, worktop);
      else part(this, unit.width, WORKTOP_THICKNESS, RUN_DEPTH, worktop, { x: cx, y: topY, z: RUN_DEPTH / 2 });
      const frontBottom = PLINTH_HEIGHT;
      const frontTop = WORKTOP_HEIGHT - WORKTOP_THICKNESS;
      switch (unit.kind) {
        case 'doors':
        case 'sink':
          this.buildDoors(cx, unit.width, frontBottom, frontTop, front, doorZ);
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

    const splash = options.splashback ?? 0.55;
    if (splash > 0) this.buildSplashback(width, splash);

    this.footprint = new THREE.Box3(new THREE.Vector3(-width / 2, 0, 0), new THREE.Vector3(width / 2, WORKTOP_HEIGHT, RUN_DEPTH));
  }

  /** One or two doors filling the unit, a horizontal bar handle at the top of each. */
  private buildDoors(cx: number, width: number, bottom: number, top: number, front: THREE.Material, doorZ: number): void {
    const count = width > 0.5 ? 2 : 1;
    const w = width / count - 2 * GAP;
    const h = top - bottom - 2 * GAP;
    for (let i = 0; i < count; i++) {
      const x = cx - width / 2 + (i + 0.5) * (width / count);
      part(this, w, h, DOOR_THICKNESS, front, { x, y: (top + bottom) / 2, z: doorZ - DOOR_THICKNESS / 2 });
      // The handle sits near the top edge, towards the middle of a pair.
      const side = count === 1 ? 0 : i === 0 ? 1 : -1;
      this.buildHandle(x + side * (w / 2 - 0.12), top - 0.06, doorZ);
    }
  }

  /** Three drawer fronts, the top one shallower, each with its own handle. */
  private buildDrawers(cx: number, width: number, bottom: number, top: number, front: THREE.Material, doorZ: number): void {
    const total = top - bottom;
    const heights = [0.18, 0.28, total - 0.46].map((h) => h - 2 * GAP);
    let y = top;
    for (const h of heights) {
      part(this, width - 2 * GAP, h, DOOR_THICKNESS, front, { x: cx, y: y - GAP - h / 2, z: doorZ - DOOR_THICKNESS / 2 });
      this.buildHandle(cx, y - GAP - h / 2, doorZ);
      y -= h + 2 * GAP;
    }
  }

  /** A steel bar handle on two short posts, horizontal, centred at (x, y) on the door plane. */
  private buildHandle(x: number, y: number, doorZ: number): void {
    const bar = cylinderMesh(HANDLE_RADIUS, HANDLE_LENGTH, STEEL, { x, y, z: doorZ + 0.03 }, { segments: 10 });
    bar.rotation.z = Math.PI / 2;
    bar.castShadow = false;
    this.add(bar);
    for (const dx of [-HANDLE_LENGTH / 2 + 0.015, HANDLE_LENGTH / 2 - 0.015]) {
      const post = cylinderMesh(0.004, 0.03, STEEL, { x: x + dx, y, z: doorZ + 0.015 }, { segments: 8 });
      post.rotation.x = Math.PI / 2;
      post.castShadow = false;
      this.add(post);
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

  /** The built-in oven: a dark fascia with two knobs and a display over a glass door with a long bar handle. */
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
    // Door: steel frame, glass in the middle, drawer of trays below it.
    const doorH = 0.6;
    const doorY = top - GAP - fasciaH - doorH / 2;
    part(this, w, doorH, DOOR_THICKNESS, STEEL, { x: cx, y: doorY, z });
    part(this, w - 0.1, doorH - 0.12, 0.002, OVEN_GLASS, { x: cx, y: doorY, z: doorZ + 0.001 }).castShadow = false;
    const bar = cylinderMesh(0.008, w - 0.1, STEEL, { x: cx, y: doorY + doorH / 2 - 0.03, z: doorZ + 0.04 }, { segments: 10 });
    bar.rotation.z = Math.PI / 2;
    this.add(bar);
    for (const dx of [-(w / 2 - 0.07), w / 2 - 0.07]) {
      const post = cylinderMesh(0.006, 0.04, STEEL, { x: cx + dx, y: doorY + doorH / 2 - 0.03, z: doorZ + 0.02 }, { segments: 8 });
      post.rotation.x = Math.PI / 2;
      this.add(post);
    }
    const drawerTop = doorY - doorH / 2 - GAP;
    part(this, w, drawerTop - bottom - GAP, DOOR_THICKNESS, OVEN_FASCIA, { x: cx, y: (drawerTop + bottom) / 2, z });
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
