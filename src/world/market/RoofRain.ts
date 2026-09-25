import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { RainOnRoof } from '@/audio/RainOnRoof';
import type { Furniture, OccupancyAware } from '../Furniture';

/**
 * The rain drumming on the hall's roof (`RainOnRoof`) as something placed in the zone: as loud
 * as it rains outside (`rain`, read every frame from the sky's weather), heard only while the
 * player is in the hall. Nothing to see, never collides; stops for good when the zone unloads.
 */
export class RoofRain extends THREE.Object3D implements Furniture, Updatable, OccupancyAware {
  readonly contactShadow = false;
  private readonly sound = new RainOnRoof();
  private occupied = false;
  private level = -1;

  constructor(private readonly rain: () => number) {
    super();
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  setOccupied(occupied: boolean): void {
    this.occupied = occupied;
    this.level = -1;
  }

  update(dt: number): void {
    const level = this.occupied ? Math.round(this.rain() * 20) / 20 : 0;
    if (level !== this.level) {
      this.level = level;
      this.sound.setLevel(level);
    }
    this.sound.update(dt);
  }

  dispose(): void {
    this.sound.dispose();
  }
}
