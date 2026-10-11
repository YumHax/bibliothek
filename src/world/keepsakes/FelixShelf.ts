import { paint, timber } from '../materials/palette';
import { Prop, part } from '../props/Prop';

interface FelixShelfOptions {
  width: number;
  depth: number;
  /** Height of the upper board over the lower one. */
  spacing: number;
}

const BRACKET = paint(0x2b2b2e, 0.5);
const BOARD = timber(0x6f4a2c, 0.5);
const THICKNESS = 0.022;
/** The brackets' steel (m). */
const BRACKET_T = 0.01;

/**
 * Félix's shelf (docs/grandma.md "What the memories leave behind"): two short walnut boards on black brackets, put up
 * with the first keepsake Mémé gives, what she gives standing on it (each placed with `placeWith`, riding it when the
 * player moves it along the walls). Wall-hung: origin at the middle of the lower board's back edge, on its top face,
 * +z into the room. Never collides.
 */
export class FelixShelf extends Prop {
  constructor(readonly options: FelixShelfOptions) {
    super();
    this.name = 'FelixShelf';
    const { width, depth, spacing } = options;
    for (const y of [0, spacing]) {
      part(this, width, THICKNESS, depth, BOARD, { y: y - THICKNESS / 2, z: depth / 2 });
      for (const side of [-1, 1]) {
        const bx = side * (width / 2 - 0.06);
        part(this, 0.014, 0.11, BRACKET_T, BRACKET, { x: bx, y: y - THICKNESS - 0.055, z: BRACKET_T / 2 }).castShadow = false;
        part(this, 0.014, BRACKET_T, depth * 0.75, BRACKET, { x: bx, y: y - THICKNESS - BRACKET_T / 2, z: depth * 0.375 + BRACKET_T }).castShadow = false;
      }
    }
  }
}
