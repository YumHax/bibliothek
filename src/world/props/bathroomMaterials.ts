import { paint, standard } from '../materials/palette';

/*
 * The materials every sanitary fitting shares: one white ceramic, one chrome, so the bathtub,
 * the basin and the WC read as one suite. Palette materials, so never mutated:
 * a fitting that changes one (the tub's water) clones it.
 */

/** Glazed white ceramic (sanitaryware, tiles' cousin). */
export const CERAMIC = paint(0xf4f4f0, 0.25);
/** Polished chrome for taps, rails and brackets. */
export const CHROME = standard({ color: 0xd8dde0, metalness: 1, roughness: 0.15 });
/** White plastic of seats and lids: a touch less glossy than the ceramic. */
export const WHITE_PLASTIC = paint(0xf7f7f4, 0.4);
/**
 * Standing water (a filled tub, the WC's bowl): a pale, glossy, half-see-through sheet. Plain alpha
 * blending, no transmission pass: cheap, and the canvas alpha stays 1 over the opaque room behind it.
 */
export const STILL_WATER = standard({
  color: 0xa9c8cc,
  roughness: 0.03,
  metalness: 0,
  transparent: true,
  opacity: 0.6,
  depthWrite: false,
});
