import { Prop, part } from '../props/Prop';
import { paint } from '../materials/palette';
import { wovenCloth } from '../materials/weave';
import { PROUD, SEAM } from '../props/joinery';

/** The cloth's thickness, and the lace hem's height round its drop (m). */
const THICKNESS = 0.003;
const HEM = 0.03;

/**
 * A tablecloth thrown over a table (Mémé's dining table): a sheet over the top, a drop down each side, a lace hem
 * along the bottom of each drop. Built for a table `width` x `depth` with its top at `top`; origin on the floor under
 * the table's middle, like the table's own. Whatever stands on it stands at `topHeight`. Never collides (the table does).
 */
export class TableCloth extends Prop {
  readonly contactShadow = false;
  readonly topHeight: number;

  constructor({ width, depth, top, drop = 0.18, color = 0xf1ebde }: { width: number; depth: number; top: number; drop?: number; color?: number }) {
    super();
    this.name = 'TableCloth';
    this.topHeight = top + THICKNESS;
    const cloth = wovenCloth(color, 0.95);
    const hem = paint(0xf6f1e4, 0.9);
    const w = width + 2 * (PROUD + THICKNESS);
    const d = depth + 2 * (PROUD + THICKNESS);
    part(this, w, THICKNESS, d, cloth, { y: top + THICKNESS / 2 });
    // The drops hang just off the table's edges, under the sheet; the hem a hair proud of each.
    const y = top - drop / 2 - SEAM;
    // The hem wraps the drop's foot, PROUD below it too.
    const hemY = top - drop - SEAM - PROUD + HEM / 2;
    for (const s of [-1, 1]) {
      part(this, width, drop, THICKNESS, cloth, { y, z: s * (depth / 2 + PROUD + THICKNESS / 2) });
      part(this, THICKNESS, drop, depth, cloth, { y, x: s * (width / 2 + PROUD + THICKNESS / 2) });
      part(this, width + 2 * PROUD, HEM, THICKNESS + 2 * PROUD, hem, { y: hemY, z: s * (depth / 2 + PROUD + THICKNESS / 2) });
      part(this, THICKNESS + 2 * PROUD, HEM, depth - 2 * PROUD, hem, { y: hemY, x: s * (width / 2 + PROUD + THICKNESS / 2) });
    }
  }
}
