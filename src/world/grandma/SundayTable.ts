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

/** What is on the table, table-local [x, z]: the places, the pot, the bread, the bowl of fruit, the pot's lid once off, her birthday cake. */
export interface TableLayout {
  places: readonly Place[];
  /** A third place at the door end, laid only when Gaspard sits down to lunch with them (`setGuest`). */
  guest?: Place;
  pot: readonly [number, number];
  bread: readonly [number, number];
  fruit: readonly [number, number];
  lidOff: readonly [number, number];
  cake: readonly [number, number];
}

/** How far the lunch has got (docs/grandma.md "Sunday lunch, recipes and favours"): laid, the blanquette served, the tart. */
type Course = 'laid' | 'served' | 'dessert';

const PLATE = { r: 0.125, h: 0.014 };
const CUTLERY = { w: 0.02, h: 0.004, l: 0.19, off: 0.17 };
const GLASS_SIZE = { r: 0.032, h: 0.1, beyond: 0.12 };
const POT = { r: 0.115, h: 0.12, trivet: 0.012, lid: 0.02, knob: 0.022 };
const BOARD = { w: 0.34, h: 0.016, d: 0.13, loaf: 0.03 };
const BOWL = { r: 0.13, h: 0.06, fruit: 0.038 };
/** On a plate: the rice, the sauce beside it and its carrots; the tart's slice. */
const SERVING = { rice: 0.055, riceH: 0.022, sauce: 0.06, sauceH: 0.01, carrot: 0.014, carrotH: 0.006, slice: 0.07, plumsH: 0.006 };
const TART = { r: 0.12, h: 0.03, rim: 0.012 };
/** Her birthday cake on its plate: the cake, its icing, the candles and their flames. */
const CAKE = { plate: 0.13, plateH: 0.01, r: 0.1, h: 0.075, icing: 0.008, candle: 0.004, candleH: 0.06, flame: 0.008, candles: 8 };
/** The fruit in the bowl: offset from its middle (x, height over the cloth, z) and colour. */
const FRUIT: readonly [number, number, number, number][] = [
  [-0.045, 0.085, 0.02, 0xb02a22],
  [0.045, 0.085, -0.02, 0x7aa83a],
  [0, 0.088, 0.05, 0xe8902a],
  [0.01, 0.12, -0.01, 0xb8322a],
];

/**
 * What is on Mémé's dining table (`furnishGrandmaDecor`): on a Sunday, lunch for two (the plates and their cutlery
 * and glasses, the bread, the blanquette steaming in its enamel pot), three with Gaspard's at the door end
 * (`setGuest`); any other day the bowl of fruit alone. `setSunday` lays it or clears it. Origin on the cloth's top
 * under the table's middle. Never collides.
 */
export class SundayTable extends Prop implements Updatable {
  readonly contactShadow = false;
  private readonly lunch = new THREE.Group();
  private readonly fruit = new THREE.Group();
  private readonly pot = new THREE.Group();
  private readonly lid = new THREE.Group();
  private readonly lidOff = new THREE.Group();
  private readonly food = new THREE.Group();
  private readonly dessert = new THREE.Group();
  private readonly cake = new THREE.Group();
  /** Gaspard's place: its plate and cutlery, its serving, its slice of tart. */
  private readonly guest = { laid: new THREE.Group(), food: new THREE.Group(), dessert: new THREE.Group() };
  private readonly flames: THREE.Mesh[] = [];
  private flicker = 0;
  private readonly steam = new Steam({ count: 18, life: 2.4, rise: 0.12, endSize: 0.16, opacity: 0.2 });
  private sunday = false;

