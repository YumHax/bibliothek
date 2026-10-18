import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import type { PlayerState, SeatLike, SessionActions } from '@/game/SessionActions';
import type { Pastimes } from '@/household/pastime';
import type { Furniture } from '../../Furniture';
import { FACING_OUT, eyePoseAt, invisibleHitbox } from '../../meshUtils';
import type { Vec2 } from '../streetPlan';

/** A while on a bench: how long (game minutes, under the household's limit) and what it was for ("until the bakery opens"). */
export interface BenchWait {
  minutes: number;
  /** The caption's words after "sit": "until the bakery opens", "a while". */
  until: string;
  /** Said as the view comes back. */
  after: string;
}

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
  /** Not there to sit on now (a terrace's chairs stacked away): no caption, no click. */
  away?: () => boolean;
  /** The player sat down (a terrace's waiter comes over), and got up again. */
  onSit?: () => void;
  onStand?: () => void;
  /** Seated, a click lets time pass (a fade, the clock wound on: `household/pastime`); none: a click stands up. */
  wait?: () => BenchWait | null;
  pastimes?: Pastimes;
  /** Sat a little while, the player overhears something of the street (a passer-by's news); null: nothing today. */
  overhear?: () => string | null;
  /** How it is heard: a voice from beside the bench (the notices' `say`). */
  tell?: (line: string) => void;
  /** The camera: whether the player is still sitting here (the eye where the seat puts it). */
  viewer?: THREE.Object3D;
}

/** Seated on a bench, the eye is this high over its seat, a little behind its front edge. */
const EYE_OVER_SEAT = 0.75;
const EYE_BACK = -0.08;
/** Seconds sat before something is overheard; the eye this near its seated place counts as still sitting (m). */
const OVERHEAR_AFTER = 14;
const STILL_SITTING = 0.35;
/** Seconds for the view to settle on the seat before a step away counts. */
const SETTLE = 2;

/**
 * One bench seat the player can sit on (a click; a movement key or E stands up, `Seating`): an
 * invisible box over the seat, the eye placed as on the flat's chairs, placed at its spot (`at`,
 * turned `yaw`). A bench the street's reader is on (`taken`) says so instead. Seated, a click lets
 * time pass (`wait`: until a shop opens nearby, else a while), and after a little while something of
 * the street is overheard (`overhear`), once a sit. The bench itself is `StreetFurniture`'s (and its
 * collider): nothing of its own to draw or collide.
 */
export class BenchSeat extends THREE.Group implements Furniture, Interactable, SeatLike, Updatable {
  readonly contactShadow = false;
  readonly hitboxes: THREE.Object3D[];
  private readonly eye: THREE.Vector3;
  /** Seconds sat here since the last sit down. */
  private sat = 0;
  /** The player is sitting here (`onSit` told, `onStand` not yet); something overheard this sit already. */
  private sitting = false;
  private heard = false;
  private readonly seatEye = new THREE.Vector3();
  private readonly camera = new THREE.Vector3();

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
    if (this.spot.away?.() && player.seatedIn !== this) return null;
    if (player.seated) {
      const wait = player.seatedIn === this && this.spot.pastimes ? this.spot.wait?.() : null;
      return wait ? `${this.spot.name} · sit ${wait.until}` : `${this.spot.name} · stand up`;
    }
    return this.spot.taken?.() ? `${this.spot.name} · taken` : `${this.spot.name} · sit down`;
  }

  activate(session: SessionActions): void {
    if (this.spot.away?.() && session.seatedIn !== this) return;
    if (session.seated) {
      const wait = session.seatedIn === this ? this.spot.wait?.() : null;
      const pastimes = this.spot.pastimes;
      if (wait && pastimes) {
        void pastimes.run({ minutes: wait.minutes, outMs: 700, darkMs: 1400, inMs: 800 }, () => undefined).then((done) => {
          if (done !== null) session.react(wait.after);
        });
        return;
      }
      session.stand();
      if (session.seatedIn !== this) this.left();
    } else if (this.spot.taken?.()) session.refuse('Someone is sitting there.');
    else {
      session.sit(this);
      this.sat = 0;
      this.heard = false;
      this.sitting = true;
      this.spot.onSit?.();
    }
  }

  /** The sit is over (stood up, or walked off): whoever was told the player sat is told they left. */
  private left(): void {
    if (!this.sitting) return;
    this.sitting = false;
    this.spot.onStand?.();
  }

  update(dt: number): void {
    if (!this.sitting || !this.spot.viewer) return;
    // Still here? The camera where the seat put it, once it has settled (a step away and the sit is over).
    this.spot.viewer.getWorldPosition(this.camera);
    this.localToWorld(this.seatEye.copy(this.eye));
    this.sat += dt;
    if (this.sat > SETTLE && this.camera.distanceTo(this.seatEye) > STILL_SITTING) {
      this.left();
      return;
    }
    // Once a sit, a little while in: something overheard.
    if (this.heard || !this.spot.overhear || this.sat < OVERHEAR_AFTER) return;
    this.heard = true;
    const line = this.spot.overhear();
    if (line) this.spot.tell?.(line);
  }
}
