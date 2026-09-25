import * as THREE from 'three';
import type { OccupancyAware } from '../Furniture';
import type { SessionActions } from '@/game/SessionActions';
import { Prop } from '../props/Prop';

export interface HomecomingOptions {
  /** The camera: where the player stands when the hallway becomes theirs again. */
  listener: THREE.Object3D;
  /** World floor point the travel sets the player down on when they come home. */
  arrival: THREE.Vector3;
  /** They are back (the session that let them out, for a word). */
  onHome: (session: SessionActions) => void;
}

/** How close to the arrival spot counts as "set down there" (walking in from a room never gets that close). */
const RADIUS = 0.35;
const scratch = new THREE.Vector3();

/**
 * Notices the player coming home through the front door. The door calls `wentOut()` as it lets
 * them through; the next time the hallway becomes the player's zone with them standing on the
 * arrival spot (the teleport's, never reached walking in from a room), `onHome` runs once. Nothing
 * to see: an empty prop placed in the hallway so the zone tells it about occupancy.
 */
export class Homecoming extends Prop implements OccupancyAware {
  readonly contactShadow = false;
  private away: SessionActions | null = null;

  constructor(private readonly options: HomecomingOptions) {
    super();
    this.name = 'Homecoming';
  }

  wentOut(session: SessionActions): void {
    this.away = session;
  }

  setOccupied(occupied: boolean): void {
    const session = this.away;
    if (!occupied || !session) return;
    const { listener, arrival } = this.options;
    listener.getWorldPosition(scratch);
    if (Math.hypot(scratch.x - arrival.x, scratch.z - arrival.z) > RADIUS) return;
    this.away = null;
    this.options.onHome(session);
  }
}