  constructor(layout: TableLayout) {
    super();
    this.name = 'SundayTable';
    this.add(this.lunch, this.fruit, this.cake);
    this.lunch.add(this.pot, this.lidOff, this.food, this.dessert);
    this.pot.add(this.lid);
    for (const place of layout.places) this.lay(place, this.lunch);
    if (layout.guest) {
      this.lunch.add(this.guest.laid);
      this.lay(layout.guest, this.guest.laid);
    }
    // The pot: an orange enamel cocotte on its trivet, the lid on, steam from under the lid's knob.
    const [px, pz] = layout.pot;
    const enamel = standard({ color: 0xd8642a, roughness: 0.25, metalness: 0 });
    this.pot.add(cylinderMesh(POT.r * 0.9, POT.trivet, paint(0x6a4a2a, 0.7), { x: px, y: POT.trivet / 2, z: pz }, { segments: 6 }));
    const body = POT.trivet + SEAM;
    this.pot.add(cylinderMesh(POT.r, POT.h, enamel, { x: px, y: body + POT.h / 2, z: pz }, { radiusBottom: POT.r * 0.92, segments: 28 }));
    const lid = body + POT.h + SEAM;
    this.lid.add(cylinderMesh(POT.r * 1.04, POT.lid, enamel, { x: px, y: lid + POT.lid / 2, z: pz }, { radiusBottom: POT.r * 1.03, segments: 28 }));
    this.lid.add(cylinderMesh(POT.knob, POT.knob, METAL.steel(), { x: px, y: lid + POT.lid + SEAM + POT.knob / 2, z: pz }, { segments: 12 }));
    // The lid once off, laid on the cloth beside the pot, the knob up.
    const [lx, lz] = layout.lidOff;
    this.lidOff.add(cylinderMesh(POT.r * 1.04, POT.lid, enamel, { x: lx, y: POT.lid / 2, z: lz }, { radiusBottom: POT.r * 1.03, segments: 28 }));
    this.lidOff.add(cylinderMesh(POT.knob, POT.knob, METAL.steel(), { x: lx, y: POT.lid + SEAM + POT.knob / 2, z: lz }, { segments: 12 }));
    for (const s of [-1, 1]) part(this.pot, 0.035, 0.018, 0.04, enamel, { x: px + s * (POT.r + 0.012), y: body + POT.h * 0.8, z: pz });
    this.steam.position.set(px + POT.r * 0.5, lid + POT.lid, pz);
    this.pot.add(this.steam);
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
    this.buildCourses(layout);
    this.buildCake(layout.cake);
    this.setGuest(false);
    this.setSunday(false);
    this.setBirthday(false);
  }

  /** A place laid for one into `into`: the plate, fork to the diner's left, knife to the right (across the axis to their chair), the glass beyond the knife. */
  private lay(place: Place, into: THREE.Group): void {
    const [x, z] = place.at;
    into.add(cylinderMesh(PLATE.r, PLATE.h, paint(0xf6f3ec, 0.35), { x, y: PLATE.h / 2, z }, { radiusBottom: PLATE.r * 0.7, segments: 32 }));
    const ax = place.toward === 'x' ? 0 : 1;
    const az = place.toward === 'x' ? 1 : 0;
    const fork: [number, number] = [x - ax * CUTLERY.off * place.side, z + az * CUTLERY.off * place.side];
    const knife: [number, number] = [x + ax * CUTLERY.off * place.side, z - az * CUTLERY.off * place.side];
    for (const [cx, cz] of [fork, knife]) {
      const piece = part(into, CUTLERY.w, CUTLERY.h, CUTLERY.l, METAL.satinSteel(), { x: cx, y: CUTLERY.h / 2, z: cz });
      piece.rotation.y = place.toward === 'x' ? Math.PI / 2 : 0;
      piece.castShadow = false;
    }
    const away = -place.side * GLASS_SIZE.beyond;
    const glass = cylinderMesh(GLASS_SIZE.r, GLASS_SIZE.h, GLASS.ware, { x: knife[0] + (place.toward === 'x' ? away : 0), y: GLASS_SIZE.h / 2, z: knife[1] + (place.toward === 'z' ? away : 0) }, { radiusBottom: GLASS_SIZE.r * 0.85, segments: 18 });
    glass.castShadow = false;
    into.add(glass);
  }

  /** Gaspard's place laid at the door end (he sits down to lunch with them), or not: never over her birthday cake. */
  setGuest(on: boolean): void {
    const laid = on && !this.cake.visible;
    this.guest.laid.visible = laid;
    this.guest.food.visible = laid;
    this.guest.dessert.visible = laid;
  }

  /** Her candles blown out (the flames gone), or lit again. */
  setCandles(lit: boolean): void {
    for (const flame of this.flames) flame.visible = lit;
  }

  /** The candles burn on her cake now. */
  get candlesLit(): boolean {
    return this.cake.visible && (this.flames[0]?.visible ?? false);
  }

  /** Sunday: lunch laid; any other day: the fruit alone. */
  setSunday(sunday: boolean): void {
    this.sunday = sunday;
    this.lunch.visible = sunday;
    this.fruit.visible = !sunday;
    this.serve('laid');
  }

  /** The lunch as far as it has got (shown only on a lunch day: `setSunday`). */
  serve(course: Course): void {
    this.pot.visible = course !== 'dessert';
    this.lid.visible = course === 'laid';
    this.lidOff.visible = course === 'served';
    this.food.visible = course === 'served';
    this.dessert.visible = course === 'dessert';
  }

  /** Her birthday cake on the cloth, the candles lit. */
  setBirthday(on: boolean): void {
    this.cake.visible = on;
    this.setCandles(true);
    if (on) this.setGuest(false);
  }

  update(dt: number): void {
    this.steam.rate = this.sunday && this.pot.visible ? (this.lid.visible ? 0.6 : 1) : 0;
    this.steam.update(dt);
    if (!this.cake.visible) return;
    this.flicker += dt;
    this.flames.forEach((flame, i) => flame.scale.set(1, 1 + 0.18 * Math.sin(this.flicker * 11 + i * 1.7), 1));
  }

