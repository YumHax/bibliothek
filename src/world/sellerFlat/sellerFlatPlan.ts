import type { RoomOptions } from '../Room';
import type { Placement } from '../Placement';
import type { DecorEntry } from '../props/decor';
import type { SellerKind } from '@/classifieds/rules';

/*
 * THE SELLER'S FLAT, zone-local (origin at the centre of its floor; front = +z, the window on Front Street; back = -z,
 * the landing door). A living room in Park Corner Mansions, over PARK FRUIT & VEG: whoever's small ad the player rang
 * lives here today (docs/economy.md "Small ads and the seller's flat"), dressed for them (`decorBy`). 5.2 x 4.4 m, 2.7 m
 * high. Reached by the bell at the mansion block's door (`street/MansionBell`), left by the landing door. The games
 * lie on the dining table with the seller behind it; the console, if they sell it, on a box of spares by the window.
 */

export const SELLER_FLAT_ROOM: RoomOptions = {
  width: 5.2,
  depth: 4.4,
  height: 2.7,
  // The window's wall lets the daylight in; the rest is party walls and the landing.
  opaqueWalls: ['back', 'left', 'right'],
  finish: { walls: 0xe8dcc4, ceiling: 0xf4efe6, trim: 0xd6ccb8 },
};

export const SELLER_FLAT_PLAN = {
  room: SELLER_FLAT_ROOM,
  /** Where the bell lets the player in: just inside the landing door, looking into the room. */
  arrival: { at: [-1.7, -1.45] as [number, number], yaw: Math.PI },
  /** The landing door, back down to the street. */
  exit: { wall: 'back', along: -1.7, y: 0 } as Placement,
  pendant: { ceiling: [0.4, 0.1] } as Placement,
  lightSwitch: { wall: 'back', along: -1.0, y: 1.1 } as Placement,
  /** One window on the street, its curtains half drawn (no sun of its own: no shadow map). */
  window: { wall: 'front' as const, along: 0.8, width: 1.3, height: 1.45 },
  /**
   * Where that window really is, in the street's frame (`outlook/frames`): in Park Corner Mansions (facade `fA`, its
   * face at z 12 towards Front Street), over PARK FRUIT & VEG, on the first floor (`storey` 2); its glass's middle
   * 3 m along the facade and the wall's thickness in. The view through it is Front Street from there, built in 3D.
   */
  outlook: { at: [-32, 12.3] as [number, number], storey: 2, without: ['fA'] },

  /** The dining table the lot is laid out on, its long side (+z of the boxes) towards the room's door side. */
  table: { at: { floor: [0.9, 0.0], rotationY: Math.PI } as Placement, width: 1.4, depth: 0.8 },
  chairs: [
    { floor: [-0.08, 0.0], rotationY: Math.PI / 2 },
    { floor: [1.88, 0.0], rotationY: -Math.PI / 2 },
  ] as Placement[],
  /**
   * The copies on the table, table-local [x, z] on its top: two rows of four, the buyer's side at +z. More than eight
   * and the rest wait in the box by the table (`spillBox`).
   */
  spots: [
    [-0.48, 0.17], [-0.16, 0.17], [0.16, 0.17], [0.48, 0.17],
    [-0.48, -0.19], [-0.16, -0.19], [0.16, -0.19], [0.48, -0.19],
  ] as [number, number][],
  /** Behind the table, facing the player across it. */
  seller: { at: [0.9, 0.78] as [number, number], yaw: Math.PI },
  /** The box of spares by the window, the console on its lid when it is for sale. */
  spares: { at: { floor: [2.1, -0.95], rotationY: 0.2 } as Placement, crate: { style: 'cardboard', width: 0.45, height: 0.34, depth: 0.38, label: 'SPARES', seed: 4 } as const },
  /** The sideboard under the TV, its top a place for a scripted ad's note (`clueAt`, sideboard-local). */
  sideboard: { at: { wall: 'front', along: -1.5, y: 0 } as Placement, clueAt: [0.5, 0.02] as [number, number] },
  /** The portable set on the sideboard, sideboard-local x. */
  tvAt: -0.35,
  armchairs: [
    { floor: [-1.95, 0.15], rotationY: 0.3 },
    { floor: [-0.95, 0.15], rotationY: -0.3 },
  ] as Placement[],

  /** What every seller's flat has. */
  decor: [
    { kind: 'rug', at: { floor: [-1.45, 0.95] }, options: { width: 1.9, depth: 1.5, field: 0x7a4a3a, border: 0xd8c7a0, motif: 0x3e5a6c } },
    { kind: 'sideTable', at: { floor: [-1.45, -0.05] }, options: { radius: 0.2, mug: true } },
    { kind: 'doormat', at: { floor: [-1.7, -1.95] }, options: { width: 0.8, depth: 0.45, seed: 9 } },
    { kind: 'radiator', at: { wall: 'right', along: -0.9, y: 0 }, options: { style: 'column', width: 0.8 } },
    { kind: 'wallCalendar', at: { wall: 'back', along: 0.3, y: 1.5 }, options: { seed: 12 } },
    { kind: 'smokeDetector', at: { ceiling: [-1.2, -1.0] } },
    { kind: 'plant', at: { corner: 'front-right', inset: 0.35 }, options: { kind: 'yucca', pot: 'ceramic', seed: 31 } },
    { kind: 'wallSocket', at: { wall: 'right', along: 0.9, y: 0 }, options: { gangs: 2 } },
  ] as DecorEntry[],

  /** What says who lives here. */
  decorBy: {
    // A parent with a grown-up child's things boxed up for the charity shop.
    clearOut: [
      { kind: 'pictureFrame', at: { wall: 'left', along: -0.4, y: 1.6 }, options: { motif: 'botanical', seed: 41, width: 0.45, height: 0.55 } },
      { kind: 'pictureFrame', at: { wall: 'right', along: 0.1, y: 1.55 }, options: { motif: 'sunset', seed: 42, width: 0.6, height: 0.42 } },
      { kind: 'crate', at: { floor: [2.25, 1.25], rotationY: -0.2 }, options: { style: 'cardboard', stack: 2, label: 'CHARITY', seed: 5 } },
      { kind: 'crate', at: { floor: [2.25, 0.6], rotationY: 0.1 }, options: { style: 'cardboard', label: 'HIS ROOM', seed: 6 } },
      { kind: 'flyer', at: { wall: 'right', along: 1.3, y: 1.45 }, options: { style: 'paper', title: 'SPACE RANGERS', lines: ['The movie', 'This summer'], width: 0.4, height: 0.56, accent: 0x2f6b8f, seed: 3 } },
      { kind: 'cushion', at: { floor: [-0.55, 1.5], rotationY: 0.5 }, options: { color: 0xc8785a } },
    ],
    // Moving out: the walls bare, the pictures down, boxes everywhere.
    mover: [
      { kind: 'crate', at: { floor: [2.2, 1.3], rotationY: -0.15 }, options: { style: 'cardboard', stack: 3, label: 'KITCHEN', seed: 7 } },
      { kind: 'crate', at: { floor: [1.6, 1.8], rotationY: 0.25 }, options: { style: 'cardboard', stack: 2, label: 'BOOKS', seed: 8 } },
      { kind: 'crate', at: { floor: [2.25, 0.55], rotationY: 0.05 }, options: { style: 'cardboard', label: 'FRAGILE', seed: 9 } },
      { kind: 'crate', at: { floor: [-2.3, -1.4], rotationY: 0.3 }, options: { style: 'cardboard', stack: 2, label: 'BEDROOM', seed: 10 } },
      { kind: 'leaningMirror', at: { wall: 'left', along: -0.5, y: 0 }, options: {} },
    ],
    // A collector's: framed prints, a shelf of curios, the hi-fi.
    collector: [
      { kind: 'pictureFrame', at: { wall: 'left', along: -0.6, y: 1.6 }, options: { motif: 'abstract', seed: 51, width: 0.5, height: 0.5, frameColor: 0x1f1f22 } },
      { kind: 'pictureFrame', at: { wall: 'left', along: 0.3, y: 1.6 }, options: { motif: 'roofs', seed: 52, width: 0.5, height: 0.5, frameColor: 0x1f1f22 } },
      { kind: 'wallShelf', at: { wall: 'right', along: 0.6, y: 1.2 }, options: { width: 1.0, tiers: 2, items: 'mixed', seed: 6 } },
      { kind: 'speaker', at: { floor: [-2.35, 1.8], rotationY: 0.4 }, options: {} },
      { kind: 'plant', at: { corner: 'back-right', inset: 0.32 }, options: { kind: 'monstera', pot: 'ceramic', seed: 33 } },
    ],
    // A late father's things down from the loft: dusty boxes, an old crate.
    loft: [
      { kind: 'pictureFrame', at: { wall: 'left', along: -0.4, y: 1.6 }, options: { motif: 'mountains', seed: 61, width: 0.55, height: 0.4, frameColor: 0x6a4a2a } },
      { kind: 'crate', at: { floor: [2.25, 1.2], rotationY: 0.15 }, options: { style: 'wood', stack: 2, seed: 11 } },
      { kind: 'crate', at: { floor: [2.2, 0.5], rotationY: -0.25 }, options: { style: 'cardboard', label: 'DAD’S THINGS', seed: 12 } },
      { kind: 'crate', at: { floor: [1.55, 1.8], rotationY: 0.4 }, options: { style: 'cardboard', label: 'LOFT', seed: 13 } },
      { kind: 'cobweb', at: { wall: 'back', along: 2.6, y: 2.7 }, options: { size: 0.35, spread: 'left', seed: 2 } },
    ],
  } as Record<SellerKind, DecorEntry[]>,
};
