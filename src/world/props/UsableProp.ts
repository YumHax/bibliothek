import type * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { PlayerState, SessionActions } from '@/game/SessionActions';
import { invisibleHitbox, type MeshPosition } from '../meshUtils';
import { Prop } from './Prop';

/** What a usable prop says and does: the builder's callbacks (the rules live in `src/household/`). */
export interface UseOptions {
  /** The caption while hovered (asked every time, so it follows the player's hands and the rules' state), or null for none. */
  label: (player: PlayerState) => string | null;
  use: (session: SessionActions) => void;
}

/**
 * A prop the player uses (the cleaning kit, the treat jar, the alarm clock...): its geometry is the
 * subclass's, its click target an invisible box it adds with `target`, its caption and click the
 * builder's `UseOptions`. Never collides, like any `Prop`.
 */
export class UsableProp extends Prop implements Interactable {
  readonly hitboxes: THREE.Object3D[] = [];

  constructor(private readonly use: UseOptions) {
    super();
  }

  /** Adds an invisible click target of that size at `position` (its centre). */
  protected target(width: number, height: number, depth: number, position: MeshPosition = {}): void {
    const hitbox = invisibleHitbox(width, height, depth, position);
    this.add(hitbox);
    this.hitboxes.push(hitbox);
  }

  setHovered(_hovered: boolean): void {}

  label(player: PlayerState): string | null {
    return this.use.label(player);
  }

  activate(session: SessionActions): void {
    this.use.use(session);
  }
}
