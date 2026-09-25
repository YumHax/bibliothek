import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { invisibleHitbox } from '../meshUtils';
import type { Furniture } from '../Furniture';

export interface StreetDoorOptions {
  width: number;
  height: number;
  /** The zone it leads to (a `travel` zone of `WORLD_PLAN`). */
  to: string;
  label: string;
}

/**
 * A door on a facade that leads somewhere (home, the arcade, the retro games shop and the flea
 * market behind it): the door itself is painted on the facade, this is the click on it. It asks
 * the Session to travel straight there (`SessionActions.travel(to)`), no menu. Wall-hung: origin
 * on the pavement at the middle of the door, +z facing the street. Never collides (the building
 * line does).
 */
export class StreetDoor extends THREE.Group implements Furniture, Interactable {
  readonly contactShadow = false;
  readonly hitboxes: THREE.Object3D[];

  constructor(private readonly options: StreetDoorOptions) {
    super();
    this.name = `StreetDoor:${options.to}`;
    const hitbox = invisibleHitbox(options.width, options.height, 0.2, { y: options.height / 2, z: 0.05 });
    this.hitboxes = [hitbox];
    this.add(hitbox);
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  setHovered(): void {
    // Painted on the facade: the caption says it all.
  }

  label(): string {
    return this.options.label;
  }

  activate(session: SessionActions): void {
    session.travel(this.options.to);
  }
}
