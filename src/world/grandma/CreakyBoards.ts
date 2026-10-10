import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { playFloorCreak } from '@/audio/furnitureSounds';
import { Prop } from '../props/Prop';
import { random } from '@/random';

/** How loud a loose board gives under the player (the footsteps' own creak is quieter). */
const CREAK_LEVEL = 0.03;

/**
 * The loose boards of Mémé's old parquet (`furnishGrandmaDecor`): spots of the floor (`[x, z, radius]`, zone-local)
 * that creak when the player steps onto them, every time, as an old floor does where it does. Reads where the
 * listener (the camera, over the feet) is each frame while the player is in the zone (quiet while a memory is filmed: the
 * film's camera is the listener too). Placed at the zone's origin.
 */
export class CreakyBoards extends Prop implements Updatable {
  private readonly at = new THREE.Vector3();
  /** The spot the player stands on now, or -1. */
  private on = -1;
  private occupied = false;

  constructor(
    private readonly listener: THREE.Object3D,
    private readonly spots: readonly (readonly [number, number, number])[],
    /** True while the camera is not the player's (a memory filmed here): the boards stay quiet. */
    private readonly quiet: () => boolean = () => false,
  ) {
    super();
    this.name = 'CreakyBoards';
  }

  setOccupied(occupied: boolean): void {
    this.occupied = occupied;
  }

  update(): void {
    if (!this.occupied || this.quiet()) {
      this.on = -1;
      return;
    }
    this.listener.getWorldPosition(this.at);
    this.worldToLocal(this.at);
    const on = this.spots.findIndex(([x, z, r]) => (this.at.x - x) ** 2 + (this.at.z - z) ** 2 < r * r);
    if (on >= 0 && on !== this.on) playFloorCreak(CREAK_LEVEL * (0.8 + 0.4 * random()));
    this.on = on;
  }
}
