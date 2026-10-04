import * as THREE from 'three';
import { hasKey } from '@/building/keys';
import { arriveNextAt } from '../travel/nextArrival';
import { TravelDoor } from '../travel/TravelDoor';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { invisibleHitbox } from '../meshUtils';
import { Prop } from '../props/Prop';

/** What the door says while the player has no key, and its caption either way. */
interface CellarDoorText {
  label: string;
  locked: string;
}

/**
 * The cellars' door off the entrance hall: a plain panelled door, locked ("The cellars, locked: the concierge keeps
 * the key") until the concierge has given the player the key (`building/keys`), then the way down: a travel into the
 * `cellar` zone, arriving at the foot of its stairs. Placed by the stairwell's builder where the plan's cellar door is.
 */
export function cellarDoor(text: CellarDoorText): TravelDoor {
  return new TravelDoor({
    style: 'panelled',
    mat: false,
    label: `${text.label} · go down`,
    to: 'cellar',
    guard: () => (hasKey('cellar') ? null : { label: `${text.label} · locked`, hint: text.locked }),
  });
}

/**
 * The way back up from the cellars: the stairs' steps under the crosshair ("The stairs up to the hall · go up"),
 * a travel back into the stairwell, set down in front of the cellar door (`arriveNextAt`: the hall is not the
 * stairwell's usual arrival). Origin and size: the stairs' box, zone-local, given by the builder.
 */
export class StairsUp extends Prop implements Interactable {
  readonly contactShadow = false;
  readonly hitboxes: THREE.Object3D[];

  constructor(
    box: THREE.Box3,
    private readonly caption: string,
    private readonly back: { position: THREE.Vector3; yaw: number },
  ) {
    super();
    this.name = 'StairsUp';
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const hitbox = invisibleHitbox(size.x, size.y, size.z, { x: centre.x, y: centre.y, z: centre.z });
    this.hitboxes = [hitbox];
    this.add(hitbox);
  }

  setHovered(): void {}

  label(): string {
    return this.caption;
  }

  activate(session: SessionActions): void {
    arriveNextAt('stairwell', this.back.position, this.back.yaw);
    session.travel('stairwell');
  }
}
