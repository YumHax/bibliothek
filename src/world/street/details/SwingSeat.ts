import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import type { PlayerState, SeatLike, SessionActions } from '@/game/SessionActions';
import { pick, random } from '@/random';
import type { Furniture } from '../../Furniture';
import { invisibleHitbox } from '../../meshUtils';
import type { PlaygroundSwing } from '../StreetParkFeatures';
import type { Vec2 } from '../streetPlan';

/** How high the player swings it (radians): gentler than a child pumping it. */
const PUSH = 0.2;
/** The eye over the seat, along the chains (m). */
const EYE_UP = 0.72;
/** Seconds for the sit's eased move to end before the view rides the seat (`FirstPersonController` `SEAT_MOVE_S`, and a little). */
const SETTLE = 0.6;
/** Seconds swung before a thought comes, once a sit. */
const THINK_AFTER = 9;
/** A creak each half swing, above this angle. */
const CREAK_ABOVE = 0.12;

/** What comes to mind a while on the swing. */
const THOUGHTS = [
  'Higher, and the hedge drops away: the street, the bus going by.',
  'Your feet scuff the same worn patch every child has scuffed.',
  'The chains are cold. The swing does not care how old you are.',
  'Up, and the bandstand’s green roof; down, and the red ground again.',
];

interface SwingSeatOptions {
  swing: PlaygroundSwing;
  /** The camera: the eye rides the seat while the player sits here. */
  viewer: THREE.Object3D;
  /** A creak at the top of a swing (`audio/StreetCues`). */
  creak?: (at: Vec2) => void;
  /** One of the building's kids sits on it now (Sunday at the playground). */
  taken?: () => boolean;
}

/**
 * One of the playground's swings to sit on (`StreetParkFeatures`): an invisible box over its seat
 * at rest. Sat on, it swings gently and the eye rides with the seat, so the view rocks forward and
 * back over the lawn; a child on it says it is taken. A movement key, E or a click gets off
 * (`Seating`), and the swing settles. Placed at the zone's origin: the swing's points are the
 * street's frame.
 */
export class SwingSeat extends THREE.Group implements Furniture, Interactable, SeatLike, Updatable {
  readonly contactShadow = false;
  readonly hitboxes: THREE.Object3D[];
  private session: SessionActions | null = null;
  private sat = 0;
  private thought = false;
  private creak = 0;
  private readonly eye = new THREE.Vector3();
  private readonly down = new THREE.Vector3();

  constructor(private readonly options: SwingSeatOptions) {
    super();
    this.name = 'SwingSeat';
    const { rest } = options.swing;
    const hitbox = invisibleHitbox(0.5, 0.35, 0.3, { x: rest.x, y: rest.y + 0.12, z: rest.z });
    this.add(hitbox);
    this.hitboxes = [hitbox];
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  /** The eye over the seat where it is now, facing +z (the way a child on it faces: `life/ParkLife`). */
  eyePose(): { position: THREE.Vector3; yaw: number } {
    return { position: this.localToWorld(this.seatEye(this.eye).clone()), yaw: Math.PI };
  }

  setHovered(): void {
    // The chains give no glint; the caption says it.
  }

  private get riding(): boolean {
    return this.session !== null && this.session.seated && this.session.seatedIn === this;
  }

  private get childOn(): boolean {
    return !this.options.swing.player && (this.options.swing.push > 0 || (this.options.taken?.() ?? false));
  }

  label(player: PlayerState): string | null {
    if (player.seated) return player.seatedIn === this ? 'Swing · get off' : null;
    return this.childOn ? 'Swing · a child is on it' : 'Swing · sit on it';
  }

  activate(session: SessionActions): void {
    if (session.seated) {
      if (session.seatedIn === this) session.stand();
      this.off();
      return;
    }
    if (this.childOn) {
      session.refuse('A child is on that one. Wait your turn.');
      return;
    }
    this.session = session;
    this.sat = 0;
    this.thought = false;
    this.options.swing.player = true;
    this.options.swing.push = PUSH;
    session.sit(this);
  }

  /** Off the swing: it settles, free for a child again. */
  private off(): void {
    const swing = this.options.swing;
    if (!swing.player) return;
    swing.player = false;
    swing.push = 0;
    this.session = null;
  }

  /** The eye's point (the street's frame) above the swing's seat as it hangs now. */
  private seatEye(out: THREE.Vector3): THREE.Vector3 {
    const { seat, hang } = this.options.swing;
    this.down.subVectors(seat, hang).normalize();
    return out.copy(seat).addScaledVector(this.down, -EYE_UP);
  }

  update(dt: number): void {
    if (!this.options.swing.player) return;
    if (!this.riding) {
      this.off();
      return;
    }
    this.sat += dt;
    if (this.sat < SETTLE) return;
    // The view rides the seat: the camera where the eye is on it now.
    const viewer = this.options.viewer;
    this.localToWorld(this.seatEye(this.eye));
    if (viewer.parent) viewer.parent.worldToLocal(this.eye);
    viewer.position.copy(this.eye);
    const swing = this.options.swing;
    if ((this.creak -= dt) <= 0) {
      this.creak = Math.PI / Math.sqrt(9.81 / Math.max(0.5, swing.hang.y - swing.rest.y));
      if (Math.abs(swing.angle) > CREAK_ABOVE) this.options.creak?.([swing.seat.x, swing.seat.z]);
    }
    if (!this.thought && this.sat > THINK_AFTER) {
      this.thought = true;
      this.session?.react(pick(random, THOUGHTS));
    }
  }
}
