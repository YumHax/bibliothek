import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { AmbientVoice } from '@/audio/ambient';
import { proximityVolume, type ProximityVolumeOptions } from '@/video/proximityVolume';
import { Prop } from '../props/Prop';
import type { SoundOcclusion } from './SoundOcclusion';

export interface PointSoundOptions {
  /** Object whose distance drives the loudness (the camera). */
  listener: THREE.Object3D;
  /** Walls in between muffle the sound. */
  occlusion?: SoundOcclusion;
  /** Distance model; the defaults suit a small household sound, heard across a room and faintly next door. */
  volume?: ProximityVolumeOptions;
}

/** Walls are counted this often (a raycast against every loaded wall); the distance follows every frame. */
const WALLS_EVERY_S = 0.3;

/**
 * Where a room's own little sound comes from: an invisible point placed in the zone like any prop,
 * that turns the listener's distance and the walls in between into the loudness of its
 * `AmbientVoice` (the fridge's hum, a clock's tick). Ticked only while its zone is active.
 */
export class PointSound extends Prop implements Updatable {
  readonly contactShadow = false;
  private readonly here = new THREE.Vector3();
  private readonly ear = new THREE.Vector3();
  private walls = 0;
  private wallsIn = Math.random() * WALLS_EVERY_S;

  constructor(
    private readonly voice: AmbientVoice,
    private readonly options: PointSoundOptions,
  ) {
    super();
    this.name = 'PointSound';
  }

  update(dt: number): void {
    this.getWorldPosition(this.here);
    this.options.listener.getWorldPosition(this.ear);
    const distance = this.here.distanceTo(this.ear);
    const volume = { referenceDistance: 0.8, rolloff: 1.2, maxDistance: 7, ...this.options.volume };
    if (distance >= (volume.maxDistance ?? 7)) {
      this.voice.setLevel(0);
      return;
    }
    this.wallsIn -= dt;
    if (this.wallsIn <= 0 && this.options.occlusion) {
      this.wallsIn = WALLS_EVERY_S;
      this.walls = this.options.occlusion.wallsBetween(this.ear, this.here);
    }
    this.voice.setLevel(proximityVolume(distance, { ...volume, walls: this.walls }) / 100);
    this.voice.update(dt);
  }

  dispose(): void {
    this.voice.dispose();
  }
}
