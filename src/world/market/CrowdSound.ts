import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { CrowdMurmur } from '@/audio/CrowdMurmur';
import type { Furniture, OccupancyAware } from '../Furniture';

/**
 * The hall's murmur (`CrowdMurmur`) as something placed in the zone: heard only while the player
 * is in the hall, as loud as the crowd is big (`setCrowd`, the builder follows the day and night).
 * Nothing to see, never collides; stops for good when the zone unloads.
 */
export class CrowdSound extends THREE.Object3D implements Furniture, Updatable, OccupancyAware {
  readonly contactShadow = false;
  private readonly murmur = new CrowdMurmur();
  private crowd = 1;
  private occupied = false;

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  /** 0 an empty hall .. 1 a busy day. */
  setCrowd(level: number): void {
    this.crowd = level;
    this.apply();
  }

  setOccupied(occupied: boolean): void {
    this.occupied = occupied;
    this.apply();
  }

  update(dt: number): void {
    this.murmur.update(dt);
  }

  dispose(): void {
    this.murmur.dispose();
  }

  private apply(): void {
    this.murmur.setLevel(this.occupied ? this.crowd : 0);
  }
}
