import * as THREE from 'three';
import { cylinderMesh } from '../../meshUtils';
import { Prop, part } from '../../props/Prop';
import { paint } from '../../materials/palette';
import { seededRandom } from '@/graphics/canvas';
import { hangFromCeiling } from '../common/ceilingDrop';

export interface CableTrayOptions {
  /** Length along local x. Default 3. */
  length?: number;
  /** How far under the ceiling it hangs. Default 0.3. */
  drop?: number;
  /** A cable looping down off its end (+x), metres below the tray; 0 for none. Default 0.6. */
  droop?: number;
  seed?: number;
}

const STEEL = paint(0x8a8e92, 0.45);
const WIDTH = 0.2;
const CABLES: readonly number[] = [0x1a1a1a, 0x3a3a3c, 0xe8e2d4, 0xb02a22, 0x2a5a9a, 0x5a5a5e];

/**
 * A galvanised ladder tray hung from the ceiling on rods, the workshop's cables laid along it (mains, aerial coax, a
 * grey multicore), one looping down off its end towards the bench. Ceiling-hung: origin at the ceiling, along local
 * x, hanging down -y. Decoration: never collides; its parts merge.
 */
export class CableTray extends Prop {
  readonly contactShadow = false;

  constructor(options: CableTrayOptions = {}) {
    super();
    this.name = 'CableTray';
    const L = options.length ?? 3;
    const drop = options.drop ?? 0.3;
    const random = seededRandom(options.seed ?? 41);
    // Two rods (each with its rose), the tray under them.
    let y = 0;
    for (const x of [-L * 0.35, L * 0.35]) {
      const rod = new THREE.Group();
      rod.position.x = x;
      y = hangFromCeiling(rod, drop, 'rod');
      part(rod, 0.02, 0.02, WIDTH + 0.06, STEEL, { y });
      this.add(rod);
    }
    const tray = y - 0.02;
    for (const s of [-1, 1]) part(this, L, 0.05, 0.006, STEEL, { y: tray, z: (s * WIDTH) / 2 });
    for (let x = -L / 2 + 0.1; x < L / 2; x += 0.3) part(this, 0.025, 0.006, WIDTH, STEEL, { x, y: tray - 0.022 });
    // The cables along it, each at its own place across the rungs.
    CABLES.forEach((color, i) => {
      const r = i === 2 ? 0.009 : 0.005 + random() * 0.004;
      const cable = cylinderMesh(r, L - 0.05, paint(color, 0.7), { y: tray - 0.019 + r, z: -WIDTH / 2 + 0.025 + i * ((WIDTH - 0.05) / (CABLES.length - 1)) }, { segments: 6 });
      cable.rotation.z = Math.PI / 2;
      this.add(cable);
    });
    // One looping down off the end.
    const droop = options.droop ?? 0.6;
    if (droop > 0) {
      const start = new THREE.Vector3(L / 2 - 0.02, tray - 0.01, 0.02);
      const curve = new THREE.CatmullRomCurve3([start, new THREE.Vector3(L / 2 + 0.12, tray - droop * 0.6, 0.05), new THREE.Vector3(L / 2 + 0.2, tray - droop, 0.1)]);
      const loop = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.006, 6), paint(0x1a1a1a, 0.7));
      loop.castShadow = true;
      this.add(loop);
    }
  }
}
