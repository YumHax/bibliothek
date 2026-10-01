import { cylinderMesh } from '../../meshUtils';
import { Prop, part } from '../../props/Prop';
import { paint, standard } from '../../materials/palette';

export interface OpenSetOptions {
  /** Width of the case. Default 0.44. */
  width?: number;
  /** The case's plastic. Default a wood-effect brown. */
  color?: number;
}

const BOARD = paint(0x2f5a3a, 0.5);
const TUBE = standard({ color: 0x1a1c1e, roughness: 0.25, metalness: 0.1 });
const COPPER = standard({ color: 0xb8683a, roughness: 0.35, metalness: 0.9 });
const FLYBACK = paint(0x1e1e20, 0.5);
const HV = paint(0xb02a22, 0.5);
const BACK = paint(0x4a3a2a, 0.8);
const CAPS: readonly number[] = [0x2a4a8a, 0x1a1a1a, 0x8a2a2a, 0xd8c890];

/**
 * A set on the bench with its back off, turned so the repairer faces its insides: the case open at the back (+z), the
 * picture tube's bell and neck with its copper yoke, the flyback with its red lead, the green chassis board with its
 * capacitors, and the back cover leaning against its side. Origin on the surface under the case, the open back +z.
 * Decoration: never collides; its parts merge.
 */
export class OpenSet extends Prop {
  readonly contactShadow = false;

  constructor(options: OpenSetOptions = {}) {
    super();
    this.name = 'OpenSet';
    const W = options.width ?? 0.44;
    const H = W * 0.84;
    const D = W * 0.9;
    const T = 0.012;
    const shell = paint(options.color ?? 0x5a4030, 0.55);
    // The shell: the bezel at the front (-z), top, bottom and sides; no back.
    part(this, W, H, T * 2, shell, { y: H / 2, z: -D / 2 + T });
    part(this, W, T, D, shell, { y: H - T / 2 });
    part(this, W, T, D, shell, { y: T / 2 });
    for (const x of [-1, 1]) part(this, T, H - 2 * T, D - 2 * T, shell, { x: (x * (W - T)) / 2, y: H / 2, z: T });
    // The picture tube: its bell behind the bezel narrowing to the neck, the yoke round it.
    const bellR = H * 0.36;
    const bell = cylinderMesh(bellR * 0.35, D * 0.42, TUBE, { x: -W * 0.08, y: H * 0.55, z: -D * 0.12 }, { radiusBottom: bellR, segments: 20 });
    bell.rotation.x = Math.PI / 2;
    this.add(bell);
    const neck = cylinderMesh(0.018, D * 0.3, TUBE, { x: -W * 0.08, y: H * 0.55, z: D * 0.2 }, { segments: 12 });
    neck.rotation.x = Math.PI / 2;
    this.add(neck);
    const yoke = cylinderMesh(0.04, 0.05, COPPER, { x: -W * 0.08, y: H * 0.55, z: D * 0.1 }, { segments: 16 });
    yoke.rotation.x = Math.PI / 2;
    this.add(yoke);
    // The chassis board along the bottom, its parts standing on it.
    part(this, W - 2 * T - 0.01, 0.006, D * 0.55, BOARD, { y: T + 0.03, z: D * 0.12 });
    part(this, 0.008, 0.03, 0.008, BOARD, { x: -W * 0.35, y: T + 0.015, z: D * 0.12 });
    part(this, 0.008, 0.03, 0.008, BOARD, { x: W * 0.35, y: T + 0.015, z: D * 0.12 });
    const deck = T + 0.033;
    part(this, 0.06, 0.07, 0.05, FLYBACK, { x: W * 0.28, y: deck + 0.035, z: D * 0.05 });
    const lead = cylinderMesh(0.004, 0.16, HV, { x: W * 0.12, y: deck + 0.1, z: -D * 0.02 }, { segments: 6 });
    lead.rotation.z = 1.1;
    this.add(lead);
    for (let i = 0; i < 9; i++) {
      const r = 0.006 + (i % 3) * 0.003;
      this.add(cylinderMesh(r, 0.02 + (i % 2) * 0.012, paint(CAPS[i % CAPS.length]!, 0.4), { x: -W * 0.32 + (i % 5) * 0.05, y: deck + 0.012, z: D * 0.22 + Math.floor(i / 5) * 0.05 }, { segments: 10 }));
    }
    // The back cover, off, leaning against the case's right side.
    const cover = part(this, 0.006, H * 0.95, D * 0.95, BACK, { x: W / 2 + 0.06, y: H * 0.46, z: 0.02 });
    cover.rotation.z = 0.2;
  }
}
