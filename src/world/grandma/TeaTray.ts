import * as THREE from 'three';
import { cylinderMesh } from '../meshUtils';
import { Prop, part } from '../props/Prop';
import { METAL, paint } from '../materials/palette';
import { SEAM } from '../props/joinery';

const TRAY = { w: 0.38, d: 0.27, base: 0.006, rim: 0.025, wall: 0.008 };
const SAUCER = 0.01;
const POT = { r: 0.07, lid: 0.018, knob: 0.015, handle: 0.035 };

/**
 * Tea laid on a tray (Mémé's side table, `furnishGrandmaDecor`): the brown teapot in its knitted cosy's colours, two
 * cups on their saucers, the sugar bowl, a plate of biscuits. Origin on the surface under the tray's middle.
 * Decoration: never collides.
 */
export class TeaTray extends Prop {
  readonly contactShadow = false;

  constructor() {
    super();
    this.name = 'TeaTray';
    const tin = METAL.satinSteel();
    part(this, TRAY.w, TRAY.base, TRAY.d, tin, { y: TRAY.base / 2 });
    const rimY = TRAY.base + SEAM + TRAY.rim / 2;
    for (const s of [-1, 1]) {
      part(this, TRAY.w, TRAY.rim, TRAY.wall, tin, { y: rimY, z: s * (TRAY.d / 2 - TRAY.wall / 2) });
      part(this, TRAY.wall, TRAY.rim, TRAY.d - 2 * TRAY.wall - 2 * SEAM, tin, { y: rimY, x: s * (TRAY.w / 2 - TRAY.wall / 2) });
    }
    const floor = TRAY.base + SEAM;
    const china = paint(0xf6f2ea, 0.3);
    const brown = paint(0x5a3220, 0.25);
    // The teapot: a squashed ball, its lid and knob, a spout and a handle.
    const pot = new THREE.Mesh(new THREE.SphereGeometry(POT.r, 20, 14), brown);
    pot.scale.y = 0.85;
    pot.position.set(-0.09, floor + POT.r * 0.85, -0.03);
    pot.castShadow = true;
    this.add(pot);
    const lidY = floor + POT.r * 1.7;
    this.add(cylinderMesh(POT.r * 0.45, POT.lid, brown, { x: -0.09, y: lidY, z: -0.03 }, { radiusBottom: POT.r * 0.55, segments: 16 }));
    this.add(cylinderMesh(0.01, POT.knob, brown, { x: -0.09, y: lidY + POT.lid / 2 + POT.knob / 2, z: -0.03 }, { segments: 8 }));
    const spout = cylinderMesh(0.008, 0.075, brown, { x: -0.09 + POT.r + 0.02, y: floor + POT.r * 0.95, z: -0.03 }, { radiusBottom: 0.016, segments: 10 });
    spout.rotation.z = -0.8;
    this.add(spout);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(POT.handle, 0.007, 8, 16, Math.PI), brown);
    // Its two ends in the pot's side, the loop out to -x.
    handle.position.set(-0.09 - POT.r * 0.92, floor + POT.r * 0.85, -0.03);
    handle.rotation.z = Math.PI / 2;
    this.add(handle);
    // Two cups on saucers, the sugar bowl, the biscuits.
    for (const [x, z] of [
      [0.07, -0.06],
      [0.12, 0.06],
    ] as const) {
      this.add(cylinderMesh(0.055, SAUCER, china, { x, y: floor + SAUCER / 2, z }, { radiusBottom: 0.045, segments: 20 }));
      this.add(cylinderMesh(0.038, 0.055, china, { x, y: floor + SAUCER + SEAM + 0.0275, z }, { radiusBottom: 0.028, segments: 18 }));
      const ear = new THREE.Mesh(new THREE.TorusGeometry(0.015, 0.004, 6, 12), china);
      ear.position.set(x + 0.045, floor + SAUCER + 0.03, z);
      this.add(ear);
    }
    this.add(cylinderMesh(0.035, 0.045, paint(0xe8dcc8, 0.3), { x: -0.03, y: floor + 0.0225, z: 0.08 }, { radiusBottom: 0.028, segments: 16 }));
    this.add(cylinderMesh(0.065, SAUCER, china, { x: 0.02, y: floor + SAUCER / 2, z: 0.07 }, { radiusBottom: 0.05, segments: 20 }));
    const biscuit = paint(0xc8904a, 0.8);
    for (let i = 0; i < 4; i++) this.add(cylinderMesh(0.022, SAUCER, biscuit, { x: 0.02 + (i - 1.5) * 0.024, y: floor + SAUCER * (1.5 + (i % 2)) + SEAM, z: 0.07 + (i % 2 ? 0.012 : -0.012) }, { segments: 12 }));
  }
}
