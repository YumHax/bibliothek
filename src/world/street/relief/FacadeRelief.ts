import * as THREE from 'three';
import { inHours } from '@/time/clock';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Updatable } from '@/core/Engine';
import type { HomeUpgrades } from '@/economy/HomeUpgrades';
import type { Furniture } from '../../Furniture';
import type { DayNight } from '../../props/DayNight';
import type { PaintedFront } from '../Buildings';
import type { FlatFront, ShopKind } from '../streetPlan';
import { snowCovered } from '../snowCover';
import { isShopOpen } from '../shops/shopHours';
import { afterChunk, patchShader } from '../../materials/shaderPatch';
import { BALCONY_PLAN } from '../../balcony/balconyPlan'; // imports-ok: the street shows the flat's balcony as the balcony plan lays it
import { BISTRO } from '../../balcony/BistroSet';
import { facadeHeight } from '../facadePainter';
import { FacadeFrame } from './facadeFrame';
import { TriBuilder } from './TriBuilder';
import { frontVariant } from '../shopfronts/shopfrontPlan';
import { gapAt } from '../../surface/layers';
import { lcg } from '@/random';

/** An awning: fixed to the wall at `top`, reaching `reach` out and down to `edge`, a valance `valance` deep, stripes `stripe` wide. */
const AWNING = { top: 3.0, reach: 1.05, edge: 2.48, valance: 0.2, scallop: 0.07, stripe: 0.35 };
/** How far an awning stays out rolled up (its cassette), how fast it winds (share a second), the hours it is let down (while its shop is open). */
const ROLLED = 0.06;
const WIND_SPEED = 0.18;
const AWNING_HOURS = { from: 7.5, to: 21.5 };
/** A balcony's stone slab and iron rail (metres). */
const BALCONY = { depth: 0.55, slab: 0.12, rail: 0.95, bar: 0.12, farBar: 0.22 };
/** A door surround: jambs and head standing out of the wall, so the door looks set back in it; the step before a residents' door. */
const SURROUND = { width: 0.12, depth: 0.08, head: 0.14 };
const STEP = { height: 0.14, depth: 0.32, wider: 0.5 };
/** A downpipe: its radius, how far off the wall, the brackets' spacing. */
const DOWNPIPE = { radius: 0.05, out: 0.08, bracket: 1.8 };
/** Facades painted at least this finely (px per metre) get the small relief (fine bars, things on the balconies). */
const FINE = 20;
const IRON = 0x23262a;
const PIPE = '#3e4244';
const POTS = ['#b8643a', '#a85a36', '#e8e2d8', '#6a5a4a', '#3a4a3a'];
const PIPE_GEOMETRY = new THREE.CylinderGeometry(DOWNPIPE.radius, DOWNPIPE.radius, 1, 8);
const scaled = new THREE.Matrix4();
const moved = new THREE.Matrix4();

export interface FacadeReliefOptions {
  /** What has been bought for the flat: our balcony shows its plants and the bistro set only once they are. None: all of it. */
  upgrades?: HomeUpgrades;
  /** The clock: the awnings roll up at closing and at night. None: they stay down. */
  dayNight?: DayNight;
}

/**
 * What stands out of the street's painted facades, built from what `paintFacade` left for it
 * (`Buildings.fronts`), each kind of thing merged into one mesh (a draw call per material for the
 * whole street): the shops' striped awnings (canvas both sides, a scalloped valance, casting their
 * shade on the pavement; let down while the shop is open by day, wound up into their cassettes at
 * closing and at night), the balcony rows' stone slabs and wrought-iron rails with the residents'
 * pots, a chair, a table (the windows of the near facades are `Buildings`' own, `facadeWindows/`), stone surrounds that set the doors
 * back into the wall and the step before the residents' doors, the downpipes from the gutters, and
 * our own flat's balcony on the top floor of our building, with the plants and the bistro set once
 * they are bought, so the player looking up from the street finds home as they left it. Snow
 * settles on all of it (`snowCovered`). Decoration: nothing here collides (all of it is overhead or
 * flush with the building line).
 */
