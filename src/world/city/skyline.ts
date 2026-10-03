import { seededRandom } from '@/covers/generated/canvasUtils';
import { FLAT_IN_STREET, FRONT, PARK_STREET } from '../street/streetPlan';
import { PARK_FAR } from './park';

/*
 * The towers of the far city, in the flat's frame: a dense cluster behind Front Street's block, a
 * sparser and further one behind the park, a few behind the building, and two landmarks. The window
 * view paints them (`props/outdoors/Skyline`); the walkable street's sky dome draws the same
 * silhouettes on its horizon from wherever the player stands (`street/SkyDome`, `towerTop`).
 */

export type TowerCrown = 'flat' | 'setback' | 'spire' | 'slant' | 'lit';

export interface SkylineTower {
  /** Azimuth from the flat (0 = +z, +90° = +x) and distance, metres. */
  azimuth: number;
  distance: number;
  /** Footprint width and roof height, metres. */
  width: number;
  height: number;
  /** Which of `TOWER_STYLES` clads it. */
  style: number;
  crown: TowerCrown;
  /** Which side its second, shaded face shows on. */
  sideLeft: boolean;
}

/** Tower claddings: colour, how much of the facade is sky reflection, and the kind (glass, stone, dark glass). */
export const TOWER_STYLES = [
  { color: '#4f6f8c', glass: 0.3, kind: 'glass' },
  { color: '#3f5c78', glass: 0.34, kind: 'glass' },
  { color: '#6a8298', glass: 0.26, kind: 'glass' },
  { color: '#a9a297', glass: 0.06, kind: 'stone' },
  { color: '#8e9198', glass: 0.08, kind: 'stone' },
  { color: '#b7ab99', glass: 0.06, kind: 'stone' },
  { color: '#3d4753', glass: 0.2, kind: 'dark' },
  { color: '#2f3844', glass: 0.24, kind: 'dark' },
] as const;

const CROWNS: readonly TowerCrown[] = ['flat', 'flat', 'setback', 'setback', 'spire', 'slant', 'lit'];
const deg = (d: number): number => (d * Math.PI) / 180;

export const SKYLINE: readonly SkylineTower[] = (() => {
  const random = seededRandom(60917);
  const between = (a: number, b: number): number => a + random() * (b - a);
  const towers: SkylineTower[] = [];
  const cluster = (from: number, to: number, count: number, near: number, far: number, minH: number, maxH: number): void => {
    for (let i = 0; i < count; i++) {
      towers.push({
        azimuth: between(from, to),
        distance: between(near, far),
        width: between(24, 56),
        height: between(minH, maxH),
        style: Math.floor(random() * TOWER_STYLES.length),
        crown: CROWNS[Math.floor(random() * CROWNS.length)]!,
        sideLeft: random() < 0.5,
      });
    }
  };
  cluster(deg(-32), deg(100), 24, 340, 800, 75, 230);
  cluster(deg(100), deg(200), 8, 400, 800, 75, 180);
  cluster(deg(-160), deg(-32), 10, 520, 950, 70, 200);
  // Two landmarks: a spire ahead and a stepped tower behind the park.
  towers.push({ azimuth: deg(25), distance: 620, width: 48, height: 290, style: 1, crown: 'spire', sideLeft: false });
  towers.push({ azimuth: deg(-95), distance: 700, width: 40, height: 240, style: 0, crown: 'setback', sideLeft: true });
  return towers.sort((p, q) => q.distance - p.distance);
})();

/** Where a tower stands in the flat's frame (x, z). */
export function towerAt(tower: SkylineTower): [number, number] {
  return [Math.sin(tower.azimuth) * tower.distance, Math.cos(tower.azimuth) * tower.distance];
}

/**
 * How high a tower's silhouette rises `u` of the way across its width (0..1, from its left as the
 * painting draws it): the roof, a setback's upper block, a spire's cap and mast, a slanted top.
 */
export function towerTop(tower: SkylineTower, u: number): number {
  const h = tower.height;
  switch (tower.crown) {
    case 'setback':
      return u >= 0.2 && u <= 0.8 ? h * 1.16 : h;
    case 'spire': {
      const mast = 1 / tower.width;
      if (Math.abs(u - 0.5) < mast) return h * 1.2;
      return u >= 0.3 && u <= 0.7 ? h * 1.05 : h;
    }
    case 'slant':
      return h * (1 + 0.1 * (tower.sideLeft ? u : 1 - u));
    default:
      return h;
  }
}

