import * as THREE from 'three';
import type { Furniture } from '../../Furniture';
import { part } from '../../props/Prop';
import { cloth } from '../../materials/palette';
import { seededRandom } from '@/graphics/canvas';
import { tagCard } from './tagCard';

export interface DustSheetsOptions {
  /** The sheeted wardrobe's size. Default 0.85 x 0.5 x 1.8. */
  width?: number;
  depth?: number;
  height?: number;
  /** The card pinned to the sheet, or none. Default RESERVED for Mr. Dupont. */
  card?: readonly string[] | null;
  seed?: number;
}

const HEM = 0.22;
const FLARE = 0.06;

/**
 * Something tall under a dust sheet in the back corner, not on show yet (a wardrobe, by its shape): the sheet over
 * its top a little slack, folds down its front, the hem flaring out on the floor, and a picture frame under a smaller
 * sheet leaning against its side; a card pinned to the front says who it is kept for. Origin on the floor under the
 * wardrobe's middle, its front +z; the frame leans at its -x side. Collides as its box; static, the parts merge.
 */
export class DustSheets extends THREE.Group implements Furniture {
  readonly footprint: THREE.Box3;

  constructor(options: DustSheetsOptions = {}) {
    super();
    this.name = 'DustSheets';
    const w = options.width ?? 0.85;
    const d = options.depth ?? 0.5;
    const h = options.height ?? 1.8;
    const random = seededRandom(options.seed ?? 3);
    const sheet = cloth(0xe8e2d4, 1);
    const shade = cloth(0xd8d0c0, 1);
    // The body, its top sagging a touch in the middle.
    part(this, w, h - HEM, d, sheet, { y: HEM + (h - HEM) / 2 });
    part(this, w + 0.03, 0.03, d + 0.03, sheet, { y: h - 0.005 });
    part(this, w * 0.5, 0.02, d * 0.6, shade, { y: h + 0.006, x: (random() - 0.5) * 0.1 });
    // The hem: four skirts flaring out onto the floor.
    for (const [sx, sz, len, yaw] of [[0, 1, w, 0], [0, -1, w, Math.PI], [1, 0, d, Math.PI / 2], [-1, 0, d, -Math.PI / 2]] as const) {
      const skirt = new THREE.Group();
      skirt.position.set((sx * w) / 2, 0, (sz * d) / 2);
      skirt.rotation.y = yaw;
      const panel = part(skirt, len + FLARE, HEM + 0.02, 0.012, sheet, { y: HEM / 2, z: FLARE / 2 });
      panel.rotation.x = -Math.atan2(FLARE, HEM);
      this.add(skirt);
    }
    // Folds down the front and the side where the sheet was pulled over.
    for (let i = 0; i < 4; i++) {
      const fh = 0.6 + random() * 0.8;
      part(this, 0.03, fh, 0.02, i % 2 ? shade : sheet, { x: -w / 2 + 0.12 + random() * (w - 0.24), y: HEM + fh / 2, z: d / 2 + 0.008 });
    }
    part(this, 0.02, 1.1, 0.03, shade, { x: w / 2 + 0.008, y: HEM + 0.55, z: 0.05 });
    // A picture frame under a sheet of its own, leaning on the side.
    const frame = new THREE.Group();
    frame.position.set(-w / 2 - 0.09, 0, 0.02);
    frame.rotation.set(0, Math.PI / 2, 0);
    const leaning = part(frame, 0.6, 0.8, 0.05, sheet, { y: 0.4 });
    // Its top against the wardrobe's side (+z here), its foot out on the floor.
    leaning.rotation.x = 0.12;
    leaning.position.z = 0.015;
    this.add(frame);
    const card = options.card === undefined ? ['RESERVED', 'Mr. Dupont', 'do not sell!'] : options.card;
    if (card) {
      const tag = tagCard({ lines: card, width: 0.16, height: 0.12, band: 0x7a5234, seed: 11 });
      tag.position.set(0.12, 1.25, d / 2 + 0.002);
      tag.rotation.z = 0.06;
      this.add(tag);
    }
    this.footprint = new THREE.Box3(new THREE.Vector3(-w / 2 - 0.2, 0, -d / 2 - FLARE), new THREE.Vector3(w / 2 + FLARE, h + 0.03, d / 2 + FLARE));
  }
}
