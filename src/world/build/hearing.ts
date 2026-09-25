import type * as THREE from 'three';
import type { AmbientVoice } from '@/audio/ambient';
import type { ProximityVolumeOptions } from '@/video/proximityVolume';
import type { SoundOcclusion } from '../acoustics/SoundOcclusion';
import { PointSound } from '../acoustics/PointSound';
import type { BuildContext } from '../buildContext';

/** What a zone's sounds are heard through: the listener (the camera) and the walls in between. */
export type Hearing = Pick<BuildContext, 'listener' | 'acoustics'>;

/**
 * The options every sound or screen of a zone is built with: its loudness follows the listener's
 * distance, muffled by the walls in between (`PointSound`, `Television`, `Projector`, `tickRadiators`).
 */
export function heardBy({ listener, acoustics }: Hearing): { listener: THREE.Object3D; occlusion: SoundOcclusion } {
  return { listener, occlusion: acoustics };
}

/** A `PointSound` for `voice`, heard from the context's listener through its walls; `volume` overrides the distance model. */
export function pointSound(hearing: Hearing, voice: AmbientVoice, volume?: ProximityVolumeOptions): PointSound {
  return new PointSound(voice, volume ? { ...heardBy(hearing), volume } : heardBy(hearing));
}
