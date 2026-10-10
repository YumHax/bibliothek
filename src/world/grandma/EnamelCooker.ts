import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import { cylinderMesh } from '../meshUtils';
import { part } from '../props/Prop';
import { METAL, paint, standard } from '../materials/palette';
import { GLASS, asGlass } from '../materials/glass';
import { PROUD, SEAM, proud } from '../props/joinery';

/** The cooker's size (m): a 1960s freestanding cooker, narrow, its hob at worktop height. */
const W = 0.56;
const H = 0.86;
const D = 0.58;
const PLINTH = 0.06;
const OFF_WALL = 0.02;
const CAP = 0.02;
/** A burner's ring and its grate's bars (heights), the oven door's and its window's thicknesses. */
const RING = 0.01;
const GRATE = 0.012;
const DOOR = { h: 0.42, t: 0.02, frame: 0.003, pane: 0.004 };
const SHELF = { y: 0.3, t: 0.015, d: 0.08, back: 0.02, salt: 0.07, matches: 0.02 };

/**
 * Mémé's old cooker in the corner of her room (`furnishGrandmaDecor`): cream enamel, four burners under black
 * grates, the oven door with its little window, a row of bakelite knobs, a splash-back with a shelf for the salt.
 * Origin on the floor at the wall, its front towards +z; `hob` is where a pan or the kettle stands (front left).
 */
export class EnamelCooker extends THREE.Group implements Furniture {
  readonly footprint = new THREE.Box3(new THREE.Vector3(-W / 2, 0, 0), new THREE.Vector3(W / 2, H, OFF_WALL + D));
  /** The front-left burner's top, in the cooker's frame: where the kettle stands. */
  readonly hob: THREE.Vector3;

  constructor() {
    super();
    this.name = 'EnamelCooker';
    const enamel = standard({ color: 0xece4cf, roughness: 0.22, metalness: 0 });
    const black = paint(0x1c1b1a, 0.5);
    const z = OFF_WALL + D / 2;
    part(this, W - 0.02, PLINTH, D - 0.04, black, { y: PLINTH / 2, z });
    const bodyH = H - PLINTH - CAP;
    part(this, W, bodyH, D, enamel, { y: PLINTH + bodyH / 2, z });
    // The hob's plate, proud of the body all round.
    part(this, proud(W), CAP, proud(D), enamel, { y: H - CAP / 2 + SEAM, z });
    const top = H + SEAM;
    // Four burners: a black ring and its grate's cross over each.
    const burners: [number, number][] = [
      [-W * 0.24, z + D * 0.2],
      [W * 0.24, z + D * 0.2],
      [-W * 0.24, z - D * 0.2],
      [W * 0.24, z - D * 0.2],
    ];
    for (const [bx, bz] of burners) {
      this.add(cylinderMesh(0.07, RING, black, { x: bx, y: top + RING / 2, z: bz }, { segments: 20 }));
      for (const turn of [Math.PI / 4, -Math.PI / 4]) {
        const bar = part(this, 0.17, GRATE, GRATE, black, { x: bx, y: top + RING + SEAM + GRATE / 2, z: bz });
        bar.rotation.y = turn;
      }
    }
    this.hob = new THREE.Vector3(burners[0]![0], top + RING + SEAM + GRATE, burners[0]![1]);
    // The oven door: a panel proud of the front, its black-framed window, a chrome rail for a handle.
    const front = OFF_WALL + D + PROUD;
    const doorY = PLINTH + 0.06 + DOOR.h / 2;
    part(this, W - 0.08, DOOR.h, DOOR.t, enamel, { y: doorY, z: front + DOOR.t / 2 });
    const face = front + DOOR.t + SEAM;
    const windowY = doorY + DOOR.h * 0.08;
    part(this, W * 0.46 + 0.03, DOOR.h * 0.4 + 0.03, DOOR.frame, black, { y: windowY, z: face + DOOR.frame / 2 });
    asGlass(part(this, W * 0.46, DOOR.h * 0.4, DOOR.pane, GLASS.pane, { y: windowY, z: face + DOOR.frame + SEAM + DOOR.pane / 2 }));
    const railY = doorY + DOOR.h / 2 - 0.03;
    const rail = cylinderMesh(0.008, W - 0.16, METAL.chrome(), { y: railY, z: face + 0.035 }, { segments: 10 });
    rail.rotation.z = Math.PI / 2;
    this.add(rail);
    for (const s of [-1, 1]) part(this, 0.012, 0.012, 0.035, METAL.chrome(), { x: s * (W / 2 - 0.1), y: railY, z: face + 0.0175 });
    // The knobs under the hob, on the front.
    for (let i = 0; i < 5; i++) {
      const knob = cylinderMesh(0.017, 0.022, black, { x: -W * 0.36 + i * W * 0.18, y: H - 0.07, z: OFF_WALL + D + 0.011 }, { segments: 14 });
      knob.rotation.x = Math.PI / 2;
      this.add(knob);
    }
    // The splash-back and its shelf, the salt and a box of matches on it.
    part(this, W, 0.32, SHELF.back, enamel, { y: top + 0.16, z: OFF_WALL + SHELF.back / 2 });
    const shelfZ = OFF_WALL + SHELF.back + SEAM + SHELF.d / 2;
    part(this, W, SHELF.t, SHELF.d, enamel, { y: top + SHELF.y, z: shelfZ });
    const onShelf = top + SHELF.y + SHELF.t / 2 + SEAM;
    this.add(cylinderMesh(0.025, SHELF.salt, paint(0x2a5a9a, 0.4), { x: -0.12, y: onShelf + SHELF.salt / 2, z: shelfZ }, { segments: 14 }));
    part(this, 0.06, SHELF.matches, 0.04, paint(0xc8402a, 0.6), { x: 0.1, y: onShelf + SHELF.matches / 2, z: shelfZ });
  }
}
