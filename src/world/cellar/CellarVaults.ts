import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createCanvas, toTexture, repeatTexture } from '@/covers/generated/canvasUtils';
import { Prop } from '../props/Prop';
import { CELL, CELLAR_PLAN as plan, COLUMNS, CROWN, ROWS, SPRING, brickSides, cellAt, cellCentre, type CellSide } from './cellarPlan';
import { paintOnce } from '../materials/paintedTiles';
import { lcg } from '@/random';

type Finish = 'brick' | 'floor';
/** The colliders' thickness behind a wall face (m). */
const T = 0.12;
/** The brick tile's size in the world (m): four bricks across, eight courses up. */
const BRICK_TILE = { u: 1.0, v: 0.62 };
/** The floor's flagstones tile (m). */
const FLAG_TILE = 2.0;

/**
 * The cellars' masonry from `CELLAR_PLAN`'s grid: a beaten floor of worn flags, brick walls wherever an open cell
 * (a passage, or a storage box's inside) meets solid ground, a low groin vault over every cell (four brick faces
 * from the walls' spring up to a crown over the cell's middle), and the narrow tunnel of the stairs up to the hall
 * with its steps and the door at the top. Light is baked into the vertex colours (dark at the foot of the walls and
 * in the springs), so the torch and the bare bulbs are the only real light. Merged per material (two draws); the
 * walls and the stairs' mouth are its `colliders`. The storage boxes' slatted fronts are `CellarBox`es.
 */
export class CellarVaults extends Prop {
  readonly contactShadow = false;
  readonly colliders: THREE.Box3[] = [];
  /** The door at the top of the stairs (zone-local foot, facing -z): placed by the builder. */
  readonly door: { at: THREE.Vector3; yaw: number };
  /** The stairs' steps, for the builder's "go up" hitbox: their box (zone-local). */
  readonly stairsBox: THREE.Box3;
  private readonly parts = new Map<Finish, THREE.BufferGeometry[]>();

