import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { Prop } from '../../props/Prop';
import { SwitchableLamp } from '../../props/SwitchableLamp';
import { PendantLamp } from '../../props/PendantLamp';
import { FlushLamp } from '../../props/FlushLamp';
import { PooledLight } from '../../lighting/LightPool';
import { LAMP_LIGHT } from '../../lighting/lampColours';
import type { ShopFitting } from '../common/fitting';

export interface ShowroomLampsOptions {
  /** How much light each lamp on show throws round itself (a `PooledLight` at its shade), 0 for none. Default 0.9. */
  light?: number;
  /** How far that light reaches, metres. Default 2.6. */
  reach?: number;
}

/**
 * Every lamp standing in the showroom switched on, the way a furniture shop shows them: the floor lamp of the living
 * room, the bedside lamp, the reading corner's lamp, the one in the window. The lamps on show are the flat's own
 * (`displayPieces`) with their lights taken out; this finds them in the shop once it stands (a `SwitchableLamp` with
 * no light of its own left: never the shop's ceiling lamp) and works them with the shop's switch (a `ShopFitting`),
 * easing their glow as their own switch would, and gives each a `PooledLight` at its shade so the nearest pour a
 * little warm light round them (lent by the shop's `LightPool`; no shadow). Placed anywhere (`{ floor: [0, 0] }`);
 * nothing to see of its own, never collides.
 */
export class ShowroomLamps extends Prop implements ShopFitting, Updatable {
  private lamps: SwitchableLamp[] | null = null;
  private readonly lights: PooledLight[] = [];
  private lit = true;
  private readonly level: number;
  private readonly reach: number;

  constructor(options: ShowroomLampsOptions = {}) {
    super();
    this.name = 'ShowroomLamps';
    this.level = options.light ?? 0.9;
    this.reach = options.reach ?? 2.6;
  }

  setLit(on: boolean): void {
    // Unchanged: nothing to do (and never a loop back through a lamp that tells the switch).
    if (on === this.lit && this.lamps) return;
    this.lit = on;
    if (this.lamps) this.apply();
  }

  update(dt: number): void {
    // The first tick: everything the shop shows is placed by now.
    if (!this.lamps) this.find();
    for (const lamp of this.lamps!) lamp.update(dt);
  }

  private find(): void {
    const lamps: SwitchableLamp[] = [];
    const root = this.parent;
    root?.traverse((obj) => {
      // The shop's ceiling lamp has no light of its own either (the room's is its light): it is the switch, not a lamp on show.
      if (obj instanceof SwitchableLamp && !(obj instanceof PendantLamp) && !(obj instanceof FlushLamp) && !hasLight(obj)) lamps.push(obj);
    });
    this.lamps = lamps;
    if (root && this.level > 0) {
      root.updateMatrixWorld(true);
      const box = new THREE.Box3();
      for (const lamp of lamps) {
        // At the top of the lamp, where its shade is: the light comes from under it.
        box.setFromObject(lamp);
        const at = new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y - 0.12, (box.min.z + box.max.z) / 2);
        const light = new PooledLight(LAMP_LIGHT.incandescent, 0, this.reach, 2);
        light.position.copy(this.worldToLocal(at));
        this.add(light);
        this.lights.push(light);
      }
    }
    this.apply();
  }

  private apply(): void {
    for (const lamp of this.lamps ?? []) lamp.setOn(this.lit);
    for (const light of this.lights) light.intensity = this.lit ? this.level : 0;
  }
}

function hasLight(root: THREE.Object3D): boolean {
  let found = false;
  root.traverse((obj) => {
    if ((obj as THREE.Light).isLight) found = true;
  });
  return found;
}
