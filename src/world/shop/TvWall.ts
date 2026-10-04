import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import { part } from '../props/Prop';
import { paint, METAL } from '../materials/palette';
import { PortableTv } from './shopModels';
import type { ScreenLook } from './snowScreen';
import { labelSheet, ticket } from './tv/labels';
import { lcg } from '@/random';

export interface TvWallOptions {
  /** Length along the wall. Default 2.4. */
  width?: number;
  /** Shelves, bottom first (each a row of sets). Default 3. */
  rows?: number;
  /**
   * `snow`: every set on the same snowstorm. `mixed`: most on snow, one on the test card, one on colour bars, one
   * rolling (its hold gone), a couple dead with their repair ticket taped to the glass. Default snow.
   */
  screens?: 'snow' | 'mixed';
  seed?: number;
}

const DEPTH = 0.42;
const SHELF = 0.025;
const ROW = 0.5;
const BOTTOM = 0.3;
const CASES: readonly number[] = [0x5a5a5e, 0xd8d2c4, 0x2a2a2c, 0x8a3a2a, 0x6a6f74, 0xb8b0a0];
/** What the dead sets' tickets say. */
const FAULTS: readonly (readonly string[])[] = [['NOWAK', 'no picture'], ['Mrs HALL', 'dead, smells hot'], ['REID', 'line down middle']];

/**
 * The TV repair shop's wall of sets, all tuned to snow or (`mixed`) not quite all: a steel rack of shelves along the
 * wall, each row a line of portable CRTs of all sizes and colours (`PortableTv` with the shared screens of
 * `snowScreen`, repainted and rolled by the `SnowTicker` placed with it: the rack stays static and merges). Not for
 * sale: the ones for sale stand on the tables. Wall-hung with `y: 0`: origin on the floor at the wall, +z into the
 * room. Collides as its box.
 */
export class TvWall extends THREE.Group implements Furniture {
  readonly footprint: THREE.Box3;

  constructor(options: TvWallOptions = {}) {
    super();
    this.name = 'TvWall';
    const W = options.width ?? 2.4;
    const rows = options.rows ?? 3;
    const random = lcg(options.seed ?? 5);
    const steel = METAL.satinSteel();
    const board = paint(0x3a3c40, 0.6);
    const top = BOTTOM + rows * ROW;
    for (const x of [-W / 2 + 0.02, W / 2 - 0.02]) for (const z of [0.03, DEPTH - 0.03]) part(this, 0.03, top, 0.03, steel, { x, y: top / 2, z });
    const sets: { width: number; color: number; at: THREE.Vector3; yaw: number }[] = [];
    for (let r = 0; r <= rows; r++) {
      const y = BOTTOM + r * ROW - SHELF / 2;
      part(this, W - 0.07, SHELF, DEPTH - 0.02, board, { y, z: DEPTH / 2 });
      if (r === rows) break;
      let x = -W / 2 + 0.08;
      while (true) {
        const width = 0.24 + random() * 0.16;
        if (x + width > W / 2 - 0.06) break;
        sets.push({ width, color: CASES[Math.floor(random() * CASES.length)]!, at: new THREE.Vector3(x + width / 2, y + SHELF / 2, DEPTH / 2 - 0.02), yaw: (random() - 0.5) * 0.12 });
        x += width + 0.04 + random() * 0.05;
      }
    }
    const looks: ScreenLook[] = sets.map(() => 'snow');
    const dead: number[] = [];
    if (options.screens === 'mixed' && sets.length >= 8) {
      // Spread over the rows: a still or two at eye level, the dead ones low and high.
      const pick = (): number => {
        for (let tries = 0; tries < 20; tries++) {
          const i = Math.floor(random() * sets.length);
          if (looks[i] === 'snow') return i;
        }
        return looks.indexOf('snow');
      };
      for (const look of ['testCard', 'bars', 'rolling', 'dark', 'dark'] as const) {
        const i = pick();
        if (i < 0) break;
        looks[i] = look;
        if (look === 'dark') dead.push(i);
      }
    }
    sets.forEach((set, i) => {
      const tv = new PortableTv({ width: set.width, case: set.color, screen: looks[i] });
      tv.position.copy(set.at);
      tv.rotation.y = set.yaw;
      this.add(tv);
    });
    // The dead sets' tickets, taped across a corner of the glass.
    if (dead.length) {
      const tickets = labelSheet(dead.map((_, n) => ({ width: 0.075, height: 0.045, paint: ticket(2310 + n * 17, FAULTS[n % FAULTS.length]!) })));
      tickets.forEach((label, n) => {
        const set = sets[dead[n]!]!;
        const H = set.width * 0.84;
        const D = set.width * 0.9;
        const holder = new THREE.Group();
        holder.position.copy(set.at);
        holder.rotation.y = set.yaw;
        label.position.set(-set.width * 0.12, H * 0.62, D * 0.5 + 0.004);
        label.rotation.z = (n % 2 ? 1 : -1) * 0.18;
        holder.add(label);
        this.add(holder);
      });
    }
    this.footprint = new THREE.Box3(new THREE.Vector3(-W / 2, 0, 0), new THREE.Vector3(W / 2, top, DEPTH));
  }
}