export class FacadeRelief extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  private readonly awnings: { kind: PaintedFront['features']['awnings'][number]['kind']; out: number }[] = [];
  private readonly awningOut: THREE.Vector4[] = [];
  private readonly upgrades: HomeUpgrades | undefined;
  private readonly dayNight: DayNight | undefined;
  /** Our balcony's plants (drawn up to the count bought: `ends[n]` is where the n-th ends) and its bistro set. */
  private readonly flatPlants: { mesh: THREE.Mesh; ends: number[] } | null = null;
  private readonly bistro: THREE.Mesh | null = null;

  constructor(fronts: readonly PaintedFront[], options: FacadeReliefOptions = {}) {
    super();
    this.name = 'FacadeRelief';
    this.upgrades = options.upgrades;
    this.dayNight = options.dayNight;
    const awnings: { geometry: THREE.BufferGeometry; frame: FacadeFrame; out: number }[] = [];
    const stone = new TriBuilder();
    const iron = new TriBuilder();
    const props = new TriBuilder();
    const plants = new TriBuilder();
    const bistro = new TriBuilder();
    const plantEnds: number[] = [];
    // What stands on the pavement or against a wall loses the faces pressed on them (never seen). Not our balcony's
    // plants: they show one by one by their vertex ranges (`plantEnds`), which leaving faces out would shift.
    const culled = [stone, iron, props, bistro];
    for (const builder of culled) builder.hideGround();
    for (const front of fronts) {
      const frame = new FacadeFrame(front.spec);
      const fine = front.spec.detail >= FINE;
      const m = frame.matrix(0, 0);
      const { features } = front;
      const wall = frame.wall(facadeHeight(front.spec.storeys));
      for (const builder of culled) builder.hideAgainst(...wall);
      for (const a of features.awnings) {
        const canvas = new TriBuilder();
        const out = a.out ?? 0;
        awning(canvas, out ? frame.matrix(0, 0, out) : m, a.s0, a.s1, a.colors);
        awnings.push({ geometry: canvas.build(), frame, out });
        this.awnings.push({ kind: a.kind, out: 1 });
      }
      const slab = new THREE.Color(features.trim).multiplyScalar(0.86);
      const random = lcg(front.spec.seed * 613 + 5);
      for (const b of features.balconies) {
        balcony(stone, iron, m, b.s0, b.s1, b.y, BALCONY.depth, slab, fine ? BALCONY.bar : BALCONY.farBar);
        // What stands on its slab loses its foot (pressed on the slab, never seen).
        props.hideAgainst(new THREE.Vector3(0, 1, 0), frame.point(b.s0, b.y), new THREE.Box3().setFromPoints([frame.point(b.s0, b.y, 0), frame.point(b.s1, b.y, BALCONY.depth)]));
        if (fine) dressBalcony(props, m, b.s0, b.s1, b.y, random);
      }
      const shaded = features.shopfronts.filter((f) => f.awning);
      for (const door of features.doors) {
        if (door.step) stone.box(m, door.s, STEP.height / 2, STEP.depth / 2, door.width + STEP.wider, STEP.height, STEP.depth, new THREE.Color(features.trim).multiplyScalar(0.82));
        // A door under an awning keeps flat: its shutter and the awning leave no room for a surround.
        if (door.shop && shaded.some((f) => door.s > f.s0 && door.s < f.s1)) continue;
        // A front built in 3D frames its own door (`shopfronts/`): set back between a walk-in shop's windows' returns,
        // in a plain front's surround.
        if (door.shop && features.shopfronts.some((f) => isFramed(front.spec.detail, f.kind) && door.s > f.s0 && door.s < f.s1)) continue;
        surround(stone, m, door.s, door.width, door.height, door.shop ? door.color : features.trim);
      }
      if (features.downpipe !== null) downpipe(props, m, features.downpipe, features.cornice);
      if (front.spec.flat?.balcony) flatBalcony(stone, iron, plants, plantEnds, bistro, m, front.spec.flat.floorY, front.spec.flat.balcony, slab);
    }

    const solid = (builder: TriBuilder, material: THREE.MeshStandardMaterial): THREE.Mesh | null => {
      if (builder.isEmpty) {
        material.dispose();
        return null;
      }
      const mesh = new THREE.Mesh(builder.build(), snowCovered(material));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.add(mesh);
      return mesh;
    };
    solid(stone, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
    solid(iron, new THREE.MeshStandardMaterial({ color: IRON, roughness: 0.5 }));
    solid(props, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }));
    const plantMesh = solid(plants, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }));
    if (plantMesh) this.flatPlants = { mesh: plantMesh, ends: plantEnds };
    this.bistro = solid(bistro, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }));
    if (awnings.length) this.add(this.awningMesh(awnings));
    this.update(0);
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  update(dt: number): void {
    const upgrades = this.upgrades;
    if (this.flatPlants) {
      const shown = upgrades ? Math.min(upgrades.count('plant'), this.flatPlants.ends.length) : this.flatPlants.ends.length;
      this.flatPlants.mesh.visible = shown > 0;
      this.flatPlants.mesh.geometry.setDrawRange(0, shown > 0 ? this.flatPlants.ends[shown - 1]! : 0);
    }
    if (this.bistro) this.bistro.visible = !upgrades || upgrades.has('bistroSet');
    const s = this.dayNight?.state;
    if (!s) return;
    const hours = s.hours;
    // At once when first seen, then wound at the crank's pace.
    const step = dt <= 0 ? Infinity : dt * WIND_SPEED;
    this.awnings.forEach((a, i) => {
      const down = inHours(hours, AWNING_HOURS) && isShopOpen(a.kind, hours) ? 1 : ROLLED;
      a.out += THREE.MathUtils.clamp(down - a.out, -step, step);
      this.awningOut[i >> 2]!.setComponent(i & 3, a.out);
    });
  }

  /**
   * Every awning in one mesh, each folding towards its fixing on the wall (`aPivot`, the top's line right behind each
   * corner) by its own share (`awningOut`, four to a vector), in its shadow too.
   */
  private awningMesh(awnings: readonly { geometry: THREE.BufferGeometry; frame: FacadeFrame; out: number }[]): THREE.Mesh {
    const p = new THREE.Vector3();
    const pivot = new THREE.Vector3();
    awnings.forEach(({ geometry, frame, out }, i) => {
      const position = geometry.getAttribute('position');
      const pivots = new Float32Array(position.count * 3);
      const index = new Float32Array(position.count).fill(i);
      const [ax, az] = frame.spec.from;
      for (let v = 0; v < position.count; v++) {
        p.fromBufferAttribute(position, v);
        const s = (p.x - ax) * frame.u.x + (p.z - az) * frame.u.y;
        frame.point(s, AWNING.top, out, pivot);
        pivots.set([pivot.x, pivot.y, pivot.z], v * 3);
      }
      geometry.setAttribute('aPivot', new THREE.BufferAttribute(pivots, 3));
      geometry.setAttribute('aAwning', new THREE.BufferAttribute(index, 1));
    });
    const merged = mergeGeometries(awnings.map((a) => a.geometry))!;
    for (const a of awnings) a.geometry.dispose();
    for (let i = 0; i < Math.ceil(awnings.length / 4); i++) this.awningOut.push(new THREE.Vector4(1, 1, 1, 1));
    const out = { value: this.awningOut };
    // The array's length is in the source: each length its own program, or a street and a window's view (fewer awnings)
    // would share one and three.js would read past the shorter array (`array[i] is undefined` in `setValueV4fArray`).
    const fold = (material: THREE.Material, key: string): THREE.Material =>
      patchShader(material, `${key}${this.awningOut.length}`, (shader) => {
        shader.uniforms.awningOut = out;
        shader.vertexShader =
          `attribute vec3 aPivot;\nattribute float aAwning;\nuniform vec4 awningOut[${this.awningOut.length}];\n` +
          afterChunk(shader.vertexShader, 'begin_vertex', 'int awningAt = int(aAwning + 0.5);\ntransformed = mix(aPivot, transformed, awningOut[awningAt / 4][awningAt - (awningAt / 4) * 4]);');
      });
    const mesh = new THREE.Mesh(merged, fold(snowCovered(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 })), 'awningFold'));
    mesh.customDepthMaterial = fold(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), 'awningFoldDepth') as THREE.MeshDepthMaterial;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = 'Awnings';
    return mesh;
  }
}

