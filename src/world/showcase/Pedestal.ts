import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import { boxMesh } from '../meshUtils';
import { METAL, paint, standard, timber } from '../materials/palette';
import { INSET, PROUD } from '../props/joinery';
import { WALL, onSurface } from '../surface/layers';
import { WARM_STRIP, bakedGlow, washTexture } from './glow';
import type { ShowcaseStand, StandSlot } from './stand';

const BASE_W = 0.38;
const BASE_H = 0.05;
const COLUMN_W = 0.3;
const CAP_W = 0.36;
const CAP_T = 0.035;
/** The cap's top: where the easel stands. */
const TOP = 1.0;
/** The easel: a smoked acrylic foot plate and a back plate leaning with the box. */
const FOOT_T = 0.006;
const PLATE_W = 0.17;
const PLATE_H = 0.16;
const PLATE_T = 0.005;
/** How far the box leans back on the easel (radians). */
const LEAN = THREE.MathUtils.degToRad(14);
/** The easel's foot line, behind the cap's centre (m): the box's front stands over the middle. */
const FOOT_Z = -0.035;

const PLINTH_WOOD = timber(0x24160e, 0.55);
const WALNUT = timber(0x3b2416, 0.42);
const PLASTER = paint(0xe9e4da, 0.75);
const BRASS = METAL.agedBrass();
const ACRYLIC = standard({ color: 0x141416, roughness: 0.18, metalness: 0 });

/**
 * A gallery pedestal for the grail of the collection (SECOND HOME sells it): a pale column on a dark plinth, a walnut
 * cap, and on it a smoked acrylic easel holding one box face out. A warm strip round the cap's underside glows down the
 * column (no light of its own, painted on). The box is put there like any box on the shelves (`Showcases`). Stands
 * free on the floor: origin at its foot's centre, +z the side the box faces. Collides.
 */
export class Pedestal extends THREE.Group implements Furniture, ShowcaseStand {
  readonly standName = 'pedestal';
  readonly slots: readonly StandSlot[];
  readonly viewpoint = new THREE.Vector3(0, 0, 0.8);

  constructor() {
    super();
    this.name = 'Pedestal';
    const columnH = TOP - CAP_T - BASE_H;
    this.add(boxMesh(BASE_W, BASE_H, BASE_W, PLINTH_WOOD, { y: BASE_H / 2 }));
    this.add(boxMesh(COLUMN_W, columnH + 2 * INSET, COLUMN_W, PLASTER, { y: BASE_H + columnH / 2 }));
    // A brass band a hand under the cap, standing proud of the plaster.
    this.add(boxMesh(COLUMN_W + 2 * PROUD, 0.012, COLUMN_W + 2 * PROUD, BRASS, { y: TOP - CAP_T - 0.07 }));
    this.add(boxMesh(CAP_W, CAP_T, CAP_W, WALNUT, { y: TOP - CAP_T / 2 }));
    // The strip round the cap's underside, its glow washing down the column's four faces.
    // In the overhang, halfway between the column's face and the cap's edge; the side ones stop short of the corners.
    const under = TOP - CAP_T - 0.003 - PROUD;
    const out = (CAP_W + COLUMN_W) / 4;
    for (const side of [-1, 1]) {
      for (const [x, z, w, d] of [[0, side * out, CAP_W - 0.02, 0.008], [side * out, 0, 0.008, CAP_W - 0.05]] as const) {
        const strip = boxMesh(w, 0.006, d, WARM_STRIP, { x, y: under, z });
        strip.castShadow = false;
        this.add(strip);
      }
    }
    const fade = washTexture();
    const washH = 0.42;
    for (let i = 0; i < 4; i++) {
      const face = new THREE.Group();
      face.rotation.y = (i * Math.PI) / 2;
      const wash = new THREE.Mesh(new THREE.PlaneGeometry(COLUMN_W - 0.004, washH), onSurface(bakedGlow(0xffd9a0, 0.3, fade), WALL.overlay, { depthWrite: false }));
      wash.position.set(0, TOP - CAP_T - washH / 2, COLUMN_W / 2 + WALL.overlay.lift);
      wash.castShadow = false;
      wash.raycast = () => {};
      face.add(wash);
      this.add(face);
    }
    // The easel: its foot plate on the cap, its back plate leaning back from the foot line.
    this.add(boxMesh(PLATE_W + 0.03, FOOT_T, 0.11, ACRYLIC, { y: TOP + FOOT_T / 2, z: FOOT_Z + 0.03 }));
    const back = new THREE.Group();
    back.position.set(0, TOP + FOOT_T, FOOT_Z);
    back.rotation.x = -LEAN;
    back.add(boxMesh(PLATE_W, PLATE_H, PLATE_T, ACRYLIC, { y: PLATE_H / 2, z: -PLATE_T / 2 }));
    this.add(back);
    this.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) mesh.receiveShadow = true;
    });

    const holder = new THREE.Group();
    holder.name = 'PedestalEasel';
    holder.position.set(0, TOP + FOOT_T, FOOT_Z);
    this.add(holder);
    this.slots = [{ holder, maxWidth: 0.21, maxHeight: 0.24, lean: LEAN, support: 'plate' }];
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(-BASE_W / 2, 0, -BASE_W / 2), new THREE.Vector3(BASE_W / 2, TOP + 0.22, BASE_W / 2));
  }
}
