import * as THREE from 'three';
import { paint, shared } from '../../materials/palette';
import { foliage } from '../../materials/finishes';
import { markShared } from '../../materials/sharedResources';

/*
 * The florist's leaves, stems and flower heads, built cheap: a leaf is a folded diamond of four triangles baked
 * straight into one geometry per green (`LeafBatch`), since the foliage material is shader-patched and the static merge
 * leaves turned parts of such a material alone. Stems and heads are plain paint: they merge by colour with the rest.
 */

/** The greens the florist's leaves come in, one shared material each (the same keys as `props/Plant`'s, so they share). */
export const LEAF_GREENS = {
  classic: [0x3f7a3a, 0x4d8b3f, 0x336b33],
  lime: [0x5f9a3c, 0x6fa844, 0x7db04a],
  deep: [0x2f5e2c, 0x27512a, 0x386b33],
  /** Eucalyptus and dried stems: a dusty sage. */
  sage: [0x7f9a86, 0x6f8a78],
} as const;

function leafMaterial(color: number, roughness = 0.65): THREE.MeshStandardMaterial {
  return shared(`foliage|${color}|${roughness}`, () => foliage({ color, roughness }));
}

const Y = new THREE.Vector3(0, 1, 0);
const q = new THREE.Quaternion();
const roll = new THREE.Quaternion();
const m = new THREE.Matrix4();
const s = new THREE.Vector3();

/**
 * Leaves collected by colour and baked into one mesh per colour (`addTo`): each a diamond from its base along its
 * direction, widest a little below the middle, its halves folded up along the midrib.
 */
export class LeafBatch {
  private readonly byColour = new Map<number, number[]>();

  constructor(private readonly roughness = 0.65) {}

  /** A leaf from `base` towards `dir` (need not be unit), `length` long and `width` wide, turned `twist` about its midrib. */
  leaf(color: number, base: THREE.Vector3, dir: THREE.Vector3, length: number, width: number, twist = 0, fold = 0.25): void {
    q.setFromUnitVectors(Y, s.copy(dir).normalize());
    roll.setFromAxisAngle(Y, twist);
    q.multiply(roll);
    m.compose(base, q, s.set(1, 1, 1));
    const w = width / 2;
    const f = w * fold;
    const b = new THREE.Vector3(0, 0, 0).applyMatrix4(m);
    const l = new THREE.Vector3(-w, length * 0.4, f).applyMatrix4(m);
    const r = new THREE.Vector3(w, length * 0.4, f).applyMatrix4(m);
    const mid = new THREE.Vector3(0, length * 0.45, 0).applyMatrix4(m);
    const t = new THREE.Vector3(0, length, 0).applyMatrix4(m);
    let list = this.byColour.get(color);
    if (!list) this.byColour.set(color, (list = []));
    for (const [a, c, d] of [[b, l, mid], [b, mid, r], [l, t, mid], [mid, t, r]] as const) list.push(a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
  }

  /** Adds one mesh per colour to `parent` (in `parent`'s frame, the frame the leaves were given in). */
  addTo(parent: THREE.Object3D): void {
    for (const [color, positions] of this.byColour) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, leafMaterial(color, this.roughness));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
    }
    this.byColour.clear();
  }
}

/** Picks one of `list` with `random`. */
export function pick<T>(random: () => number, list: readonly T[]): T {
  return list[Math.floor(random() * list.length)]!;
}

/** A thin stem (a box: it merges by colour however it is turned) from `a` to `b`. */
export function stem(parent: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, material: THREE.Material, thick = 0.006): void {
  const length = a.distanceTo(b);
  if (length < 1e-4) return;
  const mesh = new THREE.Mesh(STEM_BOX, material);
  mesh.scale.set(thick, length, thick);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(Y, s.copy(b).sub(a).normalize());
  parent.add(mesh);
}

/** The unit box every stem scales: shared, never edited. */
const STEM_BOX = markShared(new THREE.BoxGeometry(1, 1, 1));

/** One unit sphere per prop for its flower heads (scaled per head; the merge still makes one draw per colour). */
export function headGeometry(): THREE.SphereGeometry {
  return new THREE.SphereGeometry(1, 9, 7);
}

/** What a bunch of cut flowers is made of. */
interface BunchOptions {
  /** The heads' colours (a bunch of one colour: one entry). */
  colors: readonly number[];
  /** How many stems. Default 9. */
  stems?: number;
  /** Stem height above `at`, and the spread of the heads at the top (radius). */
  height?: number;
  spread?: number;
  /** Head radius. Default 0.028. */
  head?: number;
  /** A leaf or two per stem, in this green. Default classic. */
  green?: number;
}

const STEM_PAINT = (): THREE.MeshStandardMaterial => paint(0x4a7a3a, 0.7);

/**
 * A bunch of cut flowers standing in something at `at` (the water's surface, parent-local): the stems fanning out
 * from a point just below it, a head on each (roses round, tulips taller than wide), a leaf or two low on the stems.
 */
