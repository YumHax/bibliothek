import type * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { ShutDoor } from '../props/ShutDoor';
import { invisibleHitbox } from '../meshUtils';
import { HoverGlint } from '../props/hoverGlint';

/**
 * Mrs Roux's front door seen from inside her old study: in her colour, its lock and chain, locked for good (the agency
 * kept the keys; the flat is entered through the collection room now). Wall-hung on the study's back wall, flush with
 * where the landing's side of it hangs (`STAIRWELL_PLAN.ourNeighbourX`). A click tries the handle.
 */
export class OldFrontDoor extends ShutDoor implements Interactable {
  readonly hitboxes: THREE.Object3D[];
  private readonly glint: HoverGlint;

  constructor(leafColor: number) {
    super({ style: 'entrance', leafColor, mat: false });
    this.name = 'OldFrontDoor';
    const hitbox = invisibleHitbox(0.95, 2.1, 0.1, { y: 1.05, z: 0.03 });
    this.add(hitbox);
    this.hitboxes = [hitbox];
    this.glint = HoverGlint.fittings(this.leafFace);
  }

  setHovered(hovered: boolean): void {
    this.glint.set(hovered);
  }

  label(): string {
    return 'Her old front door · try the handle';
  }

  activate(session: SessionActions): void {
    session.react('Locked, and the agency kept the keys. Your own front door is the way out now.');
  }
}
