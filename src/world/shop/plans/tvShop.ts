import type { ShopPlan } from '../shopPlan';
import { DOORMAT_AT, FRONT_EXIT, OPEN_SIGN_AT, arrival, customerDoor, shopRoom } from './shared';

const TV_ROOM = shopRoom(6, 5, { floor: 'concrete', walls: 0xc8ccc4, ceiling: 0xd8d8d4, trim: 0x4a4e52 });

// TV REPAIR, the workshop on Park Street: a wall of sets (most on snow, one on the test card, one rolling, a couple
// dead with their tickets), the long bench along the right wall under its tool board (the set with its back off, the
// soldering iron smoking now and then, the magnifier lamp, the projector for sale at its end), the shelf of repairs
// waiting by the window, the parts cabinet and the calendar behind the counter, a glass case of small electronics by
// the till, boxes in the corner, cables along the ceiling, two fluorescent battens (one stutters), and the three sets
// stacked in the window on snow, as the street sees them.
export const TV_SHOP: ShopPlan = {
  shop: 'electronics',
  accent: 0x2e5a8a,
  room: TV_ROOM,
  arrival: arrival(TV_ROOM.depth),
  exit: FRONT_EXIT,
  lamp: { kind: 'flush', at: { ceiling: [0, 0] }, switchAt: { wall: 'front', along: -1.0, y: 1.1 } },
  counter: { at: { floor: [-1.9, -1.3] }, width: 1.3 },
  clerk: {
    seed: 83,
    lines: [
      '“Everything on the tables is tested. The wall? Those are waiting for their owners.”',
      '“Projectors? I have one on the bench. Runs like new.”',
      '“A soldering iron, a radio in pieces, a smell of warm dust. You get used to it.”',
      '“They all show snow because there is nothing on. Nothing worth watching, anyway.”',
    ],
    callOuts: ['All tested!'],
    thanks: [
      '“There you go. If it ever goes fuzzy, you know where I am.”',
      '“Good pick. Give it a knock on the side if it sulks.”',
      '“Sold. It’ll be upstairs tonight, warmed up and all.”',
    ],
    chores: [
      // A knock on a set of the wall that has gone too quiet.
      { path: [[-1.0, -1.85], [0.2, -1.75]], yaw: Math.PI, pose: 'play', seconds: 4, sound: 'tap', mutter: 'Come on, you.' },
      // A look over the bench.
      { path: [[-1.0, -1.85], [1.4, -1.5], [1.75, -0.4]], yaw: Math.PI / 2, pose: 'think', seconds: 6 },
    ],
  },
  customer: {
    seed: 11,
    door: customerDoor(TV_ROOM.depth),
    // Down the aisle between the two tables, not across the kitchen table's corner.
    entry: [0, 1.3],
    hub: [0, -0.4],
    spots: [
      { at: [0.8, -1.6], yaw: Math.PI },
      { at: [1.7, 0.0], yaw: Math.PI / 2 },
      { at: [-0.8, 0.05], yaw: 0 },
    ],
    lines: ['“He fixed my mum’s set in ten minutes. Twenty years it had been broken.”', '“Just waiting for my radio. It’s always tomorrow.”'],
  },
  window: { along: 1.8, width: 1.6, height: 1.7 },
  fixtures: [
    // The shop's name over the back wall, the OPEN card on the door's glass, the mat inside the door (`common/`).
    { kind: 'prop', prop: 'nameBoard', options: { width: 1.5, height: 0.34 }, at: { wall: 'back', along: 0.4, y: 2.42 } },
    { kind: 'prop', prop: 'openSign', at: OPEN_SIGN_AT },
    { kind: 'prop', prop: 'doormat', options: { width: 0.95, depth: 0.55 }, at: DOORMAT_AT(TV_ROOM.depth) },
    // The workshop's light: a tired batten over the tables (it stutters), a single tube over the bench; cables in a tray.
    { kind: 'prop', prop: 'tubeBatten', options: { length: 1.5, drop: 0.35, flicker: true }, at: { ceiling: [0, 0.75] } },
    { kind: 'prop', prop: 'tubeBatten', options: { length: 1.2, tubes: 1, drop: 0.5, hum: false, light: 0.7 }, at: { ceiling: [2.35, -0.4], rotationY: Math.PI / 2 } },
    { kind: 'prop', prop: 'tvCableTray', options: { length: 3.2, drop: 0.3, droop: 0.6 }, at: { ceiling: [0.4, -1.75] } },
    // The back wall: the parts cabinet and the calendar behind the counter, the wall of sets, boxes in the far corner.
    { kind: 'prop', prop: 'tvPartsCabinet', at: { wall: 'back', along: -2.62, y: 0 } },
    { kind: 'prop', prop: 'tvWallCalendar', options: { notes: [[7, 'Kowalski'], [14, 'valves in'], [22, 'ring Mrs Hall'], [29, 'VAT!']] }, at: { wall: 'back', along: -1.75, y: 1.75 } },
    { kind: 'tvWall', at: { wall: 'back', along: 0.4, y: 0 }, options: { width: 3.4, rows: 3, screens: 'mixed', seed: 9 } },
    { kind: 'prop', prop: 'tvBoxStack', options: { count: 4 }, at: { floor: [2.56, -2.08], rotationY: -0.15 } },
    // The right wall: the tool board over the bench, the repairs waiting for collection by the window.
    { kind: 'prop', prop: 'tvPegboard', options: { width: 1.7, height: 0.8 }, at: { wall: 'right', along: -0.45, y: 1.48 } },
    { kind: 'table', id: 'bench', at: { floor: [2.45, -0.4], rotationY: -Math.PI / 2 }, options: { width: 2.2, depth: 0.6, wood: 0x6a5238 } },
    { kind: 'prop', prop: 'tvRepairsShelf', options: { width: 1.0 }, at: { wall: 'right', along: 1.3, y: 0 } },
    // The left wall: spares, the terms over the counter, the jobs board, the notices.
    { kind: 'prop', prop: 'corkBoard', options: { width: 0.7, height: 0.5, heading: 'JOBS', items: [
      { lines: ['Grundig 22"', 'no line hold', '— Mr Nowak'] },
      { lines: ['WANTED', 'PCL805', 'any cond.'] },
      { lines: ['Service manuals', 'lent out:', 'SABA (Reid)'] },
      { lines: ['Collect Fri', 'Mrs Lind', 'colour ok now'] },
      { lines: ['Aerials', 'fitted', 'ask inside'] },
    ] }, at: { wall: 'left', along: -2.05, y: 1.6 } },
    { kind: 'prop', prop: 'notice', options: { lines: ['REPAIRS: 3 DAYS', 'No fix, no fee.', 'Parts extra.'], width: 0.24, height: 0.18, hand: 'print', fixing: 'pin' }, at: { wall: 'left', along: -1.25, y: 1.58 } },
    { kind: 'prop', prop: 'notice', options: { lines: ['PLEASE DO NOT', 'tap the sets.', 'He does that.'] }, at: { wall: 'left', along: -0.6, y: 1.5 } },
    { kind: 'goodsShelf', at: { wall: 'left', along: 0.6, y: 0 }, options: { width: 1.4, stock: 'spares', seed: 4 } },
    { kind: 'prop', prop: 'notice', options: { lines: ['WE BUY', 'broken sets', 'cash, no questions'], paper: 0xf0e0a0 }, at: { wall: 'left', along: 1.95, y: 1.5 } },
    // The front wall by the door: the maker's poster.
    { kind: 'prop', prop: 'notice', options: { lines: ['LUMINA', 'See it in colour', 'Authorised service agent'], width: 0.42, height: 0.6, hand: 'poster', fixing: 'frame', accent: 0x2e5a8a }, at: { wall: 'front', along: -2.1, y: 1.6 } },
    // The floor: heel marks at the counter, the trodden aisle, grit where the repairer stands at the bench.
    { kind: 'prop', prop: 'floorScuffs', options: { width: 1.5, depth: 0.5, kind: 'heels' }, at: { floor: [-1.9, -0.75] } },
    { kind: 'prop', prop: 'floorScuffs', options: { width: 0.8, depth: 2.4, kind: 'grime', amount: 0.5 }, at: { floor: [0, 0.9] } },
    { kind: 'prop', prop: 'floorScuffs', options: { width: 0.6, depth: 1.9, kind: 'sawdust', amount: 0.45 }, at: { floor: [1.85, -0.4] } },
    // The tables of sets and kitchen things for sale, the glass case of small electronics by the till.
    { kind: 'table', id: 'sets', at: { floor: [-0.8, 0.7] }, options: { width: 1.1, depth: 0.55 } },
    { kind: 'table', id: 'kitchen', at: { floor: [0.8, 0.7] }, options: { width: 1.1, depth: 0.55 } },
    { kind: 'prop', prop: 'tvGadgetCase', options: { width: 0.75 }, at: { floor: [-0.8, -1.3] } },
    // The bench, from the back of the shop to the front (its x runs along the right wall towards the window, +z
    // towards the room): the radio (never off), the set with its back off, the magnifier clamped at the back, the
    // soldering station and the wisp off its iron's tip (the station's spot plus `SolderingStation.IRON_TIP`), the
    // meter, manual and tools; the projector for sale at the front end.
    { kind: 'radio', on: 'bench', spot: [-0.95, 0.02] },
    { kind: 'prop', prop: 'tvOpenSet', on: 'bench', spot: [-0.58, -0.02] },
    { kind: 'prop', prop: 'tvMagnifierLamp', on: 'bench', spot: [-0.25, -0.27] },
    { kind: 'prop', prop: 'tvSolderingStation', on: 'bench', spot: [-0.12, -0.12] },
    { kind: 'prop', prop: 'tvSolderWisp', options: { height: 0.115 }, on: 'bench', spot: [0.055, -0.14] },
    { kind: 'prop', prop: 'tvBenchTools', on: 'bench', spot: [0.38, 0.04] },
    // The counter: the spike of job slips, the jar of old valves (the till at its left end, the bell at its right).
    { kind: 'prop', prop: 'tvReceiptSpike', on: 'counter', spot: [0.04, 0.1] },
    { kind: 'prop', prop: 'tvValveJar', on: 'counter', spot: [0.22, -0.12] },
    // The window, as the street sees it: three sets stacked on snow, the REPAIRS card, both turned to the glass.
    { kind: 'prop', prop: 'tvCrtStack', on: 'windowDisplay', spot: [-0.3, -0.02], yaw: Math.PI },
    { kind: 'prop', prop: 'tvTentCard', on: 'windowDisplay', spot: [0.38, -0.08], yaw: Math.PI },
  ],
  displays: [
    { good: 'projector', on: 'bench', spot: [0.93, 0.05], collides: false },
    { good: 'crt', on: 'sets', spot: [-0.25, 0], collides: false },
    { good: 'bedroomTv', on: 'sets', spot: [0.3, 0], collides: false },
    { good: 'radio', on: 'kitchen', spot: [-0.28, 0], collides: false },
    { good: 'appliances', on: 'kitchen', spot: [0.22, 0], collides: false },
    { good: 'speakers', at: { floor: [-2.2, 1.7] } },
  ],
};