  /** The blanquette on each plate (rice, sauce, carrots) and the tart's course (the tart where the pot was, a slice each). */
  private buildCourses(layout: TableLayout): void {
    const rice = paint(0xf2ecdc, 0.7);
    const sauce = paint(0xe8d8a8, 0.35);
    const carrot = paint(0xe0782a, 0.5);
    const crust = paint(0xc89a5a, 0.75);
    const plums = paint(0x5a2a4a, 0.4);
    const onPlate = PLATE.h + SEAM;
    const serve = (place: Place, food: THREE.Group, dessert: THREE.Group): void => {
      const [x, z] = place.at;
      food.add(cylinderMesh(SERVING.rice, SERVING.riceH, rice, { x: x - 0.03, y: onPlate + SERVING.riceH / 2, z: z - 0.01 }, { radiusBottom: SERVING.rice * 1.1, segments: 16 }));
      food.add(cylinderMesh(SERVING.sauce, SERVING.sauceH, sauce, { x: x + 0.035, y: onPlate + SERVING.sauceH / 2, z: z + 0.02 }, { segments: 16 }));
      for (const [dx, dz] of [[0.02, 0.0], [0.055, 0.035], [0.04, -0.01]] as const) {
        food.add(cylinderMesh(SERVING.carrot, SERVING.carrotH, carrot, { x: x + dx, y: onPlate + SERVING.sauceH + SEAM + SERVING.carrotH / 2, z: z + dz }, { segments: 8 }));
      }
      const slice = part(dessert, SERVING.slice, TART.h, SERVING.slice * 0.6, crust, { x, y: onPlate + TART.h / 2, z });
      slice.rotation.y = 0.5;
      part(dessert, SERVING.slice * 0.9, SERVING.plumsH, SERVING.slice * 0.5, plums, { x, y: onPlate + TART.h + SEAM + SERVING.plumsH / 2, z }).rotation.y = 0.5;
    };
    for (const place of layout.places) serve(place, this.food, this.dessert);
    if (layout.guest) {
      this.food.add(this.guest.food);
      this.dessert.add(this.guest.dessert);
      serve(layout.guest, this.guest.food, this.guest.dessert);
    }
    // The tart where the pot stood (the pot gone back to the kitchenette: `serve` hides it).
    const [px, pz] = layout.pot;
    this.dessert.add(cylinderMesh(TART.r, TART.h, crust, { x: px, y: TART.h / 2, z: pz }, { radiusBottom: TART.r * 0.92, segments: 28 }));
    this.dessert.add(cylinderMesh(TART.r - TART.rim, SERVING.plumsH, plums, { x: px, y: TART.h + SEAM + SERVING.plumsH / 2, z: pz }, { segments: 28 }));
  }

  /** Her cake on its plate, the candles and their flames (unlit by any light: they glow). */
  private buildCake([cx, cz]: readonly [number, number]): void {
    this.cake.add(cylinderMesh(CAKE.plate, CAKE.plateH, paint(0xf6f3ec, 0.35), { x: cx, y: CAKE.plateH / 2, z: cz }, { segments: 28 }));
    const base = CAKE.plateH + SEAM;
    this.cake.add(cylinderMesh(CAKE.r, CAKE.h, paint(0xd8b070, 0.7), { x: cx, y: base + CAKE.h / 2, z: cz }, { segments: 28 }));
    // The icing: a cap over the cake's top edge (wider than the cake, so no face is shared).
    const top = base + CAKE.h + SEAM + CAKE.icing;
    this.cake.add(cylinderMesh(CAKE.r * 1.03, CAKE.icing * 2, paint(0xf4ead8, 0.5), { x: cx, y: top - CAKE.icing, z: cz }, { segments: 28 }));
    const wax = paint(0xf0d8e0, 0.5);
    const flame = new THREE.MeshBasicMaterial({ color: 0xffd27a });
    for (let i = 0; i < CAKE.candles; i++) {
      const a = (i / CAKE.candles) * Math.PI * 2;
      const x = cx + Math.cos(a) * CAKE.r * 0.65;
      const z = cz + Math.sin(a) * CAKE.r * 0.65;
      this.cake.add(cylinderMesh(CAKE.candle, CAKE.candleH, wax, { x, y: top + SEAM + CAKE.candleH / 2, z }, { segments: 6 }));
      const tip = new THREE.Mesh(new THREE.SphereGeometry(CAKE.flame, 6, 5), flame);
      tip.position.set(x, top + SEAM + CAKE.candleH + CAKE.flame * 1.4, z);
      tip.castShadow = false;
      this.flames.push(tip);
      this.cake.add(tip);
    }
  }
}
