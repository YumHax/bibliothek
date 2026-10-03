import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { PlayerState, SeatLike, SessionActions } from '@/game/SessionActions';
import type { Furniture } from '../../Furniture';
import { FACING_OUT, eyePoseAt, invisibleHitbox } from '../../meshUtils';
import type { Vec2 } from '../streetPlan';

/** A place to sit in the street: where (zone-local, the seat's middle), the way one faces sitting there, the seat's height. */
export interface BenchSpot {
  at: Vec2;
  yaw: number;
  /** The seat's top over the pavement (m). */
  seat: number;
  /** Its length along the bench (m): the click box. */
  length: number;
  /** What it is called in the caption. */
  name: string;
  /** Someone of the street sits there now (the bench's reader): not offered. */
  taken?: () => boolean;
}

/** Seated on a bench, the eye is this high over its seat, a little behind its front edge. */
const EYE_OVER_SEAT = 0.75;
const EYE_BACK = -0.08;

/**
 * One bench seat the player can sit on (a click; a movement key or E stands up, `Seating`): an
 * invisible box over the seat, the eye placed as on the flat's chairs, placed at its spot (`at`,
 * turned `yaw`). A bench the street's reader is on (`taken`) says so instead. The bench itself is
 * `StreetFurniture`'s (and its collider): nothing of its own to draw or collide.
 */
export class BenchSeat extends THREE.Group implements Furniture, Interactable, SeatLike {
  readonly contactShadow = false;
  readonly hitboxes: THREE.Object3D[];
  private readonly eye: THREE.Vector3;

  constructor(private readonly spot: BenchSpot) {
    super();
    this.name = 'BenchSeat';
    const hitbox = invisibleHitbox(spot.length, 0.5, 0.45, { y: spot.seat + 0.1 });
    this.add(hitbox);
    this.hitboxes = [hitbox];
    this.eye = new THREE.Vector3(0, spot.seat + EYE_OVER_SEAT, EYE_BACK);
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  eyePose(): { position: THREE.Vector3; yaw: number } {
    return eyePoseAt(this, this.eye, FACING_OUT);
  }

  setHovered(): void {
    // The bench's slats give no glint; the caption says it.
  }

  label(player: PlayerState): string | null {
    if (player.seated) return `${this.spot.name} · stand up`;
    return this.spot.taken?.() ? `${this.spot.name} · taken` : `${this.spot.name} · sit down`;
  }

  activate(session: SessionActions): void {
    if (session.seated) session.stand();
    else if (this.spot.taken?.()) session.refuse('Someone is sitting there.');
    else session.sit(this);
  }
}
