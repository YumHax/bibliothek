import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Carriable } from './Carriable';
import type { Inspector } from './Inspector';
import { Rider } from './Rider';

/** How many boxes the arms take on top of the one in hand. */
const MORE = 4;
/** Each box of the handful stands a little higher and to the right of the one in front, its top and edge showing (m). */
const RISE = 0.014;
const FAN = 0.006;
/** The air between two boxes of the handful, front to back (m). */
const BETWEEN = 0.002;

const offset = new THREE.Vector3();
const pos = new THREE.Vector3();
const quat = new THREE.Quaternion();

/**
 * A handful of boxes (docs/furnishing.md "An armful"): up to `MORE` boxes taken on top of the one in hand ride behind
 * it, each a little higher and to the right so their tops and edges show, turned as it is. They are the flat's shelf
 * boxes still (their shelves keep their gaps): put back, they all go home; set down on a table spot
 * (`strays/StrayBox`), they lie there in a pile. Put the box in hand back and the rest go home with it.
 */
export class Armful<Box extends Carriable = Carriable> implements Updatable {
  private riders: Rider<Box>[] = [];
  private leaving: Rider<Box>[] = [];

  constructor(private readonly inspector: Inspector<Box>, private readonly scene: THREE.Object3D) {}

  /** The boxes carried behind the one in hand, front to back (it not included). */
  get boxes(): readonly Box[] {
    return this.riders.map((rider) => rider.box);
  }

  /** The arms take no more. */
  get full(): boolean {
    return this.riders.length >= MORE;
  }

  /** Whether `object` is one of the boxes it carries or is bringing home (the crosshair's ray goes through them). */
  carries(object: unknown): boolean {
    return this.riders.some((rider) => rider.box === object) || this.leaving.some((rider) => rider.box === object);
  }

  /** Takes `box` behind the one in hand; false with nothing in hand or the arms full. */
  add(box: Box): boolean {
    const held = this.inspector.current;
    if (!this.inspector.holding || !held || box === held || this.full || this.carries(box)) return false;
    this.riders.push(new Rider(box, this.scene, false));
    return true;
  }

  /** Every box of the handful goes home. */
  letGo(): void {
    for (const rider of this.riders) rider.sendHome();
    this.leaving.push(...this.riders);
    this.riders = [];
  }

  update(dt: number): void {
    const main = this.inspector.current;
    // The box in hand put back (or set down, or gone): the rest of the handful goes home.
    if (this.riders.length && (!main || !this.inspector.holding)) this.letGo();
    if (this.riders.length) this.riders = this.riders.filter((rider) => !rider.gone);
    if (main && this.riders.length) {
      main.updateWorldMatrix(true, false);
      main.getWorldQuaternion(quat);
      const { width, height, depth } = main.dimensions;
      let behind = depth / 2;
      this.riders.forEach((rider, i) => {
        const size = rider.box.dimensions;
        const n = i + 1;
        // Left edges and bottoms lined up with the box in front, then each one stepped up and right a little.
        offset.set((size.width - width) / 2 + n * FAN, (size.height - height) / 2 + n * RISE, -(behind + BETWEEN + size.depth / 2));
        behind += BETWEEN + size.depth;
        rider.update(dt, main.localToWorld(pos.copy(offset)), quat);
      });
    }
    if (!this.leaving.length) return;
    for (const going of this.leaving) going.update(dt, null, null);
    this.leaving = this.leaving.filter((going) => !going.gone);
  }
}
