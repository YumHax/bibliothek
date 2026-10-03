import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../../Furniture';
import type { DayNight } from '../../props/DayNight';
import type { PaintedFront } from '../Buildings';
import type { ShopKind } from '../streetPlan';
import { isShopOpen } from '../shops/shopHours';
import { snowCovered } from '../snowCover';
import { FacadeFrame } from './facadeFrame';
import { TriBuilder } from './TriBuilder';

/** The kinds that hang a lit sign out over the pavement: the pharmacy's green cross, the newsagent's red diamond. */
type BladeKind = Extract<ShopKind, 'pharmacy' | 'tabac'>;
const BLADES: Record<BladeKind, { color: number; glow: number }> = {
  pharmacy: { color: 0x2fa84a, glow: 0x3dff6a },
  tabac: { color: 0xc9302a, glow: 0xff4a2a },
};
/** The sign's middle over the pavement, how far out from the wall, how far in from the shop's end. */
const SIGN = { y: 4.4, out: 0.62, inset: 0.45 };
const IRON = '#23262a';
/** How bright it burns: open, shut by night, shut by day (a lamp seen in daylight still shows). */
const GLOW = { open: 1.6, shutNight: 0.12, shutDay: 0 };
const CHECK_EVERY = 1;

/**
 * The lit signs hung out on brackets over the pavement, as the window view paints them: the pharmacy's
 * green cross, the newsagent's red diamond, each square to its facade so it reads down the street, at
 * the end of its shop the facade's seed picks. Self-lit (no light of their own: they bloom), bright while
 * the shop is open, faint after closing. A draw call per kind and one for the brackets; nothing collides
 * (it is all over head height).
 */
export class BladeSigns extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  private readonly materials: { kind: BladeKind; material: THREE.MeshStandardMaterial }[] = [];
  private clock = CHECK_EVERY;

  constructor(fronts: readonly PaintedFront[], private readonly dayNight: DayNight) {
    super();
    this.name = 'BladeSigns';
    const brackets = new TriBuilder();
    const faces: Record<BladeKind, TriBuilder> = { pharmacy: new TriBuilder(), tabac: new TriBuilder() };
    for (const front of fronts) {
      const frame = new FacadeFrame(front.spec);
      for (const shop of front.features.shopfronts) {
        if (shop.kind !== 'pharmacy' && shop.kind !== 'tabac') continue;
        const s = front.spec.seed % 2 ? shop.s1 - SIGN.inset : shop.s0 + SIGN.inset;
        const m = frame.matrix(s, SIGN.y, 0);
        bracket(brackets, m);
        if (shop.kind === 'pharmacy') cross(faces.pharmacy, m);
        else diamond(faces.tabac, m);
      }
    }
    if (!brackets.isEmpty) {
      const mesh = new THREE.Mesh(brackets.build(), snowCovered(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 })));
      mesh.castShadow = true;
      this.add(mesh);
    }
    for (const kind of Object.keys(faces) as BladeKind[]) {
      if (faces[kind].isEmpty) continue;
      const { color, glow } = BLADES[kind];
      const material = new THREE.MeshStandardMaterial({ color, emissive: glow, emissiveIntensity: 0, roughness: 0.35 });
      const mesh = new THREE.Mesh(faces[kind].build(), material);
      mesh.castShadow = true;
      mesh.name = `BladeSign:${kind}`;
      this.add(mesh);
      this.materials.push({ kind, material });
    }
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  update(dt: number): void {
    this.clock += dt;
    if (this.clock < CHECK_EVERY) return;
    this.clock = 0;
    const s = this.dayNight.state;
    for (const { kind, material } of this.materials) material.emissiveIntensity = isShopOpen(kind, s.hours) ? GLOW.open : s.daylight > 0.5 ? GLOW.shutDay : GLOW.shutNight;
  }
}

/** The bracket: a plate on the wall, an arm out over the sign with a stay under it. */
function bracket(b: TriBuilder, m: THREE.Matrix4): void {
  b.box(m, 0, 0.5, 0.02, 0.14, 0.24, 0.04, IRON);
  b.box(m, 0, 0.55, (SIGN.out + 0.45) / 2, 0.035, 0.035, SIGN.out + 0.45, IRON);
  b.box(m, 0, 0.42, 0.25, 0.03, 0.2, 0.03, IRON);
  b.box(m, 0, 0.47, SIGN.out, 0.02, 0.12, 0.02, IRON);
}

/** The green cross, a slab each way, thin across the facade so both faces read along the street. */
function cross(b: TriBuilder, m: THREE.Matrix4): void {
  const arm = 0.24;
  const span = 0.74;
  b.box(m, 0, 0, SIGN.out, 0.1, span, arm, '#ffffff');
  b.box(m, 0, 0, SIGN.out, 0.1, arm, span, '#ffffff');
}

/** The newsagent's red diamond: a lozenge drawn out tall, its two faces bevelled to an edge round it. */
function diamond(b: TriBuilder, m: THREE.Matrix4): void {
  const h = 0.46;
  const w = 0.24;
  const t = 0.07;
  const c = SIGN.out;
  const rim: [number, number][] = [[0, h], [w, 0], [0, -h], [-w, 0]];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const [ya, za] = rim[i]!;
      const [yb, zb] = rim[(i + 1) % 4]!;
      // One face's bevelled quarter: the rim's edge to the middle, which stands `t` out of the edge's plane.
      if (side > 0) b.triangle(m, [0, ya, c + za], [0, yb, c + zb], [t, 0, c], '#ffffff');
      else b.triangle(m, [0, ya, c + za], [-t, 0, c], [0, yb, c + zb], '#ffffff');
    }
  }
}
