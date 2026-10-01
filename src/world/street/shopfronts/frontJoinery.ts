import * as THREE from 'three';
import type { TriBuilder } from '../relief/TriBuilder';
import { FRONT, SIGN, type ShopfrontLook } from './shopfrontPlan';

/** One shop's front in its facade's metres (s along, y up, out from the wall): its ends, its door, its display windows' glass. */
export interface FrontLayout {
  s0: number;
  s1: number;
  door: number;
  units: { g0: number; g1: number }[];
}

/** The joinery's colours: the shop's paint (pilasters, returns, head) and its fascia board's. */
export interface FrontPaint {
  front: string;
  fascia: string;
}

const IRON = '#23262a';
const METAL = '#3a4048';
/** The returns either side of a display window, the pilasters at the front's ends, how far each stands out. */
const RETURN = 0.06;
const PILASTER = { width: 0.24, out: FRONT.depth + 0.08 };
/** The display's floor: a board on the riser, the window display stands on its top. */
export const DISPLAY_FLOOR = FRONT.sill + 0.012;

function shade(hex: string, k: number): THREE.Color {
  return new THREE.Color(hex).multiplyScalar(k);
}

/**
 * The joinery of a walk-in shop's front into `b` (vertex colours, in the facade frame `m`): per display window the
 * stall riser (its face tiled, panelled or enamelled), the display's floor, a sill before the glass, the returns
 * either side and the bar under the head; the pilasters at both ends on their plinths; the head across the whole
 * front (the recessed door's soffit); the fascia's mouldings (`look.fascia`); the mosaic step in the door's recess;
 * the bracket the sign hangs from. Returns where the sign's board goes (s, for the quads).
 */
export function buildJoinery(b: TriBuilder, m: THREE.Matrix4, layout: FrontLayout, look: ShopfrontLook, paint: FrontPaint): number {
  const { depth: D, sill, glassTop, headTop, fasciaTop } = FRONT;
  const { s0, s1 } = layout;
  const front = new THREE.Color(paint.front);
  const trim = shade(paint.front, 0.78);
  for (const { g0, g1 } of layout.units) {
    const w = g1 - g0;
    const mid = (g0 + g1) / 2;
    riser(b, m, g0, g1, look.riser);
    b.box(m, mid, sill + 0.006, D / 2 - 0.01, w, 0.012, D - 0.02, '#5a4a3a');
    b.box(m, mid, sill - 0.012, D + 0.005, w + 0.06, 0.035, 0.07, trim);
    for (const s of [g0 - RETURN / 2, g1 + RETURN / 2]) b.box(m, s, glassTop / 2, (D + 0.02) / 2, RETURN, glassTop, D + 0.02, front);
    b.box(m, mid, glassTop - 0.02, D - 0.005, w, 0.04, 0.05, trim);
  }
  // The pilasters, their plinths and capitals.
  for (const s of [s0 + PILASTER.width / 2, s1 - PILASTER.width / 2]) {
    b.box(m, s, headTop / 2, PILASTER.out / 2, PILASTER.width, headTop, PILASTER.out, front);
    b.box(m, s, 0.16, (PILASTER.out + 0.04) / 2, PILASTER.width + 0.04, 0.32, PILASTER.out + 0.04, trim);
    b.box(m, s, glassTop - 0.08, (PILASTER.out + 0.03) / 2, PILASTER.width + 0.03, 0.06, PILASTER.out + 0.03, trim);
  }
  // The head over windows and door alike.
  b.box(m, (s0 + s1) / 2, (glassTop + headTop) / 2, (D + 0.05) / 2, s1 - s0 - 0.02, headTop - glassTop, D + 0.05, front);
  b.box(m, (s0 + s1) / 2, headTop - 0.015, (D + 0.09) / 2, s1 - s0, 0.03, D + 0.09, trim);
  fascia(b, m, s0, s1, headTop, fasciaTop, look.fascia, paint);
  mosaic(b, m, layout, look.mosaic);
  const sign = look.sign.end === 'right' ? s1 - 0.42 : s0 + 0.42;
  bracket(b, m, sign);
  return sign;
}

