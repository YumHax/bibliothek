import type * as THREE from 'three';
import type { SessionActions } from '@/game/SessionActions';

/**
 * Where something found behind a door or in a drawer lies (`build/rummage`, `props/FindPickup`): `holder` is what
 * carries it (the leaf itself, which stays put while its panel swings, or a drawer's `inside`, which slides), `at` the
 * spot in `holder`'s space where small things lie (coins, a strip of tickets: on a shelf, the cupboard's floor, in front
 * of what is kept there), `flat` where a booklet lies, on top of what is in a drawer (absent: at `at`), and `room`
 * how far from `at` coins may roll in a tight spot (m; absent: a handful's usual spread).
 */
export interface Stash {
  holder: THREE.Object3D;
  at: THREE.Vector3;
  flat?: THREE.Vector3;
  room?: number;
}

/**
 * A door or drawer that opens on a click (`SwingLeaf`, `SlideDrawer`, `DropDoor`): what its caption calls it, how
 * far it is open, what its builder wants done each time the player opens it (the flat's finds, `build/rummage`), and
 * where a find would lie behind it (`stash`, set by the host that knows its insides; null: nothing is ever laid there).
 */
export interface Openable {
  readonly noun: string;
  readonly isOpen: boolean;
  /** 0 shut .. 1 open, as it moves. */
  readonly openness: number;
  onOpen: ((session: SessionActions) => void) | null;
  stash: Stash | null;
}

/**
 * A `Stash` behind a hinged leaf at `at` given in its host's space, where the host set the leaf's
 * `position` (the leaf not placed yet): turned into the leaf's own space, which the find keeps as the panel swings.
 */
export function stashBehind(leaf: THREE.Object3D, at: THREE.Vector3, room?: number): Stash {
  leaf.updateMatrixWorld(true);
  return { holder: leaf, at: leaf.worldToLocal(at.clone()), ...(room ? { room } : {}) };
}
