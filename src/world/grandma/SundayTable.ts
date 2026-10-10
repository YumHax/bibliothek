import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { cylinderMesh } from '../meshUtils';
import { Prop, part } from '../props/Prop';
import { METAL, paint, standard } from '../materials/palette';
import { GLASS } from '../materials/glass';
import { SEAM } from '../props/joinery';
import { Steam } from '../kitchen/Steam';

/** A place laid for one: its plate on the table's top (table-local [x, z]), and where the diner sits from it. */
interface Place {
  at: readonly [number, number];
  /** The axis from the plate to the diner's chair, and which way along it. */
  toward: 'x' | 'z';
  side: 1 | -1;
}

/** What is on the table, table-local [x, z]: the places, the pot, the bread, the bowl of fruit. */
export interface TableLayout {
  places: readonly Place[];
  pot: readonly [number, number];
  bread: readonly [number, number];
  fruit: readonly [number, number];
}

const PLATE = { r: 0.125, h: 0.014 };
const CUTLERY = { w: 0.02, h: 0.004, l: 0.19, off: 0.17 };
const GLASS_SIZE = { r: 0.032, h: 0.1, beyond: 0.12 };
const POT = { r: 0.115, h: 0.12, trivet: 0.012, lid: 0.02, knob: 0.022 };
const BOARD = { w: 0.34, h: 0.016, d: 0.13, loaf: 0.03 };
const BOWL = { r: 0.13, h: 0.06, fruit: 0.038 };
/** The fruit in the bowl: offset from its middle (x, height over the cloth, z) and colour. */
const FRUIT: readonly [number, number, number, number][] = [
  [-0.045, 0.085, 0.02, 0xb02a22],
  [0.045, 0.085, -0.02, 0x7aa83a],
  [0, 0.088, 0.05, 0xe8902a],
  [0.01, 0.12, -0.01, 0xb8322a],
];

/**
 * What is on Mémé's dining table (`furnishGrandmaDecor`): on a Sunday, lunch for two (the plates and their cutlery
 * and glasses, the bread, the blanquette steaming in its enamel pot); any other day the bowl of fruit alone.
 * `setSunday` lays it or clears it. Origin on the cloth's top under the table's middle. Never collides.
 */
export class SundayTable extends Prop implements Updatable {
  readonly contactShadow = false;
  private readonly lunch = new THREE.Group();
  private readonly fruit = new THREE.Group();
  private readonly steam = new Steam({ count: 18, life: 2.4, rise: 0.12, endSize: 0.16, opacity: 0.2 });
  private sunday = false;

  constructor(layout: TableLayout) {
    super();
    this.name = 'SundayTable';
    this.add(this.lunch, this.fruit);
    const china = paint(0xf6f3ec, 0.35);
    const steel = METAL.satinSteel();
    for (const place of layout.places) {
      const [x, z] = place.at;
      this.lunch.add(cylinderMesh(PLATE.r, PLATE.h, china, { x, y: PLATE.h / 2, z }, { radiusBottom: PLATE.r * 0.7, segments: 32 }));
      // Fork to the diner's left, knife to the right (across the axis to their chair), the glass beyond the knife.
      const ax = place.toward === 'x' ? 0 : 1;
      const az = place.toward === 'x' ? 1 : 0;
      const fork: [number, number] = [x - ax * CUTLERY.off * place.side, z + az * CUTLERY.off * place.side];
      const knife: [number, number] = [x + ax * CUTLERY.off * place.side, z - az * CUTLERY.off * place.side];
      for (const [cx, cz] of [fork, knife]) {
        const piece = part(this.lunch, CUTLERY.w, CUTLERY.h, CUTLERY.l, steel, { x: cx, y: CUTLERY.h / 2, z: cz });
        piece.rotation.y = place.toward === 'x' ? Math.PI / 2 : 0;
        piece.castShadow = false;
      }
      const away = -place.side * GLASS_SIZE.beyond;
      const glass = cylinderMesh(GLASS_SIZE.r, GLASS_SIZE.h, GLASS.ware, { x: knife[0] + (place.toward === 'x' ? away : 0), y: GLASS_SIZE.h / 2, z: knife[1] + (place.toward === 'z' ? away : 0) }, { radiusBottom: GLASS_SIZE.r * 0.85, segments: 18 });
      glass.castShadow = false;
      this.lunch.add(glass);
    }
    // The pot: an orange enamel cocotte on its trivet, the lid on, steam from under the lid's knob.
    const [px, pz] = layout.pot;
    const enamel = standard({ color: 0xd8642a, roughness: 0.25, metalness: 0 });
    this.lunch.add(cylinderMesh(POT.r * 0.9, POT.trivet, paint(0x6a4a2a, 0.7), { x: px, y: POT.trivet / 2, z: pz }, { segments: 6 }));
    const body = POT.trivet + SEAM;
    this.lunch.add(cylinderMesh(POT.r, POT.h, enamel, { x: px, y: body + POT.h / 2, z: pz }, { radiusBottom: POT.r * 0.92, segments: 28 }));
    const lid = body + POT.h + SEAM;
    this.lunch.add(cylinderMesh(POT.r * 1.04, POT.lid, enamel, { x: px, y: lid + POT.lid / 2, z: pz }, { radiusBottom: POT.r * 1.03, segments: 28 }));
    this.lunch.add(cylinderMesh(POT.knob, POT.knob, METAL.steel(), { x: px, y: lid + POT.lid + SEAM + POT.knob / 2, z: pz }, { segments: 12 }));
    for (const s of [-1, 1]) part(this.lunch, 0.035, 0.018, 0.04, enamel, { x: px + s * (POT.r + 0.012), y: body + POT.h * 0.8, z: pz });
    this.steam.position.set(px + POT.r * 0.5, lid + POT.lid, pz);
    this.lunch.add(this.steam);
    // The bread on its board.
    const [bx, bz] = layout.bread;
    part(this.lunch, BOARD.w, BOARD.h, BOARD.d, paint(0x9a7448, 0.6), { x: bx, y: BOARD.h / 2, z: bz });
    const loaf = cylinderMesh(BOARD.loaf, BOARD.w * 0.78, paint(0xc8904a, 0.8), { x: bx, y: BOARD.h + SEAM + BOARD.loaf, z: bz }, { segments: 12 });
    loaf.rotation.z = Math.PI / 2;
    this.lunch.add(loaf);
    // The fruit bowl: a shallow bowl, apples and an orange.
    const [ox, oz] = layout.fruit;
    this.fruit.add(cylinderMesh(BOWL.r, BOWL.h, paint(0xe8e2d4, 0.35), { x: ox, y: BOWL.h / 2, z: oz }, { radiusBottom: BOWL.r * 0.45, segments: 28 }));
    for (const [dx, y, dz, colour] of FRUIT) {
      const apple = new THREE.Mesh(new THREE.SphereGeometry(BOWL.fruit, 14, 10), paint(colour, 0.5));
      apple.position.set(ox + dx, y, oz + dz);
      apple.castShadow = true;
      this.fruit.add(apple);
    }
    this.setSunday(false);
  }

  /** Sunday: lunch laid; any other day: the fruit alone. */
  setSunday(sunday: boolean): void {
    this.sunday = sunday;
    this.lunch.visible = sunday;
    this.fruit.visible = !sunday;
  }

  update(dt: number): void {
    this.steam.rate = this.sunday ? 0.6 : 0;
    this.steam.update(dt);
  }
}
