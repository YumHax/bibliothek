import type { ShopPlan } from '../shopPlan';
import { DOORMAT_AT, FRONT_EXIT, OPEN_SIGN_AT, arrival, customerDoor, shopRoom } from './shared';

const FURNITURE_ROOM = shopRoom(10, 8, { walls: 0xe8dcc8, ceiling: 0xf2ede4, trim: 0x6a5a48 });

// SECOND HOME, across the street by the pharmacy: a showroom of second-hand furniture, a bedroom along the back
// wall behind a folding screen, a living room in the middle, a kitchen and a reading corner on the right, the hall and
// the prints on the left, a wall of mirrors and clocks on the right; every lamp on show lit, the window dressed.
export const FURNITURE_SHOP: ShopPlan = {
  shop: 'furniture',
  accent: 0x7a5234,
  room: FURNITURE_ROOM,
  arrival: arrival(FURNITURE_ROOM.depth),
  exit: FRONT_EXIT,
  lamp: { kind: 'pendant', at: { ceiling: [0, 0] }, switchAt: { wall: 'front', along: -0.8, y: 1.1 } },
  counter: { at: { floor: [3.9, 2.4], rotationY: -Math.PI / 2 }, width: 1.6 },
  clerk: {
    seed: 71,
    lines: [
      '“Whatever you buy goes up your stairs today. Five floors, and the lads don’t complain. Much.”',
      '“That armchair? Came out of a house on Park Street. Sat in by a retired projectionist.”',
      '“The bed is only for looking at, I’m afraid. The last man who tried it slept till closing.”',
      '“The list of everything is on the counter, if you’d rather not walk round.”',
    ],
    callOuts: ['All in good nick!', 'Delivered today!'],
    thanks: [
      '“Good choice. It’ll be upstairs by tonight: the lads are on their way.”',
      '“Sold! Mind the stairs when they bring it up, it’s heavier than it looks.”',
      '“Lovely. That one’s been waiting for the right flat.”',
    ],
    chores: [
      // Straightens the kitchen chairs, then back behind the counter.
      { path: [[4.55, 1.5], [4.45, -0.9], [3.9, -1.05]], yaw: Math.PI, pose: 'play', seconds: 6, mutter: 'There.' },
      // A look at the reading corner's lamp.
      { path: [[4.55, 1.6], [3.2, 1.3], [2.5, 1.25]], yaw: Math.PI, pose: 'think', seconds: 5 },
    ],
  },
  customer: {
    seed: 5,
    door: customerDoor(FURNITURE_ROOM.depth),
    hub: [0.3, 2.3],
    spots: [
      { at: [-0.6, 1.5], yaw: Math.PI },
      // Off the spot the clerk looks over the reading corner's lamp from.
      { at: [1.75, 1.85], yaw: Math.PI },
      { at: [-3.0, 0.0], yaw: Math.PI },
    ],
    lines: ['“Just looking. My wife wants a sideboard. I want a bed.”', '“Everything here has a story, he says. I just want a chair.”'],
  },
  window: { along: -3.0, width: 2.2, height: 1.85 },
  // Deep enough for the armchair the window shows the street (docs/shops.md "The window").
  windowDisplay: { depth: 0.8 },
  // A big room of lamps: three real lights lent round the glows nearest the eye.
  glowLights: 3,
  fixtures: [
    // The shop's name over the back wall, the OPEN card on the door's glass, the mat inside the door (`common/`).
    { kind: 'prop', prop: 'nameBoard', options: { width: 1.8, height: 0.4 }, at: { wall: 'back', along: -3.0, y: 2.45 } },
    { kind: 'prop', prop: 'openSign', at: OPEN_SIGN_AT },
    { kind: 'prop', prop: 'doormat', options: { width: 0.95, depth: 0.55 }, at: DOORMAT_AT(FURNITURE_ROOM.depth) },
    // Sage boarding and a cream dado rail round the walls, a picture rail up under the ceiling.
    { kind: 'prop', prop: 'panelledDado', options: { height: 0.9, color: 0x9aa58c, rail: 0xf2ead8 }, at: { floor: [0, 0] } },
    { kind: 'prop', prop: 'panelledDado', options: { height: 2.72, railOnly: true, rail: 0x6a5a48 }, at: { floor: [0, 0] } },
    // Cushions and table lamps on the front wall's shelf, the rugs still rolled up in the back corner, the sack truck by the counter.
    { kind: 'goodsShelf', at: { wall: 'front', along: 2.6, y: 0 }, options: { width: 1.4, shelves: 4, stock: 'homewares', seed: 17 } },
    { kind: 'rugRolls', at: { floor: [4.92, -3.9], rotationY: -Math.PI / 2 }, options: { count: 4, seed: 23 } },
    { kind: 'trolley', at: { floor: [4.45, 3.55], rotationY: -Math.PI / 2 } },
    // Not on show yet: a wardrobe under a dust sheet in the back corner, kept for Mr. Dupont; a job lot of café chairs, sold, by the counter.
    // Between the sideboard's end and the rolled rugs.
    { kind: 'prop', prop: 'dustSheets', options: { width: 0.62 }, at: { floor: [3.92, -3.68] } },
    { kind: 'prop', prop: 'chairStack', at: { floor: [3.72, 3.55], rotationY: Math.PI } },
    // The shop's clock over the dresser and the mirror, ticking.
    { kind: 'clock', at: { wall: 'back', along: 0.2, y: 2.1 } },
    // The right wall hung salon-style between the kitchen and the counter, spots on it from the ceiling.
    { kind: 'prop', prop: 'salonWall', at: { wall: 'right', along: 0.2, y: 1.75 } },
    { kind: 'prop', prop: 'trackSpots', options: { length: 1.6, count: 3, aim: 0.7, light: 1.0, reach: 1.1 }, at: { ceiling: [4.2, 0.2], rotationY: Math.PI / 2 } },
    // The lamps on show lit with the switch; pendants over the kitchen table, a fan turning over the hall.
    { kind: 'prop', prop: 'showroomLamps', at: { floor: [0, 0] } },
    { kind: 'prop', prop: 'showroomPendants', at: { ceiling: [3.9, -1.9] } },
    { kind: 'prop', prop: 'showroomFan', at: { ceiling: [-2.3, 1.3] } },
    // The folding screen closing the bedroom off from the living room.
    { kind: 'prop', prop: 'foldingScreen', at: { floor: [-1.35, -2.3], rotationY: Math.PI / 2 } },
    // The rooms on show as if lived in: cushions on the bed, the dresser's top, a throw on an armchair, the kitchen table laid.
    { kind: 'prop', prop: 'bedCushions', at: { wall: 'back', along: -3.0, y: 0 } },
    { kind: 'prop', prop: 'dresserTop', at: { wall: 'back', along: -0.4, y: 0 } },
    { kind: 'prop', prop: 'armchairThrow', options: { side: 1 }, at: { floor: [0.0, 0.35], rotationY: -0.5 } },
    { kind: 'prop', prop: 'tableDressing', at: { floor: [3.9, -1.9] } },
    // The shop's own plants: a fig in the bedroom's corner, a monstera by the reading corner.
    { kind: 'prop', prop: 'showroomPlant', options: { kind: 'fig', pot: 'ceramic' }, at: { floor: [-4.5, -3.45] } },
    { kind: 'prop', prop: 'showroomPlant', options: { kind: 'monstera', pot: 'terracotta' }, at: { floor: [3.3, -0.4] } },
    // What the shopkeeper put up: a card over the bed, the happy customers by the door.
    { kind: 'prop', prop: 'notice', options: { lines: ['PLEASE', 'don’t sit on the bed', '– the management'], fixing: 'pin' }, at: { wall: 'back', along: -2.4, y: 1.72 } },
    {
      kind: 'prop',
      prop: 'corkBoard',
      options: {
        width: 0.8,
        height: 0.55,
        heading: 'HAPPY HOMES',
        items: [
          { lines: ['Mme Roux', 'the rugs!'], photo: ['#c8785a', '#3e4a5c'] },
          { lines: ['“Fits the stairs,', 'just.” – B.'] },
          { lines: ['Flat 5B'], photo: ['#e8d8b8', '#8fa383'] },
          { lines: ['THANK YOU', 'for the bed', 'x Tom & Ana'] },
          { lines: ['Park St 12'], photo: ['#9ac0d8', '#6a4a30'] },
        ],
      },
      at: { wall: 'front', along: 1.3, y: 1.5 },
    },
    { kind: 'prop', prop: 'notice', options: { lines: ['DELIVERED TODAY', 'up any stairs', 'ask at the till'], hand: 'poster', accent: 0x7a5234, width: 0.32, height: 0.45 }, at: { wall: 'left', along: 1.9, y: 1.55 } },
    // The counter's clutter: the swatch book fanned open, the delivery ledger.
    { kind: 'prop', prop: 'swatchBook', on: 'counter', spot: [0.33, 0.02], yaw: 0.2 },
    { kind: 'prop', prop: 'deliveryLedger', on: 'counter', spot: [-0.42, 0], yaw: -0.05 },
    // The window: an armchair, its side table and the floor lamp, lit.
    { kind: 'prop', prop: 'windowVignette', on: 'windowDisplay', spot: [0, 0.02] },
    // The floor's wear: heels at the counter, a trodden way in from the door.
    { kind: 'prop', prop: 'floorScuffs', options: { kind: 'heels', width: 1.4, depth: 0.8, amount: 0.55 }, at: { floor: [3.2, 2.4], rotationY: Math.PI / 2 } },
    { kind: 'prop', prop: 'floorScuffs', options: { kind: 'grime', width: 1.3, depth: 1.4, amount: 0.4 }, at: { floor: [0, 2.75] } },
    { kind: 'prop', prop: 'floorScuffs', options: { kind: 'grime', width: 1.5, depth: 2.2, amount: 0.25 }, at: { floor: [0.2, 0.9], rotationY: 0.3 } },
  ],
  displays: [
    // The bedroom along the back wall.
    { good: 'bed', at: { wall: 'back', along: -3.0, y: 0 } },
    { good: 'nightstands', at: { wall: 'back', along: -1.8, y: 0 } },
    { good: 'bedroomRug', at: { floor: [-3.0, -1.5] }, collides: false, tag: 'card' },
    { good: 'dresser', at: { wall: 'back', along: -0.4, y: 0 } },
    { good: 'mirror', at: { wall: 'back', along: 0.75, y: 0 } },
    { good: 'sideboard', at: { wall: 'back', along: 2.6, y: 0 } },
    // The living room in the middle.
    { good: 'livingRug', at: { floor: [-0.6, 0.45] }, collides: false, tag: 'card' },
    { good: 'armchair', variant: 0, at: { floor: [-1.15, 0.35], rotationY: 0.5 } },
    { good: 'armchair', variant: 1, at: { floor: [0.0, 0.35], rotationY: -0.5 } },
    { good: 'sideTable', at: { floor: [-0.55, -0.15] } },
    { good: 'floorLamp', at: { floor: [-1.95, -0.3] } },
    { good: 'floorCushions', at: { floor: [1.0, 1.1], rotationY: 0.3 }, tag: 'card' },
    // A kitchen and a reading corner on the right.
    { good: 'kitchenTable', at: { floor: [3.9, -1.9] } },
    // The runner under the table, as it would lie in the kitchen.
    { good: 'kitchenRug', at: { floor: [3.9, -1.9] }, collides: false, tag: 'card' },
    { good: 'readingCorner', at: { floor: [2.2, 0.3], rotationY: -0.4 } },
    // The hall and the walls on the left, the balcony's set by the window.
    { good: 'framedPrint', variant: 0, at: { wall: 'left', along: -2.6, y: 1.65 }, collides: false, tag: 'wall' },
    { good: 'framedPrint', variant: 1, at: { wall: 'left', along: -1.9, y: 1.65 }, collides: false, tag: 'wall' },
    { good: 'framedPrint', variant: 2, at: { wall: 'left', along: -1.2, y: 1.65 }, collides: false, tag: 'wall' },
    { good: 'hallStand', at: { wall: 'left', along: 0.3, y: 0 } },
    { good: 'bathMat', at: { floor: [-4.1, 1.7] }, collides: false, tag: 'card' },
    // Clear of the window's display bed (0.8 deep).
    { good: 'bistroSet', at: { floor: [-3.6, 2.35] } },
    // The collector's corner: the display case against the left wall past the prints, the pedestal in the open floor
    // between the living room and the sideboard, the label maker on the counter by the swatch book.
    { good: 'displayCase', at: { wall: 'left', along: -0.5, y: 0 } },
    { good: 'pedestal', at: { floor: [1.4, -1.5], rotationY: 0.4 } },
    { good: 'labelMaker', on: 'counter', spot: [0.02, -0.06], yaw: 0.35 },
  ],
};
