/*
 * NEON SHERIFF's town, a street at a time: every two stages the gunfight moves on (the saloon, the
 * bank, the station, the mine), each with its front in neon outline and its own places for heads to
 * pop up: windows and doors in the front, cover (barrels, crates, sacks, carts) in front of it.
 */

/** A place a target pops up in: its centre, size, and what it is (drawn dark glass, a door, or something to hide behind). */
export interface SheriffSpot {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: 'window' | 'door' | 'cover';
}

export interface SheriffScene {
  /** The sign over the front. */
  readonly sign: string;
  /** The night sky's top and bottom, the front's fill and its neon, the ground. */
  readonly sky: readonly [string, string];
  readonly front: string;
  readonly neon: string;
  readonly ground: string;
  /** What hides the heads in front (`cover` spots). */
  readonly cover: string;
  readonly spots: readonly SheriffSpot[];
}

export const SHERIFF_SCENES: readonly SheriffScene[] = [
  {
    sign: 'SALOON',
    sky: ['#12051f', '#2a0c2c'],
    front: '#1b0f1f',
    neon: '#ff2fa0',
    ground: '#3a2418',
    cover: '#5a3a20',
    spots: [
      { x: 52, y: 64, w: 34, h: 30, kind: 'window' },
      { x: 143, y: 64, w: 34, h: 30, kind: 'window' },
      { x: 234, y: 64, w: 34, h: 30, kind: 'window' },
      { x: 86, y: 128, w: 36, h: 52, kind: 'door' },
      { x: 198, y: 128, w: 36, h: 52, kind: 'door' },
      { x: 24, y: 190, w: 34, h: 30, kind: 'cover' },
      { x: 143, y: 196, w: 34, h: 26, kind: 'cover' },
      { x: 262, y: 190, w: 34, h: 30, kind: 'cover' },
    ],
  },
  {
    sign: 'BANK',
    sky: ['#05101f', '#0c2436'],
    front: '#101a24',
    neon: '#33e0ff',
    ground: '#2e2a26',
    cover: '#6a6048',
    spots: [
      { x: 40, y: 60, w: 30, h: 28, kind: 'window' },
      { x: 100, y: 60, w: 30, h: 28, kind: 'window' },
      { x: 220, y: 60, w: 30, h: 28, kind: 'window' },
      { x: 280, y: 60, w: 30, h: 28, kind: 'window' },
      { x: 160, y: 126, w: 44, h: 56, kind: 'door' },
      { x: 64, y: 192, w: 34, h: 28, kind: 'cover' },
      { x: 256, y: 192, w: 34, h: 28, kind: 'cover' },
      { x: 160, y: 198, w: 30, h: 22, kind: 'cover' },
    ],
  },
  {
    sign: 'STATION',
    sky: ['#1f0a05', '#3a1a0c'],
    front: '#1f140c',
    neon: '#ffb347',
    ground: '#3a2a20',
    cover: '#4a4a52',
    spots: [
      { x: 70, y: 68, w: 34, h: 30, kind: 'window' },
      { x: 250, y: 68, w: 34, h: 30, kind: 'window' },
      { x: 160, y: 120, w: 38, h: 50, kind: 'door' },
      { x: 40, y: 136, w: 30, h: 34, kind: 'window' },
      { x: 280, y: 136, w: 30, h: 34, kind: 'window' },
      { x: 100, y: 194, w: 40, h: 26, kind: 'cover' },
      { x: 220, y: 194, w: 40, h: 26, kind: 'cover' },
    ],
  },
  {
    sign: 'GOLD MINE',
    sky: ['#0a0a14', '#181428'],
    front: '#18120e',
    neon: '#7ee787',
    ground: '#2a2018',
    cover: '#5a4030',
    spots: [
      { x: 160, y: 104, w: 46, h: 58, kind: 'door' },
      { x: 60, y: 82, w: 32, h: 30, kind: 'window' },
      { x: 260, y: 82, w: 32, h: 30, kind: 'window' },
      { x: 34, y: 192, w: 36, h: 28, kind: 'cover' },
      { x: 110, y: 186, w: 36, h: 34, kind: 'cover' },
      { x: 210, y: 186, w: 36, h: 34, kind: 'cover' },
      { x: 286, y: 192, w: 36, h: 28, kind: 'cover' },
    ],
  },
];