/** The riser under a window's glass, from the pavement to the sill, and its face. */
function riser(b: TriBuilder, m: THREE.Matrix4, g0: number, g1: number, { style, colors }: ShopfrontLook['riser']): void {
  const { depth: D, sill } = FRONT;
  const w = g1 - g0;
  const mid = (g0 + g1) / 2;
  const [a, c] = colors;
  b.box(m, mid, sill / 2, D / 2, w, sill, D, style === 'panels' ? a : style === 'enamel' ? a : c);
  const face = D + 0.004;
  if (style === 'tiles') {
    // A border in the dark colour, a field of small square tiles in the two, chequered.
    b.box(m, mid, 0.04, face, w, 0.08, 0.008, a);
    b.box(m, mid, sill - 0.035, face, w, 0.07, 0.008, a);
    const size = 0.1;
    const cols = Math.max(1, Math.round((w - 0.04) / size));
    const tw = (w - 0.04) / cols;
    const rows = 3;
    const th = (sill - 0.15 - 0.04) / rows;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const color = (i + j) % 2 ? a : c;
        b.box(m, g0 + 0.02 + (i + 0.5) * tw, 0.1 + (j + 0.5) * th, face, tw - 0.008, th - 0.008, 0.008, color);
      }
    }
  } else if (style === 'panels') {
    // Raised panels in a frame, a moulding round each.
    const panels = Math.max(1, Math.round(w / 0.6));
    const pw = w / panels;
    for (let i = 0; i < panels; i++) {
      const s = g0 + (i + 0.5) * pw;
      b.box(m, s, sill / 2, face + 0.004, pw - 0.1, sill - 0.16, 0.012, shade(c, 0.85));
      b.box(m, s, sill / 2, face + 0.012, pw - 0.16, sill - 0.22, 0.012, c);
    }
    b.box(m, mid, 0.03, face + 0.006, w, 0.06, 0.02, shade(a, 0.8));
  } else {
    // Dark enamel, a chrome kick plate and a chrome line under the sill.
    b.box(m, mid, 0.07, face + 0.002, w, 0.1, 0.006, c);
    b.box(m, mid, sill - 0.06, face + 0.002, w, 0.012, 0.006, c);
  }
}

/** The fascia's mouldings over the painted board (`headTop`..`top` on the wall), by kind of front. */
function fascia(b: TriBuilder, m: THREE.Matrix4, s0: number, s1: number, bottom: number, top: number, style: ShopfrontLook['fascia'], paint: FrontPaint): void {
  const mid = (s0 + s1) / 2;
  const w = s1 - s0;
  const trim = shade(paint.front, 0.85);
  const board = new THREE.Color(paint.fascia);
  switch (style) {
    case 'corbels':
      // A deep cornice with a lip, carried at both ends by scrolled corbels on the pilasters.
      b.box(m, mid, top + 0.07, 0.13, w + 0.16, 0.14, 0.26, trim);
      b.box(m, mid, top - 0.02, 0.08, w + 0.04, 0.05, 0.16, shade(paint.front, 0.7));
      for (const s of [s0 + PILASTER.width / 2, s1 - PILASTER.width / 2]) {
        b.box(m, s, (bottom + top) / 2, 0.1, 0.2, top - bottom, 0.2, paint.front);
        b.box(m, s, top - 0.08, 0.24, 0.2, 0.14, 0.1, trim);
        b.box(m, s, top - 0.2, 0.2, 0.16, 0.1, 0.08, trim);
        b.box(m, s, bottom + 0.08, (PILASTER.out + 0.06) / 2, 0.22, 0.16, PILASTER.out + 0.06, trim);
      }
      break;
    case 'dentils': {
      // A cornice with a row of dentils under it, a bead along the board's foot.
      b.box(m, mid, top + 0.055, 0.09, w + 0.1, 0.11, 0.18, trim);
      for (let s = s0 + 0.06; s < s1 - 0.04; s += 0.11) b.box(m, s, top - 0.025, 0.05, 0.05, 0.05, 0.06, trim);
      b.box(m, mid, bottom + 0.02, (FRONT.depth + 0.1) / 2, w, 0.04, FRONT.depth + 0.1, shade(paint.front, 0.7));
      for (const s of [s0 + 0.05, s1 - 0.05]) b.box(m, s, (bottom + top) / 2, 0.05, 0.1, top - bottom, 0.1, trim);
      break;
    }
    case 'slim':
      // A slim frame round the board, a round-ended bracket at each end.
      b.box(m, mid, top + 0.02, 0.04, w, 0.05, 0.08, trim);
      for (const s of [s0 + 0.04, s1 - 0.04]) {
        b.box(m, s, (bottom + top) / 2, 0.04, 0.08, top - bottom, 0.08, trim);
        b.box(m, s, top - 0.1, 0.1, 0.1, 0.12, 0.12, board);
      }
      break;
    case 'lightbox':
      // A metal edge down the board's ends (the neon's panel covers the rest, `STREET_PLAN.signs`).
      for (const s of [s0 + 0.03, s1 - 0.03]) b.box(m, s, (bottom + top) / 2, 0.05, 0.06, top - bottom, 0.1, METAL);
      break;
  }
}

