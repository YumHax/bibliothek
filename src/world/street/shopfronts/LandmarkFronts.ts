import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../../Furniture';
import type { DayNight } from '../../props/DayNight';
import type { PaintedFront } from '../Buildings';
import { SHOPS } from '../facadePainter';
import type { ShopKind } from '../streetPlan';
import { snowCovered } from '../snowCover';
import { FacadeFrame } from '../relief/facadeFrame';
import { TriBuilder } from '../relief/TriBuilder';

/** The two fronts the street is about, built in 3D but flush: their glass stays in the wall (the shop seen through it, `ShopInteriors`). */
type LandmarkKind = Extract<ShopKind, 'retro' | 'arcade'>;
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
const J = { pilaster: 0.28, pilasterOut: 0.16, riserTop: 0.55, riserOut: 0.1, head: [2.95, 3.05] as const, fascia: [3.0, 3.8] as const, cornice: 0.24 };
const CHECK_EVERY = 1;

/**
 * RETRO GAMES' and the arcade's fronts in relief, over their painted ones: pilasters on plinths at both
 * ends, an enamelled stall riser with a chrome kick under each window, a chrome sill, the head over the
 * glass, the fascia framed by a moulded cornice and a rail; the arcade's edged in neon tubes, pink along
 * the top and cyan down the pilasters, burning all night (it never shuts). The glass stays where it is
 * painted, so what is behind it (`ShopInteriors`, RETRO GAMES' window restocked each market day) is
 * unchanged. Two draw calls; nothing collides (all of it within 16 cm of the wall).
 */
export class LandmarkFronts extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  private readonly tubes: THREE.MeshBasicMaterial | null = null;
  private clock = CHECK_EVERY;

  constructor(fronts: readonly PaintedFront[], private readonly dayNight: DayNight) {
    super();
    this.name = 'LandmarkFronts';
    const joinery = new TriBuilder();
    const neon = new TriBuilder();
    for (const front of fronts) {
      const m = new FacadeFrame(front.spec).matrix(0, 0);
      for (const shop of front.features.shopfronts) {
        if (shop.kind !== 'retro' && shop.kind !== 'arcade') continue;
        const look = LOOKS[shop.kind];
        const units = front.features.windows.filter((w) => w.kind === shop.kind && w.y0 > 0.3 && w.s0 >= shop.s0 && w.s1 <= shop.s1);
        build(joinery, neon, m, shop.s0, shop.s1, units, look, SHOPS[shop.kind].fascia);
      }
    }
    if (!joinery.isEmpty) {
      const mesh = new THREE.Mesh(joinery.build(), snowCovered(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.1 })));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.add(mesh);
    }
    if (!neon.isEmpty) {
      this.tubes = new THREE.MeshBasicMaterial({ vertexColors: true });
      this.add(new THREE.Mesh(neon.build(), this.tubes));
    }
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  update(dt: number): void {
    this.clock += dt;
    if (!this.tubes || this.clock < CHECK_EVERY) return;
    this.clock = 0;
    // Brighter as the light goes (by day a tube is a pale glow).
    this.tubes.color.setScalar(0.55 + 0.9 * (1 - this.dayNight.state.daylight));
  }
}

function build(b: TriBuilder, neon: TriBuilder, m: THREE.Matrix4, s0: number, s1: number, units: readonly { s0: number; s1: number }[], look: LandmarkLook, fascia: string): void {
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
  b.box(m, mid, J.fascia[1] + 0.05, J.cornice / 2, width + 0.1, 0.1, J.cornice, new THREE.Color(fascia).multiplyScalar(1.25));
  b.box(m, mid, J.fascia[1] + 0.13, (J.cornice + 0.04) / 2, width + 0.16, 0.06, J.cornice + 0.04, look.chrome);
  if (!look.tubes) return;
  const [top, side] = look.tubes;
  neon.box(m, mid, J.fascia[1] - 0.02, J.cornice + 0.02, width - 0.2, 0.03, 0.03, top);
  neon.box(m, mid, J.fascia[0] + 0.1, 0.18, width - 0.2, 0.03, 0.03, top);
  for (const s of [s0 + J.pilaster / 2, s1 - J.pilaster / 2]) neon.box(m, s, J.fascia[0] / 2, J.pilasterOut + 0.02, 0.03, J.fascia[0] - 0.5, 0.03, side);
}
