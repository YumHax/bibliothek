import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createCanvas, seededRandom, toTexture } from '@/covers/generated/canvasUtils';
import { Prop } from '../props/Prop';
import { ATTIC_PLAN as plan, type AtticRect } from './atticPlan';

type Finish = 'plaster' | 'ceiling' | 'floor' | 'boards' | 'wood';

/** Partition thickness between the corridor and the rooms off it. */
const T = 0.1;
/** The light baked into the surfaces' vertex colours: darker into the floor's and the ceiling's corners. */
const AO = { floor: 0.62, ceiling: 0.8, band: 0.35 };

/**
 * The attic's shell, built from `ATTIC_PLAN`: the corridor (red hexagonal tomettes, plaster walls
 * between the maids' rooms, a low ceiling) and the collector's room at its west end (old boards, the
 * mansard's slope over its street wall with two roof windows in it, a taller ceiling). One merged
 * mesh per finish, shadowless (nothing up here casts: the attic's lights are shadowless), the
 * corners darkened in the vertex colours instead. Walls and the slope's low end are `colliders`.
 * Zone-local, origin on the floor at the zone's middle. The skylights' glass is `skyGlass` (the
 * lights tint it with the sky).
 */
export class AtticShell extends Prop {
  readonly contactShadow = false;
  readonly colliders: THREE.Box3[] = [];
  readonly skyGlass = new THREE.MeshBasicMaterial({ color: 0x8aa0b8, toneMapped: false });
  private readonly parts = new Map<Finish, THREE.BufferGeometry[]>();

