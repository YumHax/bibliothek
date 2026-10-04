import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Updatable } from '@/core/Engine';
import { dailySeed } from '@/time/daily';
import { currentSeason } from '@/time/season';
import type { Furniture } from '../../Furniture';
import type { DayNight } from '../../props/DayNight';
import { snowCovered } from '../snowCover';
import { outOfSight } from '../life/sight';
import { groundHeight } from '../relief/ground';
import type { Vec2 } from '../streetPlan';
import { FACADES } from '@/world/city/facades';
import { FRONT, KERB_HEIGHT, isWalkable } from '@/world/measures/street';
import { GROUND, onSurface } from '../../surface/layers';
import { lcg } from '@/random';

interface StreetClutterOptions {
  /** The pavement trees (petals settle round them in spring). */
  trees: readonly Vec2[];
  /** The street's litter bins and benches (where the litter gathers). */
  bins: readonly Vec2[];
  benches: readonly { at: Vec2 }[];
  /** When the bin lorry comes (game hours, from .. to): the bags and bins are out from the evening before until it has been. */
  binHours: readonly [number, number];
  /** The camera: what is put out or taken in changes only out of its sight. */
  viewer: THREE.Object3D;
}

/** The bags and wheelie bins go out this many hours before the lorry's round (the evening before). */
const OUT_BEFORE = 9;
/** How far up and down the pavement from a residents' door its rubbish stands, and how far out of the wall. */
const BIN_SPREAD = 1.6;
const OFF_WALL = 0.45;
/** Litter a real day: how many scraps. Settled petals at the blossom's height. */
const LITTER = [10, 18] as const;
const PETALS = 1400;
/** Seconds between two looks at what should be out. */
const CHECK_EVERY = 1;
const WHEELIE_COLOURS = [0x2f4a36, 0x3a3e42, 0x1e2124, 0x5a4a2a];
const LITTER_COLOURS = [0xf2efe6, 0xc23a2a, 0x2a6ac2, 0xe8c030, 0xd8d0c0, 0x7a8a8a];

/** One thing put out: which mesh and instance, its matrix when shown, where it stands (zone-local, for the sight check). */
interface Piece {
  mesh: THREE.InstancedMesh;
  index: number;
  matrix: THREE.Matrix4;
  at: THREE.Vector3;
  shown: boolean;
}

/**
 * The street's small mess, coming and going with the days: the residents' black bags and wheelie
 * bins put out by their doors the evening before the bin lorry's round and gone once it has been;
 * litter (paper cups, cans, crumpled paper, wrappers) by the bins, under the benches and along the
 * gutters, different every real day (`time/daily`); and in spring the blossom's petals settled
 * round the pavement trees, more as the season goes. Snow hides the litter and the petals. What is
 * put out or taken in changes only out of the player's sight (`life/sight`), one piece at a time.
 * Instanced (a draw call a kind), never colliding: knee-high, against the walls.
 */
