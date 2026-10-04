import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { AmbientVoice } from '@/audio/ambient';
import { HEARING, loudness, type HearingProfile } from '@/audio/hearing';
import { rearOf, stereoPan } from '@/audio/spatial';
import { Prop } from '../props/Prop';
import type { ActivityAware } from '../zone/lifecycle';
import type { SoundOcclusion } from './SoundOcclusion';
import { random } from '@/random';
import { damp } from '@/math/damp';

export interface PointSoundOptions {
  /** Object whose distance drives the loudness (the camera). */
  listener: THREE.Object3D;
  /** Walls in between muffle the sound. */
  occlusion?: SoundOcclusion;
  /** Distance model; the defaults suit a small household sound, heard across a room and faintly next door. */
  volume?: HearingProfile;
}

/** Walls are counted this often (a raycast against every loaded wall); the distance follows every frame. */
const WALLS_EVERY_S = 0.3;
/** The count heard eases to the counted one at this rate (1/s): a door closing dims the sound over a moment, not in one step. */
const WALLS_EASE = 5;

/**
 * Where a room's own little sound comes from: an invisible point placed in the zone like any prop,
 * that turns the listener's distance and the walls in between into the loudness of its
 * `AmbientVoice` (the fridge's hum, a clock's tick), and the listener's yaw and those walls into
 * where it is heard from (`setSpatial`: a side, and a low-pass per wall). Ticked only while its zone is active, and
 * silent while it is not (`setZoneActive`).
 */
export class PointSound extends Prop implements Updatable, ActivityAware {
  readonly contactShadow = false;
  private readonly here = new THREE.Vector3();
  private readonly ear = new THREE.Vector3();
  private walls = 0;
  /** `walls` as heard: eased, fractional in between. */
  private heardWalls = NaN;
  private wallsIn = random() * WALLS_EVERY_S;

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
    const volume = { ...HEARING.household, ...this.options.volume };
    if (distance >= (volume.maxDistance ?? 7)) {
      this.voice.setLevel(0);
      return;
    }
    this.wallsIn -= dt;
    if (this.wallsIn <= 0 && this.options.occlusion) {
      this.wallsIn = WALLS_EVERY_S;
      this.walls = this.options.occlusion.wallsBetween(this.ear, this.here);
    }
    this.heardWalls = Number.isNaN(this.heardWalls) ? this.walls : damp(this.heardWalls, this.walls, WALLS_EASE, dt);
    const walls = this.heardWalls;
    this.voice.setLevel(loudness(distance, volume, walls));
    this.voice.setSpatial?.(stereoPan(this.options.listener, this.here), walls, rearOf(this.options.listener, this.here));
    this.voice.update(dt);
  }

  /** `ActivityAware`: no longer ticked, it could not lower the level any more, so it goes silent now. */
  setZoneActive(active: boolean): void {
    if (this.voice.setZoneActive) this.voice.setZoneActive(active);
    else if (!active) this.voice.setLevel(0);
  }

  dispose(): void {
    this.voice.dispose();
  }
}
