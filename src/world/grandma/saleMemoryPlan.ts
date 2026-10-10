import type { Placement } from '../Placement';
import type { MemoryLine, MemoryShot } from '@/memories/memoryReel';

/*
 * LOT 1 TO 412 (`MEMORIES` sale, docs/story.md "Mémé"), filmed in the saleroom behind the flea market as it stands, in
 * its own zone-local metres (`saleroom/saleroomPlan`: origin at the middle of the floor, the door at z 4.5, the rostrum
 * at (0, -3.25) with the auctioneer behind it at z -3.8, the lot stand at (-1.7, -3.05), rows of chairs facing -z at
 * z -1.3, -0.2 and 0.9, places at x -2.7, -2, -1.3 left of the aisle and 1.3, 2, 2.7 right of it, seats 0.46 high;
 * numbers copied, never imported). The sale of Félix's games, as Mémé saw it from the back row with Gaspard beside
 * her: Victor Crane in the front row raising his paddle for every lot. Shots, people and beats on the film's clock (s).
 */

type Vec2 = [x: number, z: number];

/** Facing the rostrum, as the chairs do. */
const FRONT = Math.PI;

export const SALE_MEMORY_PLAN = {
  seatHeight: 0.46,
  /** Where every eye in the room goes: the rostrum. */
  rostrum: [0, 1.5, -3.25] as [number, number, number],
  auctioneer: { at: [0, -3.8] as Vec2, yaw: 0, seed: 461 },
  /** Victor Crane in the front row, right of the aisle (his own seat on sale days). */
  victor: { at: [2, -1.3] as Vec2, yaw: FRONT },
  /** Mémé and Gaspard in the back row, left of the aisle, Gaspard on the aisle side. */
  meme: { at: [-2, 0.9] as Vec2, yaw: FRONT },
  gaspard: { at: [-1.3, 0.9] as Vec2, yaw: FRONT },
  /** The few others in the room, paddles on their laps: dealers who gave up early. */
  bidders: [
    { at: [-2.7, -1.3] as Vec2, seed: 2061 },
    { at: [1.3, -0.2] as Vec2, seed: 2062 },
    { at: [2.7, -0.2] as Vec2, seed: 2063 },
  ],
  /** Félix's games in their boxes waiting to be called, marked with his name. */
  crates: [
    { at: { floor: [-2.75, -3.85], rotationY: 0.15 } as Placement, stack: 3, seed: 2071 },
    { at: { floor: [2.75, -3.8], rotationY: -0.2 } as Placement, stack: 2, seed: 2072 },
  ],
  crateLabel: 'F. AUBRY',

  /** The beats: the lots called, Victor's paddle up again and again, a dealer giving up, Gaspard's watch, the hammer. */
  callsAt: [9.6, 13.2, 20.8],
  victorBidsAt: [11.4, 15.6, 18.2, 21.6, 26.4],
  giveUpAt: [16.4, 19.0],
  gaspardWatchAt: 23.6,
  memeGlassesAt: 25.2,
  gaspardRubAt: 28.0,
  memeSighAt: 29.6,
  soldAt: 31.2,
  victorNodAt: 32.0,

  shots: [
    // The room from the door: the runner down the aisle, the rows, the rostrum at the far end.
    { from: 2.5, to: 9.2, camera: { from: [0.6, 2.15, 3.9], to: [0.35, 2.05, 3.4], lookFrom: [0, 1.2, -3.0], lookTo: [0, 1.15, -3.2] }, fov: 52, lens: { focus: 6.5, blur: 2 } },
    // The auctioneer calling the lots.
    { from: 9.2, to: 15.2, camera: { from: [-0.7, 1.5, -1.95], to: [-0.55, 1.5, -2.1], lookFrom: [0, 1.62, -3.8], lookTo: [0, 1.6, -3.8] }, fov: 44, lens: { focus: 1.9, blur: 5 } },
    // Victor in the front row, his paddle going up.
    { from: 15.2, to: 22.6, camera: { from: [1.15, 1.28, -2.55], to: [1.3, 1.22, -2.45], lookFrom: [2, 1.15, -1.3], lookTo: [2, 1.12, -1.3] }, fov: 46, lens: { focus: 1.45, blur: 5 } },
    // Mémé at the back, small beside Gaspard, from the aisle.
    { from: 22.6, to: 30.2, camera: { from: [-0.5, 1.2, -0.05], to: [-0.58, 1.15, 0.1], lookFrom: [-1.85, 1.08, 0.9], lookTo: [-1.95, 1.06, 0.9] }, fov: 42, lens: { focus: 1.75, focusTo: 1.6, blur: 6 } },
    // From beside the rostrum, the hammer's view: Victor in front, Mémé far at the back.
    { from: 30.2, to: 36.4, camera: { from: [0.9, 1.75, -3.55], to: [0.85, 1.7, -3.4], lookFrom: [0.2, 1.0, 0.4], lookTo: [0, 1.0, 0.5] }, fov: 50, lens: { focus: 3.2, blur: 3 } },
  ] as MemoryShot[],

  lines: [
    { at: 0.8, seconds: 3.8, text: 'Gaspard said a sale would be simpler. All in one go. I wouldn’t have to think about it.' },
    { at: 5.0, seconds: 3.8, text: 'He had the papers ready. I signed where his finger was.' },
    { at: 9.8, seconds: 4.0, text: 'They read out Félix’s things like a shop’s. Lot one. Lot two.' },
    { at: 14.4, seconds: 3.6, text: 'That man in the front row raised his card for every one.' },
    { at: 18.6, seconds: 4.0, text: 'Nobody else stood a chance. As if he knew what was coming.' },
    { at: 23.2, seconds: 3.8, text: 'Gaspard kept looking at his watch. He knew how it would end.' },
    { at: 27.4, seconds: 4.2, text: 'I found out after. They’d shaken hands a week before. It was all arranged.' },
    { at: 31.8, seconds: 3.8, text: 'Four hundred and twelve lots. I didn’t bid on a single one.' },
  ] as MemoryLine[],
};