export class StreetClutter extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  private readonly bins: Piece[] = [];
  private readonly litter: THREE.InstancedMesh[] = [];
  private readonly petals: THREE.InstancedMesh | null;
  private readonly hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  private readonly world = new THREE.Vector3();
  private clock = CHECK_EVERY;
  private snowHidden = false;
  /** Just activated: everything takes its state at once (nobody watches it change). */
  private fresh = true;

  constructor(private readonly dayNight: DayNight, private readonly options: StreetClutterOptions) {
    super();
    this.name = 'StreetClutter';
    this.layBins();
    this.layLitter();
    this.petals = this.layPetals();
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  setZoneActive(active: boolean): void {
    if (active) this.fresh = true;
  }

  update(dt: number): void {
    this.clock += dt;
    if (this.clock < CHECK_EVERY && !this.fresh) return;
    this.clock = 0;
    const s = this.dayNight.state;
    const [from, to] = this.options.binHours;
    // Out from the evening before the round until it ends (across midnight).
    const out = from - OUT_BEFORE;
    const h = s.hours;
    const binsOut = out < 0 ? h >= out + 24 || h < to : h >= out && h < to;
    let changed = false;
    for (const piece of this.bins) {
      if (piece.shown === binsOut) continue;
      if (!this.fresh && !outOfSight(this.options.viewer, this.localToWorld(this.world.copy(piece.at)))) continue;
      piece.shown = binsOut;
      piece.mesh.setMatrixAt(piece.index, binsOut ? piece.matrix : this.hidden);
      piece.mesh.instanceMatrix.needsUpdate = true;
      changed = true;
    }
    // Under snow, no litter and no petals (they are under it).
    const snowy = s.snowCover > 0.3;
    if (snowy !== this.snowHidden) {
      this.snowHidden = snowy;
      for (const mesh of this.litter) mesh.visible = !snowy;
      if (this.petals) this.petals.visible = !snowy;
    }
    if (changed) for (const piece of this.bins) piece.mesh.computeBoundingSphere();
    this.fresh = false;
  }

  /**
   * By every residents' door on the walked pavements: a wheelie bin and a bag or three against the
   * wall to one side of it (each door its own way, fixed: the same neighbours, the same habits).
   */
  private layBins(): void {
    const spots: { at: Vec2; yaw: number; along: Vec2 }[] = [];
    for (const facade of FACADES) {
      if (facade.door === undefined) continue;
      if (facade.openings?.some((o) => Math.abs(o.at - facade.door!) < o.width)) continue;
      const [ax, az] = facade.from;
      const [bx, bz] = facade.to;
      const length = Math.hypot(bx - ax, bz - az);
      const [ux, uz] = [(bx - ax) / length, (bz - az) / length];
      const at: Vec2 = [ax + ux * facade.door - uz * OFF_WALL, az + uz * facade.door + ux * OFF_WALL];
      if (!isWalkable(at)) continue;
      spots.push({ at, yaw: Math.atan2(-uz, ux), along: [ux, uz] });
    }
    const random = lcg(5150);
    const wheelies = new THREE.InstancedMesh(wheelieBin(), snowCovered(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55 })), Math.max(1, spots.length));
    const bags = new THREE.InstancedMesh(binBag(), snowCovered(new THREE.MeshStandardMaterial({ color: 0x16181b, roughness: 0.3 })), Math.max(1, spots.length * 3));
    let bagCount = 0;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const yAxis = new THREE.Vector3(0, 1, 0);
    spots.forEach(({ at, yaw, along }, i) => {
      const side = random() < 0.5 ? -1 : 1;
      const d = BIN_SPREAD * (0.7 + random() * 0.3) * side;
      const wx = at[0] + along[0] * d;
      const wz = at[1] + along[1] * d;
      q.setFromAxisAngle(yAxis, yaw + (random() - 0.5) * 0.3);
      m.compose(new THREE.Vector3(wx, 0, wz), q, new THREE.Vector3(1, 1, 1));
      this.bins.push({ mesh: wheelies, index: i, matrix: m.clone(), at: new THREE.Vector3(wx, 0.5, wz), shown: true });
      wheelies.setColorAt(i, new THREE.Color(WHEELIE_COLOURS[Math.floor(random() * WHEELIE_COLOURS.length)]!));
      const count = 1 + Math.floor(random() * 3);
      for (let k = 0; k < count; k++) {
        const bd = d + side * (0.55 + k * 0.42) + (random() - 0.5) * 0.1;
        const bxp = at[0] + along[0] * bd + (random() - 0.5) * 0.15;
        const bzp = at[1] + along[1] * bd + (random() - 0.5) * 0.15;
        const s = 0.85 + random() * 0.3;
        q.setFromAxisAngle(yAxis, random() * Math.PI * 2);
        m.compose(new THREE.Vector3(bxp, 0, bzp), q, new THREE.Vector3(s, s * (0.85 + random() * 0.3), s));
        this.bins.push({ mesh: bags, index: bagCount, matrix: m.clone(), at: new THREE.Vector3(bxp, 0.3, bzp), shown: true });
        bagCount++;
      }
    });
    for (const piece of this.bins) piece.mesh.setMatrixAt(piece.index, piece.matrix);
    bags.count = bagCount;
    for (const mesh of [wheelies, bags]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.add(mesh);
    }
  }

  /** Today's litter (`dailySeed`): by the bins, under the benches, in the gutters along the kerbs. */
  private layLitter(): void {
    const random = lcg(dailySeed('street-litter'));
    const count = LITTER[0] + Math.floor(random() * (LITTER[1] - LITTER[0] + 1));
    const kinds = [paperCup(), drinkCan(), paperBall(), wrapper()];
    const material = snowCovered(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }));
    const placed: { kind: number; m: THREE.Matrix4; color: THREE.Color }[] = [];
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    for (let i = 0; i < count; i++) {
      let x: number;
      let z: number;
      const where = random();
      if (where < 0.35 && this.options.bins.length > 0) {
        const [bx, bz] = this.options.bins[Math.floor(random() * this.options.bins.length)]!;
        const a = random() * Math.PI * 2;
        const r = 0.35 + random() * 0.7;
        [x, z] = [bx + Math.cos(a) * r, bz + Math.sin(a) * r];
      } else if (where < 0.55 && this.options.benches.length > 0) {
        const [bx, bz] = this.options.benches[Math.floor(random() * this.options.benches.length)]!.at;
        [x, z] = [bx + (random() - 0.5) * 1.6, bz + (random() - 0.5) * 0.5];
      } else {
        // In the gutter, against the kerb: the wind's and the sweepers' leavings.
        const side = random() < 0.5 ? -1 : 1;
        [x, z] = [-30 + random() * 66, side * (FRONT.farKerb - 0.08 - random() * 0.12)];
      }
      if (!isWalkable([x, z])) continue;
      const kind = Math.floor(random() * kinds.length);
      const y = groundHeight(x, z) > -KERB_HEIGHT / 2 ? 0 : -KERB_HEIGHT;
      // Lying on its side (cups and cans roll), any which way round.
      e.set(kind < 2 ? Math.PI / 2 : 0, random() * Math.PI * 2, 0, 'YXZ');
      q.setFromEuler(e);
      const lift = kind < 2 ? (kind === 0 ? 0.04 : 0.033) : kind === 2 ? 0.035 : 0.003;
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y + lift, z), q, new THREE.Vector3(1, 1, 1));
      placed.push({ kind, m, color: new THREE.Color(LITTER_COLOURS[Math.floor(random() * LITTER_COLOURS.length)]!) });
    }
    kinds.forEach((geometry, kind) => {
      const own = placed.filter((p) => p.kind === kind);
      if (own.length === 0) return;
      const mesh = new THREE.InstancedMesh(geometry, material, own.length);
      own.forEach((p, n) => {
        mesh.setMatrixAt(n, p.m);
        mesh.setColorAt(n, p.color);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.receiveShadow = true;
      this.litter.push(mesh);
      this.add(mesh);
    });
  }

  /** Spring's petals settled on the pavement round the trees (`GROUND.leaf`: no leaves lie in spring), more as the blossom falls. */
  private layPetals(): THREE.InstancedMesh | null {
    const season = currentSeason();
    if (season.name !== 'spring') return null;
    const settled = THREE.MathUtils.smoothstep(season.depth, 0.15, 0.6) * (1 - THREE.MathUtils.smoothstep(season.depth, 0.85, 1));
    const count = Math.round(PETALS * settled);
    if (count < 10 || this.options.trees.length === 0) return null;
    const random = lcg(dailySeed('street-petals'));
    const material = onSurface(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, side: THREE.DoubleSide }), GROUND.leaf);
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.028, 0.022).rotateX(-Math.PI / 2), material, count);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const yAxis = new THREE.Vector3(0, 1, 0);
    const color = new THREE.Color();
    let n = 0;
    for (let tries = 0; n < count && tries < count * 3; tries++) {
      const [tx, tz] = this.options.trees[Math.floor(random() * this.options.trees.length)]!;
      const a = random() * Math.PI * 2;
      // Thicker near the trunk, thinning out to the crown's edge and a little past it.
      const r = 0.7 + Math.pow(random(), 1.6) * 3.4;
      const [x, z] = [tx + Math.cos(a) * r, tz + Math.sin(a) * r];
      const y = groundHeight(x, z);
      q.setFromAxisAngle(yAxis, random() * Math.PI * 2);
      const s = 0.7 + random() * 0.7;
      mesh.setMatrixAt(n, m.compose(new THREE.Vector3(x, y + GROUND.leaf.lift, z), q, new THREE.Vector3(s, 1, s)));
      mesh.setColorAt(n, color.setRGB(0.97, 0.78 + random() * 0.16, 0.84 + random() * 0.12));
      n++;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.receiveShadow = true;
    this.add(mesh);
    return mesh;
  }
}

