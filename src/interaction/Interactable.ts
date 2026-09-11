import type * as THREE from 'three';
import type { Hoverable } from './Hoverable';
import type { PlayerState, SessionActions } from '@/game/SessionActions';

/** Where the hover caption goes: under the crosshair, or along the top edge when the crosshair sits on something worth seeing (a playing screen). */
export type LabelPlacement = 'crosshair' | 'edge';

/**
 * Something the player can look at and click. The Interactor attributes ray hits on any of
 * `hitboxes` to the interactable, which then phrases its own caption and picks its own action.
 */
export interface Interactable extends Hoverable {
  /** Meshes the crosshair ray is tested against. */
  readonly hitboxes: THREE.Object3D[];
  /** Caption shown under the crosshair while hovered, or null for none. */
  label(player: PlayerState): string | null;
  /** Optional: where to show the caption right now; defaults to 'crosshair'. */
  labelPlacement?(): LabelPlacement;
  /** Left click while hovered. */
  activate(session: SessionActions): void;
}

export function isInteractable(obj: object): obj is Interactable {
  const candidate = obj as Partial<Interactable>;
  return Array.isArray(candidate.hitboxes) && typeof candidate.activate === 'function';
}
