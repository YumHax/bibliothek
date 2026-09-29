import { seededRandom } from '@/covers/generated/canvasUtils';

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
