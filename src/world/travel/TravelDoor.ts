import type * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { invisibleHitbox } from '../meshUtils';
import { ShutDoor, type ShutDoorOptions } from '../props/ShutDoor';

export interface TravelDoorOptions extends ShutDoorOptions {
  /** Caption under the crosshair, e.g. "Click to go out". */
  label: string;
}

/**
 * A door that leads somewhere the player cannot walk to: the flat's front door, the exit of the
 * arcade or the market. It never swings; clicking it asks the Session to offer the destinations
 * (`SessionActions.travel`), and the player is teleported behind a fade. Looks like a `ShutDoor`.
 */
export class TravelDoor extends ShutDoor implements Interactable {
  readonly hitboxes: THREE.Object3D[];
  private readonly caption: string;

  constructor(options: TravelDoorOptions) {
    super(options);
    this.name = 'TravelDoor';
    this.caption = options.label;
    const width = options.width ?? 0.83;
    const height = options.height ?? 2.04;
    const hitbox = invisibleHitbox(width + 0.14, height + 0.07, 0.1, { y: (height + 0.07) / 2, z: 0.03 });
    this.hitboxes = [hitbox];
    this.add(hitbox);
  }

  setHovered(): void {
    // The leaf is dark paint; no glow needed, the caption says it all.
  }

  label(): string {
    return this.caption;
  }

  activate(session: SessionActions): void {
    session.travel();
  }
}