  constructor() {
    super();
    this.name = 'AtticShell';
    this.buildCorridor();
    this.buildCollectorRoom();
    this.buildColliders();
    const materials: Record<Finish, THREE.MeshStandardMaterial> = {
      plaster: new THREE.MeshStandardMaterial({ color: 0xd8ccb4, roughness: 0.95, vertexColors: true }),
      ceiling: new THREE.MeshStandardMaterial({ color: 0xe2d9c6, roughness: 0.95, vertexColors: true }),
      floor: new THREE.MeshStandardMaterial({ map: tometteTexture(), roughness: 0.8, vertexColors: true }),
      boards: new THREE.MeshStandardMaterial({ map: boardsTexture(), roughness: 0.75, vertexColors: true }),
      wood: new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 0.7, vertexColors: true }),
    };
    for (const [finish, geometries] of this.parts) {
      const merged = mergeGeometries(geometries);
      for (const g of geometries) g.dispose();
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, materials[finish]);
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      this.add(mesh);
    }
    for (const [finish, material] of Object.entries(materials)) if (!this.parts.has(finish as Finish)) material.dispose();
  }

  private buildCorridor(): void {
    const { corridor: c, car, collectorRoom, doorway, corridorHeight: h } = plan;
    const west = collectorRoom.x1 + T / 2;
    this.flat('floor', { x0: west, x1: c.x1, z0: c.z0, z1: c.z1 }, 0, false);
    this.flat('ceiling', { x0: west, x1: c.x1, z0: c.z0, z1: c.z1 }, h, true);
    // The courtyard side: the rooms' wall up to the lift's cage, a lintel over its gate.
    this.wall('plaster', west, c.z0, car.x0 - 0.05, c.z0, 0, h);
    this.wall('plaster', car.x0 - 0.05, c.z0, c.x1, c.z0, car.height + 0.05, h);
    this.wall('plaster', car.x1 + 0.05, c.z0, c.x1, c.z0, 0, car.height + 0.05);
    // The street side, the east end.
    this.wall('plaster', c.x1, c.z1, west, c.z1, 0, h);
    this.wall('plaster', c.x1, c.z0, c.x1, c.z1, 0, h);
    // The west end round the collector's doorway.
    const d0 = doorway.z - doorway.width / 2;
    const d1 = doorway.z + doorway.width / 2;
    this.wall('plaster', west, c.z1, west, d1, 0, h);
    this.wall('plaster', west, d0, west, c.z0, 0, h);
    this.wall('plaster', west, d1, west, d0, doorway.height, h);
    // A skirting of dark wood along both long walls.
    this.box('wood', west, 0, c.z0, car.x0 - 0.05, 0.1, c.z0 + 0.012);
    this.box('wood', west, 0, c.z1 - 0.012, c.x1, 0.1, c.z1);
  }

  private buildCollectorRoom(): void {
    const { collectorRoom: r, doorway, roomHeight: h, slope, skylights } = plan;
    const east = r.x1 - T / 2;
    const slopeZ = r.z1 - slope.run;
    this.flat('boards', { x0: r.x0, x1: east, z0: r.z0, z1: r.z1 }, 0, false);
    this.flat('ceiling', { x0: r.x0, x1: east, z0: r.z0, z1: slopeZ }, h, true);
    this.wall('plaster', r.x0, r.z1, r.x0, r.z0, 0, h);
    this.wall('plaster', r.x0, r.z0, east, r.z0, 0, h);
    // The partition, with the doorway from the corridor.
    const d0 = doorway.z - doorway.width / 2;
    const d1 = doorway.z + doorway.width / 2;
    this.wall('plaster', east, r.z0, east, d0, 0, h);
    this.wall('plaster', east, d1, east, r.z1, 0, h);
    this.wall('plaster', east, d0, east, d1, doorway.height, h);
    // The doorway's jambs and lintel through the partition (its door long gone).
    const west = r.x1 + T / 2;
    this.box('wood', east, 0, d0 - 0.05, west, doorway.height + 0.05, d0);
    this.box('wood', east, 0, d1, west, doorway.height + 0.05, d1 + 0.05);
    this.box('wood', east, doorway.height, d0, west, doorway.height + 0.05, d1);
    // The street wall up to the slope's foot, the slope over it (the mansard's brisis) up to the ceiling.
    this.wall('plaster', east, r.z1, r.x0, r.z1, 0, slope.foot);
    this.slopePlane(r.x0, east, r.z1, slope.foot, slopeZ, h, skylights);
    // An oak beam across under the ceiling, and the skirting.
    this.box('wood', r.x0, h - 0.16, -0.95, east, h, -0.75);
    this.box('wood', r.x0, 0, r.z0, east, 0.1, r.z0 + 0.012);
    this.box('wood', r.x0, 0, r.z0, r.x0 + 0.012, 0.1, r.z1);
  }

  /** The slope from (z0, y0) at the street wall up to (z1, y1) at the ceiling's edge, cut round the skylights. */
  private slopePlane(x0: number, x1: number, z0: number, y0: number, z1: number, y1: number, windows: typeof plan.skylights): void {
    const length = Math.hypot(z0 - z1, y1 - y0);
    // Along the slope, the skylights' span (measured from the foot), centred.
    const s0 = (length - windows[0]!.length) / 2;
    const s1 = s0 + windows[0]!.length;
    const at = (s: number): [number, number] => [z0 + ((z1 - z0) * s) / length, y0 + ((y1 - y0) * s) / length];
    const strip = (xa: number, xb: number, sa: number, sb: number): void => {
      const [za, ya] = at(sa);
      const [zb, yb] = at(sb);
      // Facing down and into the room (the normal comes out of the counter-clockwise side), darker at its foot.
      const foot = sa < 1e-3 ? 0.84 : 1;
      this.quad('plaster', [xb, ya, za], [xa, ya, za], [xa, yb, zb], [xb, yb, zb], [foot, foot, 1, 1]);
    };
    // Up the slope, and the way into the room off it (its inward normal).
    const along = new THREE.Vector3(0, y1 - y0, z1 - z0).normalize();
    const inward = new THREE.Vector3(0, -along.z, along.y).multiplyScalar(-1);
    if (inward.y > 0) inward.negate();
    const tilt = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), along);
    /** A bar of the roof window's frame lying on the slope: `length` along it (or across, `across`), centred at (x, s). */
    const bar = (x: number, s: number, width: number, length: number): void => {
      const [z, y] = at(s);
      const g = new THREE.BoxGeometry(width, 0.03, length).applyQuaternion(tilt).translate(x + inward.x * 0.015, y + inward.y * 0.015, z + inward.z * 0.015).toNonIndexed();
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 3).fill(1), 3));
      this.put('wood', g);
    };
    strip(x0, x1, 0, s0);
    strip(x0, x1, s1, length);
    const sorted = [...windows].sort((a, b) => a.x - b.x);
    let x = x0;
    for (const w of sorted) {
      strip(x, w.x - w.width / 2, s0, s1);
      x = w.x + w.width / 2;
      // The glass a few millimetres in from the slope's plane (facing the room), its frame round it.
      const [zm, ym] = at((s0 + s1) / 2);
      const glass = new THREE.PlaneGeometry(w.width, windows[0]!.length);
      // The plane faces +z with its height along +y: turned so it faces into the room, its height up the slope.
      glass.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(-1, 0, 0), along, inward));
      glass.translate(w.x - inward.x * 0.004, ym - inward.y * 0.004, zm - inward.z * 0.004);
      const pane = new THREE.Mesh(glass, this.skyGlass);
      pane.castShadow = false;
      this.add(pane);
      const len = windows[0]!.length;
      bar(w.x - w.width / 2, (s0 + s1) / 2, 0.04, len + 0.04);
      bar(w.x + w.width / 2, (s0 + s1) / 2, 0.04, len + 0.04);
      bar(w.x, s0, w.width + 0.04, 0.04);
      bar(w.x, s1, w.width + 0.04, 0.04);
    }
    strip(x, x1, s0, s1);
  }

  /** The walls and the slope's low end, zone-local boxes. */
  private buildColliders(): void {
    const { corridor: c, car, collectorRoom: r, doorway, slope, corridorHeight } = plan;
    const H = Math.max(corridorHeight, plan.roomHeight);
    const box = (x0: number, z0: number, x1: number, z1: number, y1 = H): void => {
      this.colliders.push(new THREE.Box3(new THREE.Vector3(x0, 0, z0), new THREE.Vector3(x1, y1, z1)));
    };
    box(r.x1 - T / 2, c.z0 - T, car.x0 - 0.05, c.z0);
    box(r.x1, c.z1, c.x1, c.z1 + T);
    box(c.x1, c.z0, c.x1 + T, c.z1);
    const d0 = doorway.z - doorway.width / 2;
    const d1 = doorway.z + doorway.width / 2;
    box(r.x1 - T / 2, r.z0, r.x1 + T / 2, d0);
    box(r.x1 - T / 2, d1, r.x1 + T / 2, r.z1);
    box(r.x0 - T, r.z0, r.x0, r.z1);
    box(r.x0, r.z0 - T, r.x1, r.z0);
    // Under the slope, where the head would hit it.
    box(r.x0, r.z1 - slope.run * 0.45, r.x1, r.z1 + T);
  }

  /** A horizontal quad over `r` at height `y`, facing up (or down). */
  private flat(finish: Finish, r: AtticRect, y: number, down: boolean): void {
    const k = down ? AO.ceiling : 1;
    if (down) this.quad(finish, [r.x0, y, r.z0], [r.x1, y, r.z0], [r.x1, y, r.z1], [r.x0, y, r.z1], [k, k, k, k]);
    else this.quad(finish, [r.x0, y, r.z1], [r.x1, y, r.z1], [r.x1, y, r.z0], [r.x0, y, r.z0], [1, 1, 1, 1]);
  }

  /** A wall face from (ax, az) to (bx, bz), y0 to y1, facing its left-hand normal; darker where it meets the floor and the ceiling. */
  private wall(finish: Finish, ax: number, az: number, bx: number, bz: number, y0: number, y1: number): void {
    const shade = (y: number): number => {
      if (y <= 0.001) return AO.floor;
      if (y >= Math.max(plan.corridorHeight, plan.roomHeight) - 0.001 || Math.abs(y - plan.corridorHeight) < 0.001) return AO.ceiling;
      return 1;
    };
    // Bands near the floor and the ceiling, so the darkening fades over `AO.band`.
    const cuts = [y0, y0 <= 0.001 ? Math.min(y1, AO.band) : y0, Math.max(y0, y1 - AO.band * 0.6), y1].filter((y, i, all) => i === 0 || y > all[i - 1]! + 1e-4);
    for (let i = 0; i + 1 < cuts.length; i++) {
      const lo = cuts[i]!;
      const hi = cuts[i + 1]!;
      const a = i === 0 ? shade(lo) : 1;
      const b = i + 2 === cuts.length ? shade(hi) : 1;
      this.quad(finish, [ax, lo, az], [bx, lo, bz], [bx, hi, bz], [ax, hi, az], [a, a, b, b]);
    }
  }

  /** A box from (x0, y0, z0) to (x1, y1, z1), plain colour. */
  private box(finish: Finish, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2).toNonIndexed();
    const colours = new Float32Array(g.getAttribute('position').count * 3).fill(1);
    g.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    this.put(finish, g);
  }

  /** Two triangles a-b-c, a-c-d (counter-clockwise seen from the front), uvs in metres, a shade per corner. */
  private quad(finish: Finish, a: number[], b: number[], c: number[], d: number[], shade: [number, number, number, number]): void {
    const corners = [a, b, c, a, c, d];
    const shades = [shade[0], shade[1], shade[2], shade[0], shade[2], shade[3]];
    const position = new Float32Array(corners.flat());
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(position, 3));
    g.computeVertexNormals();
    // Uvs in metres, projected on the face's main plane.
    const n = new THREE.Vector3().fromBufferAttribute(g.getAttribute('normal') as THREE.BufferAttribute, 0);
    const uv = new Float32Array(12);
    corners.forEach(([x, y, z], i) => {
      const [u, v] = Math.abs(n.y) > 0.7 ? [x!, z!] : Math.abs(n.x) > Math.abs(n.z) ? [z!, y!] : [x!, y!];
      uv[i * 2] = u;
      uv[i * 2 + 1] = v;
    });
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(shades.flatMap((s) => [s, s, s])), 3));
    this.put(finish, g);
  }

  private put(finish: Finish, g: THREE.BufferGeometry): void {
    let list = this.parts.get(finish);
    if (!list) this.parts.set(finish, (list = []));
    list.push(g);
  }
}

