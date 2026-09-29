import * as THREE from 'three';
import { SKYLINE, TOWER_STYLES, towerAt, towerTop } from '../city/skyline';
import { FLAT_IN_STREET } from './streetPlan';

/** Columns round the horizon (read linearly for the height, snapped to a column for the rest: `SKYLINE_COLUMNS` in the dome's shader), and the highest elevation (sine) the texture holds. */
export const SKYLINE_COLUMNS = 4096;
const COLUMNS = SKYLINE_COLUMNS;
export const SKYLINE_TOP = 0.9;
/** Towers taller than this carry aviation beacons (as the window view paints them: `props/outdoors/Skyline`). */
const BEACON_OVER = 150;
/** How far the player walks before the silhouettes are worked out again (small: a tower's edge must not hop). */
const REBAKE_AFTER = 0.5;

/**
 * The far city's towers (`city/SKYLINE`, the window view's) as the sky dome sees them from where the
 * player stands: a 1D texture round the horizon (u = azimuth), R the sine of the silhouette's top
 * elevation over `SKYLINE_TOP`, G which cladding (`TOWER_STYLES`) shows there, B a beacon on its top
 * there (A its blink's phase). Linearly filtered: R blends between columns, the rest is read at a column's centre. Worked out on the CPU
 * (a few towers by a couple of thousand columns) whenever the player has walked `REBAKE_AFTER`
 * metres, so the dome's shader reads one texel per pixel.
 */
export class SkylineSilhouette {
  readonly texture: THREE.DataTexture;
  /** The claddings' colours, for the shader. */
  readonly colors = TOWER_STYLES.map((style) => new THREE.Color(style.color));
  private readonly data = new Uint8Array(COLUMNS * 4);
  private readonly tops = new Float32Array(COLUMNS);
  private readonly last = new THREE.Vector3(Infinity, 0, 0);

  constructor() {
    this.texture = new THREE.DataTexture(this.data, COLUMNS, 1, THREE.RGBAFormat);
    // Linear: the tops' heights (R) blend between columns, so the silhouette's steps are gone; the dome
    // reads the cladding and the beacons (G, B, A) at the column's centre, where linear is exact.
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.wrapS = THREE.RepeatWrapping;
    this.texture.generateMipmaps = false;
  }

  /** Re-bakes the silhouettes if the eye (zone-local) has moved far enough since the last time. */
  update(eye: THREE.Vector3): void {
    if (eye.distanceTo(this.last) < REBAKE_AFTER) return;
    this.last.copy(eye);
    const ex = eye.x - FLAT_IN_STREET.x;
    const ez = eye.z - FLAT_IN_STREET.z;
    this.tops.fill(0);
    this.data.fill(0);
    for (const tower of SKYLINE) {
      const [tx, tz] = towerAt(tower);
      const dx = tx - ex;
      const dz = tz - ez;
      const distance = Math.hypot(dx, dz);
      const centre = Math.atan2(dx, dz);
      const half = Math.atan(tower.width / 2 / distance);
      const first = Math.floor(((centre - half + Math.PI) / (2 * Math.PI)) * COLUMNS);
      const last = Math.ceil(((centre + half + Math.PI) / (2 * Math.PI)) * COLUMNS);
      for (let c = first; c <= last; c++) {
        const azimuth = ((c + 0.5) / COLUMNS) * 2 * Math.PI - Math.PI;
        const off = azimuth - centre;
        if (Math.abs(off) > half) continue;
        const rise = towerTop(tower, 0.5 + off / (2 * half)) - eye.y;
        const top = Math.min(SKYLINE_TOP, rise / Math.hypot(rise, distance));
        const i = ((c % COLUMNS) + COLUMNS) % COLUMNS;
        if (top <= this.tops[i]!) continue;
        this.tops[i] = top;
        this.data[i * 4] = Math.round((top / SKYLINE_TOP) * 255);
        this.data[i * 4 + 1] = Math.round(((tower.style + 0.5) / TOWER_STYLES.length) * 255);
        this.data[i * 4 + 3] = 255;
      }
    }
    // The beacons: at the tallest towers' top corners (the mast's tip on a spire), where that tower is the front one.
    for (const tower of SKYLINE) {
      if (tower.height <= BEACON_OVER) continue;
      const [tx, tz] = towerAt(tower);
      const dx = tx - ex;
      const dz = tz - ez;
      const distance = Math.hypot(dx, dz);
      const centre = Math.atan2(dx, dz);
      const half = Math.atan(tower.width / 2 / distance);
      for (const u of tower.crown === 'spire' ? [0.5] : [0.08, 0.92]) {
        const c = Math.floor(((centre + (u - 0.5) * 2 * half + Math.PI) / (2 * Math.PI)) * COLUMNS);
        const i = ((c % COLUMNS) + COLUMNS) % COLUMNS;
        const rise = towerTop(tower, u) - eye.y;
        const top = Math.min(SKYLINE_TOP, rise / Math.hypot(rise, distance));
        if (Math.abs(top - this.tops[i]!) > 1e-4) continue;
        this.data[i * 4 + 2] = 255;
        // Its blink's phase.
        this.data[i * 4 + 3] = 128 + Math.round((tower.azimuth * 97) % 127);
      }
    }
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
  }
}
