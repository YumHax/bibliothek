import * as THREE from 'three';
import { rearOf, stereoPan, type Spatial } from '@/audio/spatial';
import { loudness } from '@/audio/hearing';

/**
 * The listener as every sound of the street hears it (one helper instead of a pan worked out
 * again in each class): where the ears are, how far a source is, and where it comes from: its
 * side (`stereoPan`) and whether it is behind the head (`rearOf`: a little duller and quieter,
 * the one front/back cue a stereo pair has). Feed `spatial` to a `SpatialOut` (`soundGraph`).
 * Call `update` once a frame before asking.
 */
export class StreetEar {
  readonly at = new THREE.Vector3();
  private readonly spot: Spatial = { pan: 0, walls: 0, rear: 0 };

  constructor(readonly listener: THREE.Object3D) {}

  update(): void {
    this.listener.getWorldPosition(this.at);
  }

  /** Metres from the ears to `world`. */
  distance(world: THREE.Vector3): number {
    return this.at.distanceTo(world);
  }

  /** Side and rear of a source at `world` (a shared object: read it before asking again). */
  spatial(world: THREE.Vector3): Spatial {
    this.spot.pan = stereoPan(this.listener, world);
    this.spot.rear = rearOf(this.listener, world);
    return this.spot;
  }
}

/** 1 close by, 0.5 at `halfAt` metres, fading beyond and never quite gone: the street's own profile of `loudness`. */
export function falloff(distance: number, halfAt: number): number {
  return loudness(distance, { shape: 'inverseSquare', referenceDistance: halfAt, maxDistance: Infinity });
}