export function addBunch(parent: THREE.Object3D, leaves: LeafBatch, head: THREE.BufferGeometry, at: THREE.Vector3, o: BunchOptions, random: () => number): void {
  const stems = o.stems ?? 9;
  const height = o.height ?? 0.34;
  const spread = o.spread ?? 0.09;
  const size = o.head ?? 0.028;
  const green = o.green ?? LEAF_GREENS.classic[0];
  const stemPaint = STEM_PAINT();
  const root = new THREE.Vector3(at.x, at.y - 0.08, at.z);
  const tip = new THREE.Vector3();
  for (let i = 0; i < stems; i++) {
    const a = (i / stems) * Math.PI * 2 + random() * 0.8;
    const d = spread * (0.35 + 0.65 * Math.sqrt(random()));
    tip.set(at.x + Math.cos(a) * d, at.y + height * (0.8 + random() * 0.3), at.z + Math.sin(a) * d);
    stem(parent, root, tip, stemPaint, 0.005);
    const bloom = new THREE.Mesh(head, paint(pick(random, o.colors), 0.6));
    const r = size * (0.85 + random() * 0.3);
    bloom.position.copy(tip);
    bloom.scale.set(r, r * (0.9 + random() * 0.5), r);
    bloom.castShadow = true;
    parent.add(bloom);
    if (random() < 0.6) {
      const base = new THREE.Vector3().lerpVectors(root, tip, 0.35 + random() * 0.2);
      const out = new THREE.Vector3(Math.cos(a) * 0.6, 0.8, Math.sin(a) * 0.6);
      leaves.leaf(green, base, out, 0.07 + random() * 0.04, 0.025, random() * Math.PI);
    }
  }
}

/** A trailing vine from `from`, falling `length` with a wander, heart-shaped leaves along it (pothos, ivy). */
export function addTrail(parent: THREE.Object3D, leaves: LeafBatch, from: THREE.Vector3, length: number, random: () => number, greens: readonly number[] = LEAF_GREENS.lime, leafSize = 0.045, out = new THREE.Vector3(0, 0, 1)): void {
  const vine = paint(0x5a7a3a, 0.7);
  const steps = Math.max(3, Math.round(length / 0.07));
  const p = from.clone();
  const drift = new THREE.Vector3((random() - 0.5) * 0.02, 0, (random() - 0.5) * 0.02);
  for (let i = 0; i < steps; i++) {
    // Out a little over the edge first, then straight down, swaying.
    const k = i / steps;
    const next = p.clone().add(new THREE.Vector3(out.x * 0.02 * (1 - k) + drift.x + (random() - 0.5) * 0.015, -length / steps, out.z * 0.02 * (1 - k) + drift.z + (random() - 0.5) * 0.015));
    stem(parent, p, next, vine, 0.004);
    const side = i % 2 === 0 ? 1 : -1;
    const dir = new THREE.Vector3(side * 0.8 + out.x * 0.4, -0.35 - random() * 0.3, out.z * 0.6 + (random() - 0.5) * 0.6);
    const size = leafSize * (1 - k * 0.45) * (0.8 + random() * 0.4);
    leaves.leaf(pick(random, greens), next, dir, size, size * 0.8, random() * Math.PI, 0.35);
    p.copy(next);
  }
}

/** A fern: arching fronds from a crown at `at`, each a midrib of leaflet pairs shrinking to its tip. */
export function addFern(parent: THREE.Object3D, leaves: LeafBatch, at: THREE.Vector3, size: number, random: () => number, out = new THREE.Vector3(0, 0, 1), green: number = LEAF_GREENS.lime[1]): void {
  const fronds = 6 + Math.floor(random() * 3);
  const rib = paint(0x4a7a3a, 0.7);
  for (let f = 0; f < fronds; f++) {
    const a = (f / fronds) * Math.PI * 2 + random() * 0.5;
    // Fronds lean out of the wall more than into it.
    const lean = new THREE.Vector3(Math.cos(a) * 0.8 + out.x * 0.7, 0.9, Math.sin(a) * 0.8 + out.z * 0.7).normalize();
    const length = size * (0.7 + random() * 0.4);
    const pairs = 7;
    let p = at.clone();
    const dir = lean.clone();
    for (let i = 0; i < pairs; i++) {
      const k = i / pairs;
      // The frond arches over: its direction tips down as it goes.
      dir.y -= 0.28;
      dir.normalize();
      const next = p.clone().addScaledVector(dir, length / pairs);
      stem(parent, p, next, rib, 0.003);
      const side = new THREE.Vector3().crossVectors(dir, Y).normalize();
      const leaflet = length * 0.24 * (1 - k * 0.7);
      for (const sgn of [1, -1]) leaves.leaf(green, next, side.clone().multiplyScalar(sgn).addScaledVector(dir, 0.5), leaflet, leaflet * 0.35, 0, 0.1);
      p = next;
    }
  }
}