/**
 * A mid-rise block of the neighbourhood beyond the walkable street's own rows, in the flat's frame:
 * its footprint (x0, z0, x1, z1), its roof's height and which of `BACKDROP_WALLS` it is faced in.
 */
export interface BackdropBlock {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  height: number;
  wall: number;
}

/** What the backdrop blocks are faced in: stone, render, brick, darker brick, pale render, grey. */
export const BACKDROP_WALLS = ['#b9ab94', '#cfc3ac', '#9c6a52', '#7e5646', '#d8d2c4', '#8f9296'] as const;

/** The flat's frame: Front Street's far building line, the park's hedge and its far side, as the window view has them. */
const FAR_LINE = FRONT.farLine - FLAT_IN_STREET.z;
const PARK_HEDGE_X = PARK_STREET.hedge - FLAT_IN_STREET.x;
const PARK_FAR_X = -PARK_FAR;

/**
 * The neighbourhood's blocks past the walkable street's facades (the window view paints its own
 * `paintBackdrops`; these stand where those do): the mid-rise row along the park's far side, the
 * next street behind Front Street's block shoulder to shoulder, taller blocks a few streets
 * further, a row behind our own block and the courtyard, and blocks past the far ends of Front
 * Street and Park Street. The street's sky dome draws them (`street/skyDomeShader`), ray-cast from
 * wherever the player stands, so they stand still against the roofs as one walks.
 */
export const BACKDROP_BLOCKS: readonly BackdropBlock[] = (() => {
  const random = seededRandom(70321);
  const between = (a: number, b: number): number => a + random() * (b - a);
  const floors = (lo: number, hi: number): number => (lo + Math.floor(random() * (hi - lo + 1))) * 3.1 + 2.2;
  const blocks: BackdropBlock[] = [];
  const wall = (): number => Math.floor(random() * BACKDROP_WALLS.length);
  // A row of blocks along x from `from` to `to`, their fronts on z = `line` (depth towards +z if `deep` > 0).
  const rowAlongX = (from: number, to: number, line: number, deep: number, width: [number, number], storeys: [number, number]): void => {
    for (let x = from; x < to; ) {
      const w = between(...width);
      blocks.push({ x0: x, x1: x + w, z0: Math.min(line, line + deep), z1: Math.max(line, line + deep), height: floors(...storeys), wall: wall() });
      x += w + (random() < 0.15 ? between(4, 10) : 0);
    }
  };
  const rowAlongZ = (from: number, to: number, line: number, deep: number, width: [number, number], storeys: [number, number]): void => {
    for (let z = from; z < to; ) {
      const w = between(...width);
      blocks.push({ z0: z, z1: z + w, x0: Math.min(line, line + deep), x1: Math.max(line, line + deep), height: floors(...storeys), wall: wall() });
      z += w + (random() < 0.15 ? between(4, 10) : 0);
    }
  };
  // The park's far side.
  rowAlongZ(-240, 240, PARK_FAR_X, -14, [16, 30], [7, 11]);
  // The next street behind Front Street's block, from the park's corner round to past the side street.
  rowAlongX(PARK_HEDGE_X, 260, FAR_LINE + 42, 15, [12, 22], [6, 9]);
  // Taller blocks a few streets further.
  for (let i = 0; i < 22; i++) {
    const z = between(115, 240);
    const x = between(-160, 380);
    const w = between(18, 40);
    blocks.push({ x0: x, x1: x + w, z0: z, z1: z + between(16, 26), height: floors(9, 16), wall: wall() });
  }
  // Behind our block and its courtyard (the flat's back is about z -9: the courtyard runs to -24, the rear building beyond).
  rowAlongX(-5, 240, -62, -16, [14, 24], [6, 8]);
  // Past the end of Front Street (the street's x 136 is the flat's 148.7) and of Park Street (its south end, the flat's z -80.7).
  rowAlongZ(-70, 70, 176, 18, [16, 26], [7, 10]);
  rowAlongX(-70, -10, -112, -16, [14, 22], [6, 9]);
  return blocks;
})();
