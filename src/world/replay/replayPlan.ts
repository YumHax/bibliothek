import type { RoomOptions } from '../Room';
import type { Placement } from '../Placement';
import type { DecorEntry } from '../props/decor';

/*
 * REPLAY, CANAL STREET, zone-local (origin at the centre of its floor; front = +z, the shop door onto Canal Street;
 * back = -z, the counter). A second-hand games shop across town, line 38's other stop (`STREET_PLAN.busRide`): reached
 * by the bus from Front Street in its hours, left by its door back to the stop. 7.2 x 5.4 m, 3.1 m high, no window of
 * its own to the painted view (its front is papered with posters): lit by its pendants, a little daylight through the
 * door's glass. Its stock is its own, drawn by the game week (`furnishReplay`).
 */

export const REPLAY_ROOM: RoomOptions = {
  width: 7.2,
  depth: 5.4,
  height: 3.1,
  opaqueWalls: ['front', 'back', 'left', 'right'],
  finish: { walls: 0x2e4a3e, ceiling: 0xe8e4da, trim: 0x1e2a24 },
};

export const REPLAY_PLAN = {
  room: REPLAY_ROOM,
  /** Off the bus, in through the door: just inside it, looking into the shop. */
  arrival: { at: [-2.6, 2.0] as [number, number], yaw: 0 },
  /** The shop door, back out to the stop. */
  exit: { wall: 'front', along: -2.6, y: 0 } as Placement,
  /** The opening hours (game hours): the bus stops here only then. */
  hours: [10, 19] as [number, number],
  pendant: { ceiling: [0, -0.4] } as Placement,
  lightSwitch: { wall: 'front', along: -1.8, y: 1.1 } as Placement,
  /** The counter at the back and the owner behind it (she buys games too). */
  counter: { at: { floor: [2.0, -1.75], rotationY: 0 } as Placement, width: 1.8, front: 0x7a2a2a },
  owner: { at: [2.25, -2.35] as [number, number], yaw: 0, seed: 8807 },
  /**
   * The stalls: risers along the left wall (a mixed lot), risers by the back wall (one console's), a glass case in the
   * middle (the collector's copies). Each faces its aisle (local +z).
   */
  stalls: [
    { at: { floor: [-3.2, -0.4], rotationY: Math.PI / 2 } as Placement, style: 'risers', sign: 'MIXED BAG', kind: 'mover' },
    { at: { floor: [-0.9, -2.3], rotationY: 0 } as Placement, style: 'risers', sign: 'THIS WEEK', kind: 'clearOut' },
    { at: { floor: [0.9, 0.6], rotationY: 0 } as Placement, style: 'glass', sign: 'RARE', kind: 'collector' },
  ] as { at: Placement; style: 'risers' | 'glass'; sign: string; kind: 'mover' | 'clearOut' | 'collector' }[],
  decor: [
    { kind: 'neonSign', at: { wall: 'back', along: 2.0, y: 2.45 }, options: { text: 'REPLAY', color: 0xffb02f, width: 1.8, height: 0.42, intensity: 3, seed: 3 } },
    { kind: 'gamePoster', at: { wall: 'left', along: -2.2, y: 1.9 }, options: { game: 'invaders' } },
    { kind: 'gamePoster', at: { wall: 'right', along: 0.6, y: 1.8 }, options: { game: 'comets' } },
    { kind: 'gamePoster', at: { wall: 'front', along: 0.4, y: 1.7 }, options: { game: 'frog' } },
    { kind: 'crate', at: { floor: [3.1, -0.4], rotationY: -0.3 }, options: { style: 'cardboard', stack: 2, label: 'TRADE-INS', seed: 21 } },
    { kind: 'plant', at: { corner: 'front-right', inset: 0.4 }, options: { kind: 'yucca', pot: 'ceramic', seed: 44 } },
    { kind: 'doormat', at: { floor: [-2.6, 2.35] }, options: { width: 0.9, depth: 0.5, seed: 12 } },
    { kind: 'radiator', at: { wall: 'right', along: -1.6, y: 0 }, options: { style: 'column', width: 0.8 } },
    { kind: 'wallCalendar', at: { wall: 'back', along: -2.9, y: 1.5 }, options: { seed: 33 } },
    { kind: 'smokeDetector', at: { ceiling: [0, 1.2] } },
    { kind: 'flyer', at: { wall: 'front', along: -1.2, y: 1.4 }, options: { title: 'WE BUY', lines: ['games, consoles,', 'whole collections', 'ask at the counter'] } },
  ] as DecorEntry[],
};