/** Red hexagonal terracotta tomettes, worn paler down the middle: a metre square, tiled. */
function tometteTexture(): THREE.CanvasTexture {
  const px = 512;
  const [canvas, ctx] = createCanvas(px, px);
  const random = seededRandom(606);
  ctx.fillStyle = '#5a3a2c';
  ctx.fillRect(0, 0, px, px);
  // Hexagons 16 cm across the flats: 6.25 a metre, laid in offset rows.
  const r = px / 6.25 / Math.sqrt(3);
  const dx = Math.sqrt(3) * r;
  const dy = 1.5 * r;
  for (let row = -1; row * dy < px + dy; row++) {
    for (let col = -1; col * dx < px + dx; col++) {
      const cx = col * dx + (row % 2 ? dx / 2 : 0);
      const cy = row * dy;
      const tone = 0.85 + random() * 0.25;
      ctx.fillStyle = `rgb(${Math.round(150 * tone)}, ${Math.round(70 * tone)}, ${Math.round(48 * tone)})`;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 6 + (i * Math.PI) / 3;
        const x = cx + (r - 1.6) * Math.cos(a);
        const y = cy + (r - 1.6) * Math.sin(a);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
    }
  }
  // Scuffs and dust.
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = random() < 0.5 ? 'rgba(230, 200, 170, 0.08)' : 'rgba(40, 20, 10, 0.1)';
    ctx.fillRect(random() * px, random() * px, 1 + random() * 3, 1 + random() * 2);
  }
  const texture = toTexture(canvas, 8);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** Wide old floorboards, grey with dust, a metre square, tiled. */
