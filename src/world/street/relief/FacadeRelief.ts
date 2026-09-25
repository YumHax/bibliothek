import * as THREE from 'three';
import { seededRandom } from '@/covers/generated/canvasUtils';
import type { Furniture } from '../../Furniture';
import type { PaintedFront } from '../Buildings';
import type { FlatFront } from '../streetPlan';
import { snowCovered } from '../snowCover';
import { FacadeFrame } from './facadeFrame';
import { TriBuilder } from './TriBuilder';

/** An awning: fixed to the wall at `top`, reaching `reach` out and down to `edge`, a valance `valance` deep, stripes `stripe` wide. */
const AWNING = { top: 3.0, reach: 1.05, edge: 2.48, valance: 0.2, scallop: 0.07, stripe: 0.35 };
/** A balcony's stone slab and iron rail (metres). */
const BALCONY = { depth: 0.55, slab: 0.12, rail: 0.95, bar: 0.12, farBar: 0.22 };
/** A door surround: jambs and head standing out of the wall, so the door looks set back in it. */
const SURROUND = { width: 0.12, depth: 0.08, head: 0.14 };
/** Facades painted at least this finely (px per metre) get the small relief (sills, fine bars). */
const FINE = 20;
const IRON = 0x23262a;

/**
 * What stands out of the street's painted facades, built from what `paintFacade` left for it
 * (`Buildings.fronts`), each kind of thing merged into one mesh (a draw call per material for the
 * whole street): the shops' striped awnings (canvas both sides, a scalloped valance, casting their
 * shade on the pavement), the balcony rows' stone slabs and wrought-iron rails, the window sills on
 * the near facades, stone surrounds that set the doors back into the wall, and our own flat's
 * balcony on the top floor of our building, with its two plants and the bistro set, so the player
 * looking up from the street finds home. Snow settles on all of it (`snowCovered`). Decoration:
 * nothing here collides (all of it is overhead or flush with the building line).
 */
export class FacadeRelief extends THREE.Group implements Furniture {
  readonly contactShadow = false;

  constructor(fronts: readonly PaintedFront[]) {
    super();
    this.name = 'FacadeRelief';
    const canvas = new TriBuilder();
    const stone = new TriBuilder();
    const iron = new TriBuilder();
    const props = new TriBuilder();
    for (const front of fronts) {
      const frame = new FacadeFrame(front.spec);
      const fine = front.spec.detail >= FINE;
      const m = frame.matrix(0, 0);
      const { features } = front;
      for (const a of features.awnings) awning(canvas, m, a.s0, a.s1, a.colors);
      const slab = new THREE.Color(features.trim).multiplyScalar(0.86);
      for (const b of features.balconies) balcony(stone, iron, m, b.s0, b.s1, b.y, BALCONY.depth, slab, fine ? BALCONY.bar : BALCONY.farBar);
      if (fine) {
        for (const s of features.sills) stone.box(m, (s.s0 + s.s1) / 2, s.y - 0.045, 0.05, s.s1 - s.s0, 0.07, 0.1, features.trim);
      }
      const awnings = features.shopfronts.filter((f) => f.awning);
      for (const door of features.doors) {
        // A door under an awning keeps flat: its shutter and the awning leave no room for a surround.
        if (door.shop && awnings.some((f) => door.s > f.s0 && door.s < f.s1)) continue;
        surround(stone, m, door.s, door.width, door.height, door.shop ? door.color : features.trim);
      }
      if (front.spec.flat) flatBalcony(stone, iron, props, m, front.spec.flat, slab);
    }

    const materials: [TriBuilder, THREE.MeshStandardMaterial][] = [
      [canvas, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 })],
      [stone, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })],
      [iron, new THREE.MeshStandardMaterial({ color: IRON, roughness: 0.5, metalness: 0.55 })],
      [props, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 })],
    ];
    for (const [builder, material] of materials) {
      if (builder.isEmpty) {
        material.dispose();
        continue;
      }
      const mesh = new THREE.Mesh(builder.build(), snowCovered(material));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.add(mesh);
    }
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }
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

/**
 * Our flat's balcony, as `BALCONY_PLAN` has it: a stone slab `depth` deep with a lip, the rail on its
 * three open sides, the two potted plants and the little bistro table with its two chairs.
 * Positions are the balcony zone's (x across, z out from the wall, origin at the slab's middle).
 */
function flatBalcony(stone: TriBuilder, iron: TriBuilder, props: TriBuilder, m: THREE.Matrix4, flat: FlatFront, slab: THREE.Color): void {
  const { floorY: y, balcony: b } = flat;
  const s0 = b.at - b.width / 2;
  const s1 = b.at + b.width / 2;
  stone.box(m, b.at, y - 0.09, (b.depth + 0.06) / 2, b.width + 0.12, 0.18, b.depth + 0.06, slab);
  railing(iron, m, [s0, b.depth], [s1, b.depth], y, 1.02, 0.11);
  railing(iron, m, [s0, 0], [s0, b.depth], y, 1.02, 0.11);
  railing(iron, m, [s1, b.depth], [s1, 0], y, 1.02, 0.11);
  const random = seededRandom(2121);
  // Balcony-local (x, z) -> facade (s, out): z is measured from the slab's middle.
  const at = (x: number, z: number): [number, number] => [b.at + x, b.depth / 2 + z];
  for (const [x, z, pot] of [[-1.0, 0.35, '#b8643a'], [1.05, 0.4, '#e8e2d8']] as const) {
    const [s, o] = at(x, z);
    props.box(m, s, y + 0.14, o, 0.26, 0.28, 0.26, pot);
    for (let i = 0; i < 5; i++) {
      const g = new THREE.Color().setHSL(0.28 + random() * 0.06, 0.45, 0.28 + random() * 0.1);
      props.box(m, s + (random() - 0.5) * 0.22, y + 0.38 + random() * 0.28, o + (random() - 0.5) * 0.22, 0.16 + random() * 0.08, 0.2, 0.16 + random() * 0.08, g);
    }
  }
  // The bistro set: a round-ish table on its stem, a chair either side.
  const [ts, to] = at(0.45, 0.15);
  const green = '#2f4a3e';
  props.box(m, ts, y + 0.71, to, 0.56, 0.03, 0.56, green);
  props.box(m, ts, y + 0.36, to, 0.04, 0.7, 0.04, green);
  props.box(m, ts, y + 0.015, to, 0.36, 0.03, 0.36, green);
  for (const side of [-1, 1]) {
    const cs = ts + side * 0.5;
    props.box(m, cs, y + 0.45, to, 0.38, 0.03, 0.38, green);
    props.box(m, cs + side * 0.18, y + 0.68, to, 0.03, 0.46, 0.36, green);
    for (const [dx, dz] of [[-0.16, -0.16], [0.16, -0.16], [-0.16, 0.16], [0.16, 0.16]] as const) props.box(m, cs + dx, y + 0.22, to + dz, 0.025, 0.44, 0.025, green);
  }
}