  constructor() {
    super();
    this.name = 'CellarVaults';
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLUMNS; c++) {
        if (cellAt(c, r) === '#') continue;
        this.buildCell(c, r);
      }
    }
    const stairs = this.buildStairs();
    this.door = stairs.door;
    this.stairsBox = stairs.box;
    const materials: Record<Finish, THREE.Material> = {
      brick: new THREE.MeshStandardMaterial({ map: paintOnce('cellar:brick', () => [brickTexture()] as const)[0], roughness: 0.95, vertexColors: true }),
      floor: new THREE.MeshStandardMaterial({ map: paintOnce('cellar:flags', () => [flagTexture()] as const)[0], roughness: 0.9, vertexColors: true }),
    };
    for (const [finish, geometries] of this.parts) {
      const mesh = new THREE.Mesh(mergeGeometries(geometries)!, materials[finish]);
      for (const g of geometries) g.dispose();
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      this.add(mesh);
    }
  }

  /** An open cell or a box's inside: its floor, its walls against solid ground, its vault. A box's front is left open. */
  private buildCell(c: number, r: number): void {
    const [x, z] = cellCentre(c, r);
    const h = CELL / 2;
    this.put('floor', quadFlat(x - h, x + h, z - h, z + h, 0));
    // Brick where `brickSides` says (the same answer the timer buttons are hung by); the stairs' mouth: the tunnel.
    for (const side of brickSides(c, r)) this.wallFacing(x, z, side);
    if (cellAt(c, r) === 'S') this.buildMouth(x, z + h);
    this.vault(x, z);
  }

  /** The wall on `side` of the cell centred (x, z), facing into it, and its collider just behind. */
  private wallFacing(x: number, z: number, side: CellSide): void {
    const h = CELL / 2;
    switch (side) {
      case 'north':
        this.wall(x + h, z + h, x - h, z + h, 0, SPRING);
        this.colliders.push(box3(x - h, z + h, x + h, z + h + T));
        break;
      case 'south':
        this.wall(x - h, z - h, x + h, z - h, 0, SPRING);
        this.colliders.push(box3(x - h, z - h - T, x + h, z - h));
        break;
      case 'east':
        this.wall(x + h, z - h, x + h, z + h, 0, SPRING);
        this.colliders.push(box3(x + h, z - h, x + h + T, z + h));
        break;
      case 'west':
        this.wall(x - h, z + h, x - h, z - h, 0, SPRING);
        this.colliders.push(box3(x - h - T, z - h, x - h, z + h));
        break;
    }
  }

  /** A groin vault over the cell: four brick faces from the edges at `SPRING` up to the crown, facing down. */
  private vault(x: number, z: number): void {
    const h = CELL / 2;
    const corners: [number, number][] = [[x - h, z - h], [x + h, z - h], [x + h, z + h], [x - h, z + h]];
    const positions: number[] = [];
    const colours: number[] = [];
    const uvs: number[] = [];
    for (let i = 0; i < 4; i++) {
      const [ax, az] = corners[i]!;
      const [bx, bz] = corners[(i + 1) % 4]!;
      // Wound so the face looks down into the cell.
      for (const [px, py, pz, shade] of [[ax, SPRING, az, 0.55], [bx, SPRING, bz, 0.55], [x, CROWN, z, 0.85]] as const) {
        positions.push(px, py, pz);
        colours.push(shade, shade, shade);
        uvs.push((px + pz) / BRICK_TILE.u, Math.hypot(px - x, pz - z) / BRICK_TILE.v);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.computeVertexNormals();
    this.put('brick', g);
  }

  /** The S cell's north wall: the stairs' mouth in its middle, brick either side of it. */
  private buildMouth(x: number, z: number): void {
    const { width } = plan.stairs;
    const h = CELL / 2;
    const w = width / 2;
    this.wall(x + h, z, x + w, z, 0, SPRING);
    this.wall(x - w, z, x - h, z, 0, SPRING);
    this.colliders.push(box3(x - h, z, x - w, z + T), box3(x + w, z, x + h, z + T));
  }

  /**
   * The tunnel of the stairs up to the hall, north of the S cell: its steps, its side walls and sloping vault, and
   * the door at the top. The stairs are not walked (the hall is a zone of its own: the hitbox over them goes up), so
   * a collider shuts the mouth.
   */
  private buildStairs(): { door: { at: THREE.Vector3; yaw: number }; box: THREE.Box3 } {
    const [x, z0] = cellCentre(...plan.arrival.cell);
    const { width, steps, rise, going } = plan.stairs;
    const mouth = z0 + CELL / 2;
    const w = width / 2;
    for (let i = 0; i < steps; i++) {
      const top = (i + 1) * rise;
      const g = new THREE.BoxGeometry(width, top, going);
      g.translate(x, top / 2, mouth + going * (i + 0.5));
      this.put('brick', shaded(g, 0.7));
    }
    const end = mouth + steps * going;
    const landing = steps * rise;
    // A last flat step before the door.
    const top = new THREE.BoxGeometry(width, landing, 0.35);
    top.translate(x, landing / 2, end + 0.175);
    this.put('brick', shaded(top, 0.7));
    const back = end + 0.35;
    const ceilingTop = landing + 2.15;
    this.wall(x - w, back, x - w, mouth, 0, ceilingTop);
    this.wall(x + w, mouth, x + w, back, 0, ceilingTop);
    // The sloping vault: from the mouth at the spring up to over the door.
    const vault = new THREE.PlaneGeometry(width, Math.hypot(back - mouth, ceilingTop - SPRING));
    // Facing down, rising towards the door (+z).
    vault.rotateX(Math.PI / 2 - Math.atan2(ceilingTop - SPRING, back - mouth));
    vault.translate(x, (SPRING + ceilingTop) / 2, (mouth + back) / 2);
    this.put('brick', shaded(vault, 0.5));
    // Over the door, the wall the door is in.
    this.wall(x + w, back, x - w, back, landing + 2.08, ceilingTop);
    this.colliders.push(box3(x - w, mouth, x + w, mouth + T));
    return {
      door: { at: new THREE.Vector3(x, landing, back - 0.005), yaw: Math.PI },
      box: new THREE.Box3(new THREE.Vector3(x - w, 0, mouth), new THREE.Vector3(x + w, landing + 0.4, back)),
    };
  }

  /** A wall face from (ax, az) to (bx, bz), y0..y1, facing its left-hand normal; uvs in brick tiles; darker at the foot. */
  private wall(ax: number, az: number, bx: number, bz: number, y0: number, y1: number): void {
    const length = Math.hypot(bx - ax, bz - az);
    const g = new THREE.PlaneGeometry(length, y1 - y0, Math.max(1, Math.round(length / CELL)), 3);
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const colours: number[] = [];
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, (pos.getX(i) + length / 2 + ax + az) / BRICK_TILE.u, (pos.getY(i) + (y1 - y0) / 2 + y0) / BRICK_TILE.v);
      const y = pos.getY(i) + (y1 - y0) / 2 + y0;
      // Damp and dark at the foot, the soot of old lamps under the springs.
      const shade = 0.5 + 0.45 * Math.min(1, y / 0.9) - (y > SPRING - 0.4 ? 0.15 * ((y - SPRING + 0.4) / 0.4) : 0);
      colours.push(shade, shade, shade);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
    g.rotateY(Math.atan2(-(bz - az), bx - ax));
    g.translate((ax + bx) / 2, (y0 + y1) / 2, (az + bz) / 2);
    this.put('brick', g);
  }

  private put(finish: Finish, g: THREE.BufferGeometry): void {
    // One attribute set for every part merged: index-less, with colours.
    const flat = g.index ? g.toNonIndexed() : g;
    if (flat !== g) g.dispose();
    if (!flat.getAttribute('color')) shaded(flat, 0.8);
    let list = this.parts.get(finish);
    if (!list) this.parts.set(finish, (list = []));
    list.push(flat);
  }
}