/** A wheelie bin: its body tapering to the foot, the lid lipping over, the handle bar, two wheels at the back. Its foot at the origin, its front +z. */
function wheelieBin(): THREE.BufferGeometry {
  const parts = [
    new THREE.CylinderGeometry(0.42, 0.36, 0.92, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 1.15).translate(0, 0.5, 0),
    new THREE.BoxGeometry(0.62, 0.05, 0.74).translate(0, 0.985, 0.01),
    new THREE.BoxGeometry(0.5, 0.04, 0.04).translate(0, 0.93, -0.36),
    ...[-1, 1].map((s) => new THREE.CylinderGeometry(0.1, 0.1, 0.05, 12).rotateZ(Math.PI / 2).translate(s * 0.27, 0.1, -0.3)),
  ];
  return mergeParts(parts);
}

/** A full black bag: a lumpy sack, its neck tied off on top. Its foot at the origin. */
function binBag(): THREE.BufferGeometry {
  const sack = new THREE.IcosahedronGeometry(1, 1);
  const pos = sack.getAttribute('position') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const r = 1 + 0.1 * Math.sin(v.x * 7) * Math.sin(v.z * 6) + (v.y < -0.5 ? -0.15 * (v.y + 0.5) : 0);
    v.multiplyScalar(r);
    // Flattened where it sits, narrowing to the neck.
    if (v.y < -0.7) v.y = -0.7;
    const neck = THREE.MathUtils.smoothstep(v.y, 0.4, 1.1);
    v.x *= 1 - 0.75 * neck;
    v.z *= 1 - 0.75 * neck;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  sack.computeVertexNormals();
  sack.scale(0.27, 0.3, 0.24).translate(0, 0.21, 0);
  const knot = new THREE.IcosahedronGeometry(0.05, 0).translate(0, 0.53, 0);
  return mergeParts([sack, knot]);
}

