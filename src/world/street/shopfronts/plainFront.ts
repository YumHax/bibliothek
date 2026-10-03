import * as THREE from 'three';
import type { TriBuilder } from '../relief/TriBuilder';
import { PLAIN } from './shopfrontPlan';

/** A plain front's openings (facade metres): the door's leaf, the display windows' glass. */
export interface PlainLayout {
  s0: number;
  s1: number;
  /** The door's middle and the leaf's half width and top (`facadePainter` paints it, `ShopInteriors` shows through its glass). */
  door: { s: number; half: number; top: number } | null;
  units: { g0: number; g1: number; y0: number; y1: number }[];
}

/** The shop's paint (`SHOPS`): joinery and fascia board. */
export interface PlainPaint {
  front: string;
  fascia: string;
}

const BRASS = '#b89a52';
/**
 * How far into what it stands on a detail starts (a sill, a plinth, a step): its back face inside that, never in the
 * wall's plane with the backs of the parts it overlaps.
 */
const BACK = 0.03;
const STONE = '#9a948a';

function shade(hex: string, k: number): THREE.Color {
  return new THREE.Color(hex).multiplyScalar(k);
}

/** An opening in the surround (s0..s1, y0..y1) and whether it is the door's. */
interface Opening {
  s0: number;
  s1: number;
  y0: number;
  y1: number;
  door: boolean;
}

/**
 * The kit's plain front (`PLAIN`) into `b`, in the facade frame `m` (vertex colours): the pilasters on their plinths
 * with capitals, the consoles over them, the head, the fascia board between its beads (`fasciaLettering` letters it),
 * the cornice and its lip; between the pilasters the surround, solid round the openings (door, display windows) so
 * their glass sits back in a reveal; in each window a sill, a panelled riser under it and a transom bar across the
 * glass; the door's step and its handle. Parallel faces stand at least 1.5 cm apart, and a part that ends against
 * another ends inside it, never in the plane of one of its faces.
 */
export function buildPlainFront(b: TriBuilder, m: THREE.Matrix4, layout: PlainLayout, paint: PlainPaint): void {
  const { s0, s1 } = layout;
  const P = PLAIN.pilaster;
  const a = s0 + P;
  const z = s1 - P;
  const front = new THREE.Color(paint.front);
  const trim = shade(paint.front, 0.78);
  const light = shade(paint.front, 1.18);
  const top = PLAIN.head[0];

  // The surround: solid between the openings from the pavement to the head, under and over each one.
  const openings: Opening[] = [
    ...layout.units.map((u) => ({ s0: u.g0, s1: u.g1, y0: u.y0, y1: Math.min(u.y1, top), door: false })),
    ...(layout.door ? [{ s0: layout.door.s - layout.door.half, s1: layout.door.s + layout.door.half, y0: 0, y1: layout.door.top, door: true }] : []),
  ]
    .map((o) => ({ ...o, s0: Math.max(a, o.s0), s1: Math.min(z, o.s1) }))
    .filter((o) => o.s1 - o.s0 > 0.1)
    .sort((p, q) => p.s0 - q.s0);
  const out = PLAIN.surroundOut;
  const panel = (from: number, to: number, y0: number, y1: number, color: THREE.Color): void => {
    if (to - from > 0.002 && y1 - y0 > 0.002) b.box(m, (from + to) / 2, (y0 + y1) / 2, out / 2, to - from, y1 - y0, out, color);
  };
  let at = a;
  for (const o of openings) {
    panel(at, o.s0, 0, top, front);
    panel(o.s0, o.s1, 0, o.y0, front);
    panel(o.s0, o.s1, o.y1, top, front);
    at = Math.max(at, o.s1);
  }
  panel(at, z, 0, top, front);

  for (const o of openings) {
    const w = o.s1 - o.s0;
    const mid = (o.s0 + o.s1) / 2;
    if (o.door) {
      // The step before the door, its handle.
      b.box(m, mid, 0.01, (BACK + 0.22) / 2, w + 0.1, 0.06, 0.22 - BACK, STONE);
      b.box(m, o.s1 - 0.12, 1.02, 0.03, 0.025, 0.16, 0.03, BRASS);
      continue;
    }
    // The sill before the glass, wider than the opening; the transom bar across the glass.
    b.box(m, mid, o.y0, (BACK + PLAIN.sillOut) / 2, w + 0.08, 0.05, PLAIN.sillOut - BACK, light);
    b.box(m, mid, PLAIN.transom, PLAIN.barOut / 2, w, 0.04, PLAIN.barOut, front);
    // The riser's raised panels.
    const panels = Math.max(1, Math.round(w / 0.7));
    const pw = w / panels;
    const py0 = 0.1;
    const py1 = o.y0 - 0.1;
    if (py1 - py0 < 0.1) continue;
    for (let i = 0; i < panels; i++) {
      const s = o.s0 + (i + 0.5) * pw;
      b.box(m, s, (py0 + py1) / 2, (out + PLAIN.panelOut) / 2, pw - 0.16, py1 - py0, PLAIN.panelOut - out, shade(paint.front, 0.88));
    }
  }

  // The pilasters (ending inside their capitals), plinths and capitals; the consoles over them.
  const [c0, c1] = PLAIN.capital;
  for (const s of [s0 + P / 2, s1 - P / 2]) {
    b.box(m, s, (c0 + 0.03) / 2, PLAIN.pilasterOut / 2, P, c0 + 0.03, PLAIN.pilasterOut, front);
    b.box(m, s, (PLAIN.plinth - 0.02) / 2, (BACK + PLAIN.baseOut) / 2, P + 0.03, PLAIN.plinth + 0.02, PLAIN.baseOut - BACK, trim);
    b.box(m, s, (c0 + c1) / 2, (BACK + PLAIN.baseOut) / 2, P + 0.03, c1 - c0, PLAIN.baseOut - BACK, trim);
    b.box(m, s, (c1 + PLAIN.cornice[0]) / 2, PLAIN.consoleOut / 2, P, PLAIN.cornice[0] - c1, PLAIN.consoleOut, front);
    // The console's scroll: a block under its face, at the board's foot.
    b.box(m, s, PLAIN.board[0] + 0.07, PLAIN.consoleOut + 0.02, P - 0.06, 0.14, 0.04, trim);
  }
  const mid = (s0 + s1) / 2;
  const [h0, h1] = PLAIN.head;
  const [f0, f1] = PLAIN.board;
  b.box(m, (a + z) / 2, (h0 + h1) / 2, PLAIN.headOut / 2, z - a, h1 - h0, PLAIN.headOut, trim);
  b.box(m, (a + z) / 2, (f0 + f1) / 2, PLAIN.boardOut / 2, z - a, f1 - f0, PLAIN.boardOut, new THREE.Color(paint.fascia));
  // The board's beads on its face, clear of the lettering (`fasciaLettering` keeps within 3.11..3.69), their ends in
  // the consoles.
  for (const y of [f0 + 0.03, f1 - 0.03]) b.box(m, (a + z) / 2, y, PLAIN.boardOut, z - a + 0.03, 0.03, 0.04, trim);
  const [k0, k1] = PLAIN.cornice;
  b.box(m, mid, (k0 + k1) / 2, PLAIN.corniceOut / 2, s1 - s0 + 0.08, k1 - k0, PLAIN.corniceOut, light);
  const [l0, l1] = PLAIN.lip;
  b.box(m, mid, (l0 + l1) / 2, PLAIN.lipOut / 2, s1 - s0 + 0.14, l1 - l0, PLAIN.lipOut, trim);
}