/** A floor quad over a rectangle at height y, facing up; uvs in flagstone tiles; darker by the walls is the walls' job. */
function quadFlat(x0: number, x1: number, z0: number, z1: number, y: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
  g.rotateX(-Math.PI / 2);
  g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / FLAG_TILE, pos.getZ(i) / FLAG_TILE);
  return shaded(g, 0.75);
}

/** Gives `g` a flat vertex colour `shade` (the baked light of a part with no gradient). */
function shaded(g: THREE.BufferGeometry, shade: number): THREE.BufferGeometry {
  const count = g.getAttribute('position').count;
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(count * 3).fill(shade), 3));
  return g;
}

/** A collider from (x0, z0) to (x1, z1), floor to over the vault. */
function box3(x0: number, z0: number, x1: number, z1: number): THREE.Box3 {
  return new THREE.Box3(new THREE.Vector3(x0, 0, z0), new THREE.Vector3(x1, CROWN + 0.5, z1));
}

/** Old red brick in lime mortar, each brick its own shade, some flaking white with saltpetre. */
function brickTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(512, 320);
  const random = lcg(1907);
  ctx.fillStyle = '#8a8070';
  ctx.fillRect(0, 0, 512, 320);
  const rows = 8;
  const cols = 4;
  const bh = 320 / rows;
  const bw = 512 / cols;
  for (let r = 0; r < rows; r++) {
    const offset = r % 2 ? bw / 2 : 0;
    for (let c = -1; c <= cols; c++) {
      const x = c * bw + offset;
      const tone = 0.75 + 0.35 * random();
      const red = Math.round(128 * tone);
      const green = Math.round(64 * tone);
      const blue = Math.round(46 * tone);
      ctx.fillStyle = `rgb(${red}, ${green}, ${blue})`;
      ctx.fillRect(x + 3, r * bh + 3, bw - 6, bh - 6);
      if (random() < 0.18) {
        ctx.fillStyle = 'rgba(230, 226, 210, 0.35)';
        ctx.fillRect(x + 3 + random() * bw * 0.4, r * bh + 3 + random() * bh * 0.4, bw * 0.4, bh * 0.4);
      }
    }
  }
  for (let i = 0; i < 1400; i++) {
    ctx.fillStyle = random() < 0.5 ? 'rgba(20, 12, 8, 0.18)' : 'rgba(240, 220, 200, 0.08)';
    ctx.fillRect(random() * 512, random() * 320, 2, 2);
  }
  const texture = toTexture(canvas, 'grazing');
  repeatTexture(texture);
  return texture;
}

/** Worn flagstones, grit between them, damp patches. */
function flagTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(512, 512);
  const random = lcg(1911);
  ctx.fillStyle = '#3e3a34';
  ctx.fillRect(0, 0, 512, 512);
  const n = 4;
  const size = 512 / n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const tone = 70 + Math.round(30 * random());
      ctx.fillStyle = `rgb(${tone + 8}, ${tone + 2}, ${tone - 6})`;
      ctx.fillRect(i * size + 4, j * size + 4, size - 8, size - 8);
    }
  }
  for (let i = 0; i < 30; i++) {
    ctx.fillStyle = 'rgba(20, 18, 14, 0.12)';
    ctx.beginPath();
    ctx.arc(random() * 512, random() * 512, 20 + random() * 60, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = toTexture(canvas, 'grazing');
  repeatTexture(texture);
  return texture;
}
