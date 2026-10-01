import * as THREE from 'three';
import { cylinderMesh } from '../../meshUtils';
import { Prop, part } from '../../props/Prop';
import { paint } from '../../materials/palette';
import { PooledLight } from '../../lighting/LightPool';
import { LAMP_LIGHT, type LampKind } from '../../lighting/lampColours';
import { Glows, type ShopFitting } from './fitting';

export interface TrackSpotsOptions {
  /** Length of the track, metres. Default 1.6. */
  length?: number;
  /** Spot heads along it. Default 3. */
  count?: number;
  /** How far each head is tipped from straight down towards local +z, radians (towards a wall or a display). Default 0.6. */
  aim?: number;
  /** The cans' paint. Default black. */
  color?: number;
  /** Bulbs: warm halogen (default) or incandescent. */
  kind?: Extract<LampKind, 'halogen' | 'incandescent' | 'led'>;
  /** Light thrown where they point (one `PooledLight` for the whole track), 0 for none. Default 1.2. */
  light?: number;
  /** How far from the track, along the aim, that light sits (what is lit). Default 1.2. */
  reach?: number;
}

const HEAD_R = 0.035;
const HEAD_L = 0.11;
const LENS_GLOW = 3;

/**
 * A ceiling track of little spot cans, each tipped towards what it lights (the back wall's display, a shelf, the
 * window): the lenses glow warm, and the light they throw is one `PooledLight` out along their aim (no shadow).
 * A `ShopFitting`: the shop's switch works it. Ceiling-hung: origin at the ceiling, the track along local x, the
 * heads aimed down and towards +z. Decoration: never collides.
 */
export class TrackSpots extends Prop implements ShopFitting {
  private readonly glows = new Glows();
  private readonly light: PooledLight | null;
  private readonly level: number;

  constructor(options: TrackSpotsOptions = {}) {
    super();
    this.name = 'TrackSpots';
    const length = options.length ?? 1.6;
    const count = options.count ?? 3;
    const aim = options.aim ?? 0.6;
    const can = paint(options.color ?? 0x1c1c1e, 0.45);
    part(this, length, 0.03, 0.035, can, { y: -0.015 });
    const lens = this.glows.add({ kind: options.kind ?? 'halogen', color: 0xfff4e0, strength: LENS_GLOW, roughness: 0.2 });
    for (let i = 0; i < count; i++) {
      const x = count === 1 ? 0 : -length / 2 + 0.12 + ((length - 0.24) * i) / (count - 1);
      part(this, 0.012, 0.06, 0.012, can, { x, y: -0.06 });
      const head = new THREE.Group();
      head.position.set(x, -0.09, 0);
      // Tipped about x so its -y (the beam) leans towards +z.
      head.rotation.x = -aim;
      head.add(cylinderMesh(HEAD_R, HEAD_L, can, { y: -HEAD_L / 2 }));
      head.add(cylinderMesh(HEAD_R * 0.8, 0.004, lens, { y: -HEAD_L - 0.001 }));
      this.add(head);
    }
    this.level = options.light ?? 1.2;
    const reach = options.reach ?? 1.2;
    this.light = this.level > 0 ? new PooledLight(LAMP_LIGHT[options.kind ?? 'halogen'], this.level, 3.5, 2) : null;
    if (this.light) {
      this.light.position.set(0, -0.1 - Math.cos(aim) * reach, Math.sin(aim) * reach);
      this.add(this.light);
    }
    this.traverse((o) => (o.castShadow = false));
    this.setLit(true);
  }

  setLit(on: boolean): void {
    this.glows.set(on ? 1 : 0);
    if (this.light) this.light.intensity = on ? this.level : 0;
  }
}