/** The door's step between the windows' returns: a mosaic, its border in one colour, a diamond in the middle. */
function mosaic(b: TriBuilder, m: THREE.Matrix4, layout: FrontLayout, [field, border]: [string, string]): void {
  const left = Math.max(layout.s0 + PILASTER.width, ...layout.units.filter((u) => u.g1 < layout.door).map((u) => u.g1 + RETURN));
  const right = Math.min(layout.s1 - PILASTER.width, ...layout.units.filter((u) => u.g0 > layout.door).map((u) => u.g0 - RETURN));
  const w = right - left;
  const mid = (left + right) / 2;
  const D = FRONT.depth + 0.04;
  const top = 0.03;
  b.box(m, mid, (top - 0.02) / 2, D / 2, w, top + 0.02, D, border);
  b.box(m, mid, top + 0.001, D / 2, w - 0.08, 0.002, D - 0.08, field);
  // Each layer 3 mm over the one under it (flat faces closer than that shimmer at a distance).
  // The diamond, turned a quarter about the vertical.
  const turn = m.clone().multiply(new THREE.Matrix4().makeTranslation(mid, top + 0.002, D / 2)).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 4));
  const side = Math.min(w, D) * 0.42;
  b.box(turn, 0, 0.004, 0, side, 0.002, side, border);
  b.box(turn, 0, 0.007, 0, side * 0.55, 0.002, side * 0.55, field);
}

/** The sign's wrought-iron bracket at `s`: a wall plate, the arm out over the pavement, a brace and a scroll, the two hangers. */
function bracket(b: TriBuilder, m: THREE.Matrix4, s: number): void {
  const { arm, reach, out0, out1, top } = SIGN;
  b.box(m, s, arm - 0.02, 0.015, 0.1, 0.26, 0.03, IRON);
  b.box(m, s, arm, reach / 2, 0.035, 0.035, reach, IRON);
  b.box(m, s, arm + 0.03, reach - 0.02, 0.05, 0.05, 0.05, IRON);
  // The brace: from the plate's foot (clear of the deepest cornice) up to the arm's middle.
  const from = new THREE.Vector2(0.02, arm - 0.13);
  const to = new THREE.Vector2(0.62, arm - 0.01);
  const length = from.distanceTo(to);
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const brace = m.clone().multiply(new THREE.Matrix4().makeTranslation(s, (from.y + to.y) / 2, (from.x + to.x) / 2)).multiply(new THREE.Matrix4().makeRotationX(-angle));
  b.box(brace, 0, 0, 0, 0.025, 0.025, length, IRON);
  // A scroll between them, in the plane of the arm.
  const scroll = new THREE.TorusGeometry(0.05, 0.01, 5, 14);
  b.geometry(m.clone().multiply(new THREE.Matrix4().makeTranslation(s, arm - 0.075, 0.42)).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2)), scroll, IRON);
  scroll.dispose();
  for (const out of [out0 + 0.05, out1 - 0.05]) b.box(m, s, (arm + top) / 2, out, 0.012, arm - top, 0.012, IRON);
}
