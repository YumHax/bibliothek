import * as THREE from 'three';
import type { Collisions } from '@/core/Collider';
import type { SessionActions } from '@/game/SessionActions';
import type { Doorway } from '../Room';
import { Door } from '../props/Door';

export interface FrontDoorOptions {
  collisions: Collisions;
  leafColor?: number;
  /** Asked when the shut door is clicked from inside: why it will not open (the keys are in the bowl), or null. */
  guard: () => { label: string; hint: string } | null;
  /** The door was opened (the player is going out, or coming in): the hallway's homecoming listens. */
  onOpen: (session: SessionActions) => void;
  /** The camera: the door swings shut on its own once the player is well away from it. */
  viewer: THREE.Object3D;
}

/**
 * Someone who rang and waits on the landing (a friend, `src/world/visitors/`; the building's
 * `Doorstep` stands in front of them all): while `caller()` names them, the door opens without the
 * keys, and opening it lets them in instead of the player out.
 */
export interface DoorCaller {
  /** Who is waiting behind the door, or null. */
  caller(): string | null;
  /** The player opened the door to them. */
  answered(session: SessionActions): void;
  /** Someone is on their way through the open door: it does not swing shut on them. */
  passing(): boolean;
}

/** Further than this from the door, for this long, and it swings shut behind the player. */
const AWAY = 2.6;
const CLOSE_AFTER = 3;

/**
 * The flat's front door onto the landing: a `Door` hung by the hallway that swings out onto the
 * landing (the stairwell zone), locked without the keys from the bowl (`guard`: it will not open
 * from inside while they are there; from the landing it always lets the player in), telling the
 * hallway when it opens (`onOpen`: out, or home), and closing itself a few seconds after the
 * player has walked off.
 */
export class FrontDoor extends Door {
  /** Who may be ringing (the building's `Doorstep`, set by the hallway's builder). */
  visitors: DoorCaller | null = null;
  private awayFor = 0;
  private readonly here = new THREE.Vector3();
  private readonly eye = new THREE.Vector3();

  constructor(doorway: Pick<Doorway, 'width' | 'height' | 'hinge'>, private readonly frontOptions: FrontDoorOptions) {
    super(doorway, { collisions: frontOptions.collisions, leafColor: frontOptions.leafColor, mat: false });
    this.name = 'FrontDoor';
  }

  override label(): string {
    const caller = this.isOpen ? null : this.visitors?.caller();
    if (caller) return `Open the door to ${caller}`;
    if (!this.isOpen) return (this.fromInside() ? this.frontOptions.guard()?.label : null) ?? 'Click to open the front door';
    return 'Click to close the front door';
  }

  override activate(session: SessionActions): void {
    if (!this.isOpen && this.visitors?.caller()) {
      // Answering the door is not going out: no keys needed, and the homecoming is not told.
      this.visitors.answered(session);
      super.activate(session);
      return;
    }
    if (!this.isOpen) {
      // From the landing the player is let in whatever: they are out, so the keys went with them.
      const blocked = this.fromInside() ? this.frontOptions.guard() : null;
      if (blocked) {
        session.hint(blocked.hint);
        return;
      }
      this.frontOptions.onOpen(session);
    }
    super.activate(session);
  }

  /** Whether the player stands on the flat's side of the door (its +z, the hallway that hangs it). */
  private fromInside(): boolean {
    this.frontOptions.viewer.getWorldPosition(this.eye);
    return this.worldToLocal(this.eye).z > 0;
  }

  override update(dt: number): void {
    super.update(dt);
    if (!this.isOpen) {
      this.awayFor = 0;
      return;
    }
    this.getWorldPosition(this.here);
    this.frontOptions.viewer.getWorldPosition(this.eye);
    const far = Math.hypot(this.eye.x - this.here.x, this.eye.z - this.here.z) > AWAY || Math.abs(this.eye.y - this.here.y) > 2.5;
    this.awayFor = far && !this.visitors?.passing() ? this.awayFor + dt : 0;
    if (this.awayFor > CLOSE_AFTER) this.close();
  }
}
