import type * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { invisibleHitbox } from '../meshUtils';
import { ShutDoor, type ShutDoorOptions } from '../props/ShutDoor';
import type { ZoneId } from '../zoneIds';

export interface TravelDoorOptions extends ShutDoorOptions {
  /** Caption under the crosshair, e.g. "Click to go out". */
  label: string;
  /** Asked on hover and click: a reason the door will not open yet (the flat's keys are still in the bowl), or null to go. */
  guard?: () => { label: string; hint: string } | null;
  /** The door let the player through (the destinations are being offered): the hallway waits for them to come home. */
  onGo?: (session: SessionActions) => void;
  /** The zone it leads straight to (the street); without it the door offers every destination (the travel menu). */
  to?: ZoneId;
}

/**
 * A door that leads somewhere the player cannot walk to: the flat's front door, the exit of the
 * arcade or the market. It never swings; clicking it asks the Session to take the player to `to`
 * (the street), or to offer the destinations when it has none (`SessionActions.travel`), and the
 * player is teleported behind a fade. Looks like a `ShutDoor`.
 */
export class TravelDoor extends ShutDoor implements Interactable {
  readonly hitboxes: THREE.Object3D[];
  private readonly caption: string;
  private readonly guard?: TravelDoorOptions['guard'];
  private readonly onGo?: TravelDoorOptions['onGo'];
  private readonly to?: ZoneId;

  constructor(options: TravelDoorOptions) {
    super(options);
    this.name = 'TravelDoor';
    this.caption = options.label;
    this.guard = options.guard;
    this.onGo = options.onGo;
    this.to = options.to;
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
    return this.guard?.()?.label ?? this.caption;
  }

  activate(session: SessionActions): void {
    const blocked = this.guard?.();
    if (blocked) {
      session.hint(blocked.hint);
      return;
    }
    this.onGo?.(session);
    session.travel(this.to);
  }
}
