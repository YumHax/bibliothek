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
  /** The shop's own colour (its plan's `accent`, `shop/plans`): the door card's OPEN side, the mosaic's border. */
  accent: string;
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
    accent: '#7a5234',
    riser: { style: 'panels', colors: ['#4a3826', '#6a5238'] },
    fascia: 'corbels',
    sign: { end: 'right' },
    mosaic: ['#e8dcc4', '#7a5234'],
    glass: ['FINE USED FURNITURE', 'DELIVERED TO YOUR DOOR'],
    displays: ['armchair', 'chest'],
  },
  electronics: {
    accent: '#2e5a8a',
    riser: { style: 'enamel', colors: ['#1a2228', '#b8c0c8'] },
    fascia: 'lightbox',
    sign: { end: 'left' },
    mosaic: ['#d8d8d0', '#2e5a8a'],
    glass: ['TELEVISION · RADIO', 'REPAIRS · SALES · SPARES'],
    displays: ['tvStack', 'tvBench'],
  },
  pets: {
    accent: '#2f6a6a',
    riser: { style: 'tiles', colors: ['#2f6a6a', '#e8e2d0'] },
    fascia: 'slim',
    sign: { end: 'left' },
    mosaic: ['#f0ead8', '#2f6a6a'],
    glass: ['PETS & AQUARIA', 'FOOD · TOYS · ADVICE'],
    displays: ['catBed', 'petFood'],
  },
  florist: {
    accent: '#5a3f6a',
    riser: { style: 'tiles', colors: ['#3f5a3a', '#e8e0d4'] },
    fascia: 'dentils',
    sign: { end: 'right' },
    mosaic: ['#e8e0d4', '#5a3f6a'],
    glass: ['CUT FLOWERS', 'PLANTS · WEDDINGS · WREATHS'],
    displays: ['bouquetTiers', 'buckets'],
  },
};

/** Whether a kind of shop is a walk-in one, its front standing out of the wall (and keeping no shutter). */
export function hasShopfront(kind: ShopKind): kind is FrontKind {
  return kind in SHOPFRONTS;
}

/*
 * THE SHOPFRONT KIT: every front the walker passes close by is built in 3D (`Shopfronts`), one of three variants.
 * - `plain`: the street's other shops on the near and mid facades. A timber front set just proud of the wall
 *   (`PLAIN`): pilasters on plinths at both ends, carrying consoles under a moulded cornice; between them the
 *   fascia board, its name lettered sharp (`fasciaLettering`), over a head; under it a surround with the door and the
 *   display windows cut out of it, so the glass (the room behind it, `relief/ShopInteriors`) and the door sit back
 *   in their reveals, a sill and a panelled stall riser under each window, a transom bar across the glass. The
 *   awning hangs from the head's face; the shutter's box and curtain run between the pilasters.
 * - `walkIn`: the walk-in shops (`SHOPFRONTS` above): display windows standing out on their risers.
 * - `landmark`: RETRO GAMES and the arcade, flush, in enamel and chrome (the arcade's edged in neon).
 * The far facades (painted coarser than `KIT_DETAIL`) keep their painted fronts: seen from 15 m and more.
 */
type FrontVariant = 'plain' | 'walkIn' | 'landmark';

/** The painted detail (px per metre, `FacadeSpec.detail`) from which a facade's ordinary shops are built in 3D. */
const KIT_DETAIL = 20;

/**
 * The plain front's measures (metres; `out` from the wall). Everything between the pilasters stays behind the
 * shutter's curtain (`relief/Shutters`, 0.09 out); each face stands at least 2 cm off any parallel face in front of
 * or behind it, so none fights another down the street.
 */
export const PLAIN = {
  pilaster: 0.24,
  pilasterOut: 0.14,
  /** Plinth and capital, a little wider and deeper than the pilaster. */
  baseOut: 0.16,
  plinth: 0.3,
  capital: [2.83, 2.95] as const,
  /** The surround round the openings, and the reveals' depth. */
  surroundOut: 0.06,
  /** The display windows' sill, the riser's raised panels, the transom and door bars (inside the reveals). */
  sillOut: 0.075,
  panelOut: 0.075,
  barOut: 0.035,
  transom: 2.3,
  /** The head under the fascia, the fascia board, the consoles at its ends, the cornice and its lip. */
  head: [2.95, 3.05] as const,
  headOut: 0.12,
  board: [3.05, 3.75] as const,
  boardOut: 0.09,
  consoleOut: 0.2,
  cornice: [3.75, 3.85] as const,
  corniceOut: 0.24,
  lip: [3.85, 3.9] as const,
  lipOut: 0.27,
} as const;

/** How (or whether) a shop of `kind` on a facade painted at `detail` px/m is built in 3D. */
export function frontVariant(detail: number, kind: ShopKind): FrontVariant | null {
  if (kind === 'shut') return null;
  if (kind === 'retro' || kind === 'arcade') return 'landmark';
  if (hasShopfront(kind)) return 'walkIn';
  return detail >= KIT_DETAIL ? 'plain' : null;
}

/** The landmark fronts' pilaster width (`landmarkFront`). */
export const LANDMARK_PILASTER = 0.28;

/** How far in from each end of a front its pilasters reach: where a shutter runs (none for a painted front). */
export function pilasterWidth(variant: FrontVariant | null): number {
  return variant === 'plain' ? PLAIN.pilaster : variant === 'landmark' ? LANDMARK_PILASTER : 0;
}

/**
 * How far out of the wall a front's awning is fixed: on a plain front, so its canvas starts just clear of the head's
 * face (it hinges inside the head: rolled up, it disappears into it); else on the wall.
 */
export function awningOut(variant: FrontVariant | null): number {
  return variant === 'plain' ? PLAIN.headOut - 0.015 : 0;
}