/** A paper cup (along y, rolled on its side when placed). */
function paperCup(): THREE.BufferGeometry {
  return mergeParts([new THREE.CylinderGeometry(0.042, 0.03, 0.11, 10, 1, true), new THREE.CylinderGeometry(0.044, 0.044, 0.006, 10).translate(0, 0.055, 0)]);
}

function drinkCan(): THREE.BufferGeometry {
  return mergeParts([new THREE.CylinderGeometry(0.033, 0.033, 0.12, 10)]);
}

function paperBall(): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(0.04, 0);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i) * (0.8 + ((i * 7) % 5) * 0.08), pos.getY(i) * 0.85, pos.getZ(i) * (0.85 + ((i * 3) % 4) * 0.07));
  g.computeVertexNormals();
  return g;
}

/** A sweet wrapper or a flattened crisp packet: a thin crumpled card lying on the ground. */
function wrapper(): THREE.BufferGeometry {
  return mergeParts([new THREE.BoxGeometry(0.11, 0.006, 0.07, 3, 1, 2).rotateY(0.3)]);
}

/** Parts merged into one geometry (non-indexed: three's polyhedra are), the parts freed. */
function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  const out = flat.length === 1 ? flat[0]!.clone() : mergeGeometries(flat);
  for (const g of new Set([...parts, ...flat])) g.dispose();
  return out;
}
