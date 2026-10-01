import type { ShopKind } from '../streetPlan';

/*
 * THE WALK-IN SHOPS' FRONTS (the furniture shop, TV REPAIR, PAWS & CLAWS, the florists): what each kind builds in 3D
 * in front of its painted facade (`ShopfrontRelief`). The display windows stand out of the wall `DEPTH` on a stall
 * riser, their glass at the front, a window display on the riser behind it, the room behind that drawn in the pane on
 * the wall (`relief/ShopInteriors`); the door stays in the wall, so it is set back between the windows' returns, a
 * mosaic on the step. Over them the head and the fascia's mouldings (each kind its own profile), a sign hung out on a
 * bracket, the shop's lines lettered on its glass, and on the door an OPEN / CLOSED card turned with the hours. These
 * kinds keep no roller shutter (`relief/Shutters`): their windows stay softly lit after closing.
 */

export type FrontKind = 'furniture' | 'electronics' | 'pets' | 'florist';

/** What a window display shows (`windowDisplays`). */
export type DisplayId = 'tvStack' | 'tvBench' | 'catBed' | 'petFood' | 'bouquetTiers' | 'buckets' | 'armchair' | 'chest';

/** A card in the atlas (`shopfrontCanvas`), standing in a display. */
export type CardId = 'repairs' | 'tested' | 'adopt' | 'paws' | 'fresh' | 'delivered';

export interface ShopfrontLook {
  /** The stall riser under the glass: tiles in two colours, raised wooden panels, or dark enamel with a chrome kick. */
  riser: { style: 'tiles' | 'panels' | 'enamel'; colors: [string, string] };
  /** The fascia's mouldings round the painted board: a deep cornice on corbels, a cornice with dentils, a slim frame, a lightbox's metal edge (its neon sign over it). */
  fascia: 'corbels' | 'dentils' | 'slim' | 'lightbox';
  /** The sign on its bracket: which end of the front, the board's shape (the atlas tile's). */
  sign: { end: 'left' | 'right' };
  /** The mosaic on the door's step. */
  mosaic: [string, string];
  /** Lettered on the glass, one line per display window. */
  glass: [string, string];
  /** What stands in the windows, the first and the second. */
  displays: [DisplayId, DisplayId];
}

/** How far the display windows stand out of the wall, the glass's bottom (the riser's top) and top (under the head), the head's top. */
export const FRONT = { depth: 0.45, sill: 0.55, glassTop: 2.75, headTop: 3.05, fasciaTop: 3.75 } as const;
/** The hanging sign: its bracket's arm (height, reach) and the board (from, to out of the wall; bottom, top). */
export const SIGN = { arm: 4.0, reach: 1.02, out0: 0.36, out1: 0.98, bottom: 3.24, top: 3.86 } as const;

export const SHOPFRONTS: Record<FrontKind, ShopfrontLook> = {
  furniture: {
    riser: { style: 'panels', colors: ['#4a3826', '#6a5238'] },
    fascia: 'corbels',
    sign: { end: 'right' },
    mosaic: ['#e8dcc4', '#7a5234'],
    glass: ['FINE USED FURNITURE', 'DELIVERED TO YOUR DOOR'],
    displays: ['armchair', 'chest'],
  },
  electronics: {
    riser: { style: 'enamel', colors: ['#1a2228', '#b8c0c8'] },
    fascia: 'lightbox',
    sign: { end: 'left' },
    mosaic: ['#d8d8d0', '#2e5a8a'],
    glass: ['TELEVISION · RADIO', 'REPAIRS · SALES · SPARES'],
    displays: ['tvStack', 'tvBench'],
  },
  pets: {
    riser: { style: 'tiles', colors: ['#2f6a6a', '#e8e2d0'] },
    fascia: 'slim',
    sign: { end: 'left' },
    mosaic: ['#f0ead8', '#2f6a6a'],
    glass: ['PETS & AQUARIA', 'FOOD · TOYS · ADVICE'],
    displays: ['catBed', 'petFood'],
  },
  florist: {
    riser: { style: 'tiles', colors: ['#3f5a3a', '#e8e0d4'] },
    fascia: 'dentils',
    sign: { end: 'right' },
    mosaic: ['#e8e0d4', '#5a3f6a'],
    glass: ['CUT FLOWERS', 'PLANTS · WEDDINGS · WREATHS'],
    displays: ['bouquetTiers', 'buckets'],
  },
};

/** Whether a kind of shop has its front built in 3D (and keeps no shutter). */
export function hasShopfront(kind: ShopKind): kind is FrontKind {
  return kind in SHOPFRONTS;
}
