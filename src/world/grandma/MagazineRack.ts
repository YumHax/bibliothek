import { Prop, part } from '../props/Prop';
import { paint, timber } from '../materials/palette';
import { SEAM } from '../props/joinery';

const W = 0.4;
const D = 0.24;
const H = 0.36;
const SLAT = 0.012;

/** The magazines in it: their cover colour and how far they lean. */
const MAGAZINES: readonly [color: number, lean: number][] = [
  [0xd84a3a, 0.08],
  [0x3a6aa8, 0.04],
  [0xe8d24a, -0.02],
  [0x4a8a4a, -0.07],
];

/**
 * The magazine rack by Mémé's armchair (`furnishGrandmaDecor`): a wooden V of slats between two lyre ends, her TV
 * guides and knitting magazines standing in it. Origin on the floor under its middle. Decoration: never collides.
 */
export class MagazineRack extends Prop {
  constructor() {
    super();
    this.name = 'MagazineRack';
    const wood = timber(0x6a4428, 0.5);
    for (const s of [-1, 1]) part(this, SLAT, H, D, wood, { x: s * (W / 2 - SLAT / 2), y: H / 2 });
    // The bottom and two slats each side, leaning in.
    part(this, W - 2 * SLAT - 2 * SEAM, SLAT, D * 0.4, wood, { y: 0.05 });
    for (const s of [-1, 1]) {
      for (const y of [0.18, 0.3]) {
        const slat = part(this, W - 2 * SLAT - 2 * SEAM, 0.03, SLAT, wood, { y, z: s * (D * 0.2 + (y - 0.05) * 0.35) });
        slat.rotation.x = s * 0.35;
      }
    }
    // The magazines, standing in the V.
    MAGAZINES.forEach(([color, lean], i) => {
      const mag = part(this, 0.28, 0.3, 0.008, paint(color, 0.6), { x: (i - 1.5) * 0.02, y: 0.05 + SLAT / 2 + SEAM + 0.15, z: (i - 1.5) * 0.025 });
      mag.rotation.x = lean;
    });
  }
}
