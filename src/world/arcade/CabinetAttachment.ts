import type * as THREE from 'three';
import type { ArcadeControls } from './games/ArcadeGame';
import type { Occupant } from './Station';

/** What an attachment learns every frame: the controls in effect, who is playing, and where a light gun points. */
export interface AttachmentFrame {
  controls: ArcadeControls;
  who: Occupant;
  /** Cabinet-local point on the glass the gun points at, null when it points off the screen (or there is no gun). */
  aim: THREE.Vector3 | null;
}

/**
 * Something bolted onto an `ArcadeCabinet` that changes how it is played: the light gun on its
 * cable, the dance pad in front. The cabinet adds `object` as a child (cabinet-local, +z towards
 * the player), puts the player's eye at `eye` and a regular's feet at `standAt` when given, and
 * ticks it every frame.
 */
export interface CabinetAttachment {
  readonly object: THREE.Object3D;
  /** Cabinet-local eye while playing, when not the usual spot at the panel. */
  readonly eye?: THREE.Vector3;
  /** Cabinet-local spot a regular stands on, when not the usual one. */
  readonly standAt?: THREE.Vector3;
  /** How far a regular leans in (radians), when not the usual. */
  readonly lean?: number;
  update(dt: number, frame: AttachmentFrame): void;
  /** Where a regular's hands go (world points), or false to keep the cabinet's joystick and button. */
  handsAt?(hands: [THREE.Vector3, THREE.Vector3]): boolean;
  dispose?(): void;
}