/**
 * The dry space under every awning of `fronts` nearer than `within` metres (along x) to the walkable
 * street's middle (zone-local boxes, from the wall out to the valance, the pavement up to the canvas):
 * where the rain and snow do not fall (`Precipitation`).
 */
export function awningShelters(fronts: readonly PaintedFront[], within = 45): THREE.Box3[] {
  const boxes: THREE.Box3[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  for (const front of fronts) {
    const frame = new FacadeFrame(front.spec);
    for (const awning of front.features.awnings) {
      frame.point(awning.s0, -0.5, 0, a);
      frame.point(awning.s1, AWNING.top, (awning.out ?? 0) + AWNING.reach, b);
      const box = new THREE.Box3().setFromPoints([a, b]);
      if (Math.abs((box.min.x + box.max.x) / 2) < within) boxes.push(box);
    }
  }
  return boxes;
}

/**
 * A striped awning from s0 to s1: the sloping canvas (a darker underside), the valance hanging off
 * its front edge with a scallop under each stripe, and a cheek at each end.
 */
function awning(b: TriBuilder, m: THREE.Matrix4, s0: number, s1: number, [a, c]: readonly [string, string]): void {
  const { top, reach, edge, valance, scallop, stripe } = AWNING;
  const under = (hex: string): THREE.Color => new THREE.Color(hex).multiplyScalar(0.62);
  const back = 0.02;
  const low = edge - valance;
  for (let s = s0, i = 0; s < s1 - 0.01; s += stripe, i++) {
    const e = Math.min(s + stripe, s1);
    const color = i % 2 ? c : a;
    // Canvas, top then underside (the quad's back).
    b.quad(m, [s, top, back], [s, edge, reach], [e, edge, reach], [e, top, back], color, true, under(color));
    // Valance, front and back, with its scallop.
    b.quad(m, [s, low, reach], [e, low, reach], [e, edge, reach], [s, edge, reach], color, true, under(color));
    const mid = (s + e) / 2;
    b.triangle(m, [s, low, reach], [mid, low - scallop, reach], [e, low, reach], color);
    b.triangle(m, [s, low, reach], [e, low, reach], [mid, low - scallop, reach], under(color));
  }
  // The cheeks at the ends: triangles from the wall to the front edge.
  b.triangle(m, [s0, top, back], [s0, edge, back + 0.01], [s0, edge, reach], a);
  b.triangle(m, [s0, top, back], [s0, edge, reach], [s0, edge, back + 0.01], under(a));
  b.triangle(m, [s1, top, back], [s1, edge, reach], [s1, edge, back + 0.01], a);
  b.triangle(m, [s1, top, back], [s1, edge, back + 0.01], [s1, edge, reach], under(a));
}

/** A balcony across s0..s1 with its floor at `y`: the stone slab, the rail along the front and the two returns to the wall. */
function balcony(stone: TriBuilder, iron: TriBuilder, m: THREE.Matrix4, s0: number, s1: number, y: number, depth: number, slab: THREE.Color, pitch: number): void {
  const { slab: thick, rail } = BALCONY;
  const w = s1 - s0;
  const mid = (s0 + s1) / 2;
  stone.box(m, mid, y - thick / 2, depth / 2, w + 0.06, thick, depth + 0.04, slab);
  const front = depth - 0.03;
  railing(iron, m, [s0, front], [s1, front], y, rail, pitch);
  railing(iron, m, [s0, 0], [s0, front], y, rail, pitch);
  railing(iron, m, [s1, front], [s1, 0], y, rail, pitch);
}

/** How far apart two faces of a heap of boxes stay (a balcony's pots and leaves, seen from across the street). */
const HEAP_GAP = gapAt(60);

/**
 * Boxes heaped at random (a plant's leaves, a balcony's pots): a box whose faces would lie within `HEAP_GAP` of
 * another's, the same way, is grown on that axis until clear (one mesh: two faces in a plane would fight). What stands
 * on the `floor` keeps its foot there (pressed on the floor, never seen).
 */
class Heap {
  /** Per axis (s, y, out), the planes of the boxes' low and high faces so far. */
  private readonly planes: [number[], number[]][] = [[[], []], [[], []], [[], []]];

  constructor(
    readonly b: TriBuilder,
    private readonly floor: number,
  ) {}

  box(m: THREE.Matrix4, x: number, y: number, z: number, w: number, h: number, d: number, color: THREE.ColorRepresentation): void {
    const centre = [x, y, z];
    const size = [w, h, d];
    for (let axis = 0; axis < 3; axis++) {
      const [low, high] = this.planes[axis]!;
      const foot = (p: number): boolean => axis === 1 && Math.abs(p - this.floor) < HEAP_GAP;
      const clashes = (): boolean => {
        const [a, b] = [centre[axis]! - size[axis]! / 2, centre[axis]! + size[axis]! / 2];
        return (!foot(a) && low.some((p) => Math.abs(p - a) < HEAP_GAP)) || high.some((p) => Math.abs(p - b) < HEAP_GAP);
      };
      for (let tries = 0; tries < 4 && clashes(); tries++) {
        // Grown about its middle, or upwards from a foot on the floor.
        if (foot(centre[axis]! - size[axis]! / 2)) centre[axis]! += HEAP_GAP;
        size[axis]! += 2 * HEAP_GAP;
      }
      low.push(centre[axis]! - size[axis]! / 2);
      high.push(centre[axis]! + size[axis]! / 2);
    }
    this.b.box(m, centre[0]!, centre[1]!, centre[2]!, size[0]!, size[1]!, size[2]!, color);
  }
}

/** What the residents keep on a balcony: a few pots of greenery, now and then a folding chair or a little table. */
function dressBalcony(props: TriBuilder, m: THREE.Matrix4, s0: number, s1: number, y: number, random: () => number): void {
  if (random() < 0.4) return;
  const heap = new Heap(props, y);
  for (let i = 1 + Math.floor(random() * 3); i > 0; i--) {
    const s = s0 + 0.25 + random() * Math.max(0.1, s1 - s0 - 0.5);
    plant(heap, m, s, y, 0.2 + random() * 0.12, POTS[Math.floor(random() * POTS.length)]!, random, 0.18 + random() * 0.1);
  }
  if (random() < 0.3) {
    const s = s0 + 0.5 + random() * Math.max(0.1, s1 - s0 - 1);
    const paint = random() < 0.5 ? '#2f4a3e' : '#e8e4dc';
    heap.box(m, s, y + 0.44, 0.27, 0.36, 0.03, 0.32, paint);
    heap.box(m, s, y + 0.7, 0.1, 0.36, 0.42, 0.03, paint);
    for (const [ds, dz] of [[-0.15, 0.12], [0.15, 0.12], [-0.15, 0.42], [0.15, 0.42]] as const) heap.box(m, s + ds, y + 0.22, dz, 0.025, 0.44, 0.025, paint);
  }
}

/** A pot (a box `size` across, of `color`) with leaves heaped over it, at s on a floor at y, `out` from the wall. */
function plant(b: Heap, m: THREE.Matrix4, s: number, y: number, out: number, color: string, random: () => number, size = 0.26): void {
  b.box(m, s, y + size * 0.55, out, size, size * 1.1, size, color);
  for (let i = 0; i < 5; i++) {
    const g = new THREE.Color().setHSL(0.26 + random() * 0.08, 0.45, 0.26 + random() * 0.12);
    const [ls, ly, lo] = [s + (random() - 0.5) * size * 0.85, y + size * 1.4 + random() * size, out + (random() - 0.5) * size * 0.85];
    const [w, h, d] = [size * (0.6 + random() * 0.3), size * 0.75, size * (0.6 + random() * 0.3)];
    // Each clump turned and tipped its own way: no two leaves' faces parallel, so none in one plane (and less boxy).
    leaf.makeRotationFromEuler(tilt.set(((i % 3) - 1) * 0.16, i * 1.37 + size * 9 + s * 5, ((i % 2) - 0.5) * 0.2)).setPosition(ls, ly, lo).premultiply(m);
    b.b.box(leaf, 0, 0, 0, w, h, d, g);
  }
}
const leaf = new THREE.Matrix4();
const tilt = new THREE.Euler();

/** A wrought-iron rail from a to b (facade (s, out) points) over a floor at `y`: top and bottom rails, bars every `pitch`. */
function railing(iron: TriBuilder, m: THREE.Matrix4, a: readonly [number, number], b: readonly [number, number], y: number, height: number, pitch: number): void {
  const [s0, o0] = a;
  const [s1, o1] = b;
  const length = Math.hypot(s1 - s0, o1 - o0);
  const alongS = Math.abs(s1 - s0) > Math.abs(o1 - o0);
  const cs = (s0 + s1) / 2;
  const co = (o0 + o1) / 2;
  const rw = alongS ? length : 0.035;
  const rd = alongS ? 0.035 : length;
  iron.box(m, cs, y + height - 0.02, co, rw, 0.04, rd, IRON);
  iron.box(m, cs, y + 0.06, co, rw, 0.03, rd, IRON);
  const bars = Math.max(1, Math.round(length / pitch));
  for (let i = 0; i <= bars; i++) {
    const t = i / bars;
    iron.box(m, s0 + (s1 - s0) * t, y + height / 2, o0 + (o1 - o0) * t, 0.018, height, 0.018, IRON);
  }
}

/** Jambs and a head standing out of the wall round a door `width` wide and `height` tall at s. */
function surround(stone: TriBuilder, m: THREE.Matrix4, s: number, width: number, height: number, color: THREE.ColorRepresentation): void {
  const { width: jw, depth, head } = SURROUND;
  for (const side of [-1, 1]) stone.box(m, s + side * (width / 2 + jw / 2), (height + head) / 2, depth / 2, jw, height + head, depth, color);
  stone.box(m, s, height + head / 2, depth / 2, width + 2 * jw, head, depth, color);
}

/** A cast-iron downpipe at s from its hopper under the cornice (`top`) down to its shoe on the pavement, on brackets. */
function downpipe(props: TriBuilder, m: THREE.Matrix4, s: number, top: number): void {
  const { radius, out, bracket } = DOWNPIPE;
  const bottom = 0.2;
  const length = top - 0.3 - bottom;
  scaled.makeScale(1, length, 1);
  moved.makeTranslation(s, bottom + length / 2, out).premultiply(m).multiply(scaled);
  props.geometry(moved, PIPE_GEOMETRY, PIPE);
  // The hopper head under the gutter, the shoe turned out at the foot.
  props.box(m, s, top - 0.2, out, 0.2, 0.22, 0.18, PIPE);
  // (Its top 2 cm over a shop's plinth's, where the pipe comes down by a front: never in one plane with it.)
  props.box(m, s, bottom + 0.05, out + 0.05, radius * 2.2, 0.14, radius * 3.2, PIPE);
  for (let y = bottom + 0.6; y < top - 0.4; y += bracket) props.box(m, s, y, out / 2, radius * 2.6, 0.05, out, PIPE);
}

/**
 * Our flat's balcony, as `BALCONY_PLAN` has it: a stone slab `depth` deep with a lip, the rail on its three open
 * sides, the potted plants where the florist's stand once bought (into `plants`, each one's end in `ends`, in the order
 * they come home) and the little bistro table with its two chairs (into `bistro`). Balcony-local x across, z out from
 * the slab's middle.
 */
function flatBalcony(stone: TriBuilder, iron: TriBuilder, plants: TriBuilder, ends: number[], bistro: TriBuilder, m: THREE.Matrix4, y: number, b: NonNullable<FlatFront['balcony']>, slab: THREE.Color): void {
  const s0 = b.at - b.width / 2;
  const s1 = b.at + b.width / 2;
  const { thickness, lip } = BALCONY_PLAN.slab;
  const { height: rail, barSpacing } = BALCONY_PLAN.railing;
  stone.box(m, b.at, y - thickness / 2, (b.depth + lip) / 2, b.width + 2 * lip, thickness, b.depth + lip, slab);
  railing(iron, m, [s0, b.depth], [s1, b.depth], y, rail, barSpacing);
  railing(iron, m, [s0, 0], [s0, b.depth], y, rail, barSpacing);
  railing(iron, m, [s1, b.depth], [s1, 0], y, rail, barSpacing);
  const random = lcg(2121);
  // Balcony-local (x, z) -> facade (s, out): z is measured from the slab's middle.
  const at = (x: number, z: number): [number, number] => [b.at + x, b.depth / 2 + z];
  // The florist's pots in the order they come home: the three of `boughtPlants`, then the two of its decor.
  const spots: { floor: readonly [number, number]; pot: string }[] = [
    ...BALCONY_PLAN.boughtPlants.map((spot) => ({ floor: spot.floor, pot: spot.pot === 'terracotta' ? '#b8643a' : '#e8e2d8' })),
    ...BALCONY_PLAN.decor.flatMap((entry) => {
      const floor = 'floor' in entry.at ? (entry.at.floor as readonly [number, number]) : null;
      if (entry.kind !== 'plant' || !floor) return [];
      return [{ floor, pot: (entry.options as { pot?: string } | undefined)?.pot === 'terracotta' ? '#b8643a' : '#e8e2d8' }];
    }),
  ];
  const heap = new Heap(plants, y);
  for (const spot of spots) {
    const [s, o] = at(spot.floor[0], spot.floor[1]);
    plant(heap, m, s, y, o, spot.pot, random);
    ends.push(plants.vertexCount);
  }
  // The bistro set: a round-ish table on its stem, a chair either side.
  const [ts, to] = at(...BALCONY_PLAN.bistro.floor);
  const green = `#${BISTRO.color.toString(16).padStart(6, '0')}`;
  const top = BISTRO.topRadius * 1.86;
  bistro.box(m, ts, y + BISTRO.topHeight, to, top, 0.02, top, green);
  bistro.box(m, ts, y + 0.36, to, 0.04, 0.7, 0.04, green);
  bistro.box(m, ts, y + 0.015, to, 0.36, 0.03, 0.36, green);
  for (const side of [-1, 1]) {
    const cs = ts + side * BISTRO.chairX;
    bistro.box(m, cs, y + 0.45, to, 0.38, 0.03, 0.38, green);
    bistro.box(m, cs + side * 0.18, y + 0.68, to, 0.03, 0.46, 0.36, green);
    for (const [dx, dz] of [[-0.16, -0.16], [0.16, -0.16], [-0.16, 0.16], [0.16, 0.16]] as const) bistro.box(m, cs + dx, y + 0.22, to + dz, 0.025, 0.44, 0.025, green);
  }
}

/** Whether a shop's front is built with its door framed in it (a plain front, a walk-in shop's). */
function isFramed(detail: number, kind: ShopKind): boolean {
  const variant = frontVariant(detail, kind);
  return variant === 'plain' || variant === 'walkIn';
}
