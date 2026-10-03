import * as THREE from 'three';
import { SHOPS } from '../facadePainter';
import type { TriBuilder } from '../relief/TriBuilder';
import { LANDMARK_PILASTER } from './shopfrontPlan';

/** The two fronts the street is about (the kit's `landmark` variant), built in 3D but flush: their glass stays in the wall (the shop seen through it, `ShopInteriors`). */
export type LandmarkKind = 'retro' | 'arcade';

interface LandmarkLook {
  /** The joinery's paint, the riser's enamel, the trims' chrome. */
  paint: string;
  riser: string;
  chrome: string;
  /** Neon tubes along the fascia and down the pilasters, by colour (none for a plain front). */
  tubes: [string, string] | null;
}
const LOOKS: Record<LandmarkKind, LandmarkLook> = {
  retro: { paint: '#241f38', riser: '#2a1f4a', chrome: '#b8c0c8', tubes: null },
  arcade: { paint: '#16101e', riser: '#0e0a14', chrome: '#9aa4ae', tubes: ['#ff3aa8', '#4ae8ff'] },
};
/** The joinery's measures: pilasters, the riser under the glass, the head over it, the fascia's rails. */
const J = { pilaster: LANDMARK_PILASTER, pilasterOut: 0.16, riserTop: 0.55, riserOut: 0.1, head: [2.95, 3.05] as const, fascia: [3.0, 3.8] as const, cornice: 0.24 };

/**
 * RETRO GAMES' or the arcade's front into `b` (vertex colours, in the facade frame `m`), over its painted one:
 * pilasters on plinths at both ends, an enamelled stall riser with a chrome kick under each window (`units`), a
 * chrome sill, the head over the glass, the fascia framed by a moulded cornice and a rail; the arcade's edged in neon
 * tubes into `neon`, pink along the top and cyan down the pilasters. All of it within 28 cm of the wall.
 */
export function buildLandmarkFront(b: TriBuilder, neon: TriBuilder, m: THREE.Matrix4, kind: LandmarkKind, s0: number, s1: number, units: readonly { s0: number; s1: number }[]): void {
  const look = LOOKS[kind];
  const paint = new THREE.Color(look.paint);
  const trim = paint.clone().multiplyScalar(1.5);
  const width = s1 - s0;
  const mid = (s0 + s1) / 2;
  // Pilasters on their plinths, capitals under the fascia.
  for (const s of [s0 + J.pilaster / 2, s1 - J.pilaster / 2]) {
    b.box(m, s, J.fascia[0] / 2, J.pilasterOut / 2, J.pilaster, J.fascia[0], J.pilasterOut, paint);
    b.box(m, s, 0.18, (J.pilasterOut + 0.04) / 2, J.pilaster + 0.04, 0.36, J.pilasterOut + 0.04, trim);
    b.box(m, s, J.fascia[0] - 0.06, (J.pilasterOut + 0.03) / 2, J.pilaster + 0.04, 0.08, J.pilasterOut + 0.03, look.chrome);
  }
  // Under each window: the enamelled riser, a chrome kick, the sill.
  for (const u of units) {
    const w = u.s1 - u.s0;
    const c = (u.s0 + u.s1) / 2;
    b.box(m, c, J.riserTop / 2, J.riserOut / 2, w, J.riserTop, J.riserOut, look.riser);
    // A touch wider than the riser: its ends never share the riser's planes (z-fighting seen along the front).
    b.box(m, c, 0.07, J.riserOut / 2 + 0.005, w + 0.01, 0.14, J.riserOut + 0.01, look.chrome);
    b.box(m, c, J.riserTop + 0.02, (J.riserOut + 0.04) / 2, w + 0.06, 0.04, J.riserOut + 0.04, look.chrome);
  }
  // The head over the glass, the fascia's rail and its cornice.
  b.box(m, mid, (J.head[0] + J.head[1]) / 2, 0.06, width - 2 * J.pilaster, J.head[1] - J.head[0], 0.12, trim);
  b.box(m, mid, J.fascia[0] + 0.03, 0.08, width, 0.06, 0.16, look.chrome);
  b.box(m, mid, J.fascia[1] + 0.05, J.cornice / 2, width + 0.1, 0.1, J.cornice, new THREE.Color(SHOPS[kind].fascia).multiplyScalar(1.25));
  b.box(m, mid, J.fascia[1] + 0.13, (J.cornice + 0.04) / 2, width + 0.16, 0.06, J.cornice + 0.04, look.chrome);
  if (!look.tubes) return;
  const [top, side] = look.tubes;
  neon.box(m, mid, J.fascia[1] - 0.02, J.cornice + 0.02, width - 0.2, 0.03, 0.03, top);
  neon.box(m, mid, J.fascia[0] + 0.1, 0.18, width - 0.2, 0.03, 0.03, top);
  for (const s of [s0 + J.pilaster / 2, s1 - J.pilaster / 2]) neon.box(m, s, J.fascia[0] / 2, J.pilasterOut + 0.02, 0.03, J.fascia[0] - 0.5, 0.03, side);
}