function boardsTexture(): THREE.CanvasTexture {
  const px = 512;
  const [canvas, ctx] = createCanvas(px, px);
  const random = seededRandom(707);
  const board = px / 5;
  for (let i = 0; i < 5; i++) {
    const tone = 0.8 + random() * 0.3;
    ctx.fillStyle = `rgb(${Math.round(120 * tone)}, ${Math.round(98 * tone)}, ${Math.round(78 * tone)})`;
    ctx.fillRect(i * board, 0, board, px);
    ctx.fillStyle = 'rgba(30, 20, 12, 0.6)';
    ctx.fillRect(i * board, 0, 2, px);
    // The board's end joint somewhere along it.
    ctx.fillRect(i * board, random() * px, board, 2);
    for (let g = 0; g < 14; g++) {
      ctx.fillStyle = 'rgba(50, 35, 22, 0.18)';
      ctx.fillRect(i * board + random() * board, 0, 1, px);
    }
  }
  // The dust, thick: nobody has walked here in thirty years.
  ctx.fillStyle = 'rgba(200, 192, 180, 0.28)';
  ctx.fillRect(0, 0, px, px);
  for (let i = 0; i < 1200; i++) {
    ctx.fillStyle = 'rgba(225, 218, 205, 0.12)';
    ctx.fillRect(random() * px, random() * px, 2, 2);
  }
  const texture = toTexture(canvas, 8);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}
