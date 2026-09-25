import type * as THREE from 'three';
import type { ArcadeResult } from '@/game/SessionActions';

/** Who is at a machine: the player, one of the hall's regulars, or nobody. */
export type Occupant = 'player' | 'regular' | null;

/** What a machine tells the hall about the player's plays (the kid watching reacts to them). */
export interface StationEvents {
  onPlayerStart?: () => void;
  onPlayerResult?: (result: ArcadeResult) => void;
  onPlayerLeave?: () => void;
  /** A regular's game on it ended with this score (the crowd may put it on the hall of fame under their initials). */
  onRegularResult?: (score: number) => void;
}

/** The second player's place at a two-player machine: where they stand and hold the controls (machine-local), and who they are. */
export interface PartnerSpot {
  readonly standAt: THREE.Vector3;
  handsAt(): readonly [THREE.Vector3, THREE.Vector3];
  /** Someone took the second stick (their initials), or left it (null: the machine plays it). */
  setPartner(name: string | null): void;
}

/**
 * A machine someone stands at to play: where they stand and what they look at (machine-local),
 * who is on it, and the way a regular takes it over (`occupy`: it plays itself, `release`: back to
 * its attract mode). The player takes it through the Session (`playArcade`), which sets
 * `occupant` to 'player' until they walk away. `ArcadeCrowd` sends the regulars round the free ones.
 */
export interface Station extends THREE.Object3D {
  readonly standAt: THREE.Vector3;
  readonly focus: THREE.Vector3;
  readonly occupant: Occupant;
  readonly stationEvents: StationEvents;
  /** Where a player's two hands are right now (world points: the joystick's knob, a button, a flipper button), so a regular's hands stay on the controls. */
  handsAt(): readonly [THREE.Vector3, THREE.Vector3];
  /** How far a player leans in over it (radians): a little over a panel, a lot over a pinball. */
  readonly lean: number;
  /** A regular steps up: the machine plays itself until `release`. False (nothing changes) when it is taken. */
  occupy(): boolean;
  release(): void;
  /** Out of order today: nobody plays it (the crowd walks past). */
  readonly outOfOrder?: boolean;
  /** A two-player machine: where a second player joins the one at the controls. */
  readonly partner?: PartnerSpot;
}

export function isStation(obj: object): obj is Station {
  const s = obj as Partial<Station>;
  return typeof s.occupy === 'function' && typeof s.release === 'function' && !!s.standAt;
}

/** The line a busy machine's label and click give. */
export const TAKEN_LINE = 'Someone is playing this one. Wait your turn.';
