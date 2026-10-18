import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import type { Interactable } from '@/interaction/Interactable';
import type { PlayerState, SeatLike, SessionActions } from '@/game/SessionActions';
import type { InstructionCard } from './InstructionCard';

/** The machine the card is on: its hitbox holds the card's, and a play on it keeps the card out of the way. */
type CardHost = Interactable & { readonly isPlaying: boolean };

/** The view's height per metre away at the 70° lens (2·tan 35°). */
const VIEW_PER_M = 1.4;
/** The card takes at most half the view's height, and 70 % of its width on a 4:3 screen… */
const HEIGHT_SHARE = 0.5;
const WIDTH_SHARE = 0.7;
const NARROWEST_ASPECT = 4 / 3;
/** …and the eye is never nearer than this (m): the camera's near plane is at 0.1 m. */
const NEAREST = 0.16;
/** A card steeper than this (its normal's height) lies more than it stands: the view's heading follows its top. */
const LYING = 0.7;
/** Just short of the controller's own pitch limit (`MAX_PITCH`), so the eye is placed where the view will really look. */
const STEEPEST = Math.PI / 2 - 0.02;

const centre = new THREE.Vector3();
const normal = new THREE.Vector3();
const heading = new THREE.Vector3();
const view = new THREE.Vector3();

/**
 * A machine's instruction card, read up close: a click parks the eye square in front of it, the print a good third of
 * the view (the eased move of an armchair, `Seating`: nothing pops up, the mouse still turns the view), and a movement key,
 * E or a click on it again steps back to where the player stood. Placed with the machine (`placeWith`); it draws
 * nothing, the card is the machine's own mesh and its hitbox, picked through the machine's (`within`).
 */
export class CardReading extends THREE.Object3D implements Furniture, Interactable, SeatLike {
  readonly footprint = new THREE.Box3();
  readonly contactShadow = false;
  readonly hitboxes: THREE.Object3D[];
  readonly within: CardHost;
  readonly leaveVerb = 'step back';

  constructor(private readonly card: InstructionCard, host: CardHost) {
    super();
    this.name = 'CardReading';
    this.hitboxes = [card];
    this.within = host;
  }

  /** Mid-play the card is the machine's again (a light gun aimed low still shoots). */
  passesThrough(): boolean {
    return this.within.isPlaying;
  }

  setHovered(hovered: boolean): void {
    this.card.setLit(hovered);
  }

  label(player: PlayerState): string | null {
    // Read up close, no caption over the print: the prompt says how to step back.
    return player.seatedIn === this ? null : 'How to play · read';
  }

  activate(session: SessionActions): void {
    if (session.seatedIn === this) {
      session.stand();
      return;
    }
    // From the machine's end card (parked at its controls): away from it first.
    if (session.seated) session.stand();
    session.sit(this);
  }

  /**
   * In front of the card, looking at it with its top up the screen. The view has no roll, so its heading is the card's
   * top for a card that lies (the panel's, tilted back towards the cabinet: square to it, the view would face the player
   * and print upside down), its face's for one that stands; the pitch comes as near square as that heading allows
   * (straight down on the panel), and the eye is set back along the view, the card in the middle of it.
   */
  eyePose(): { position: THREE.Vector3; yaw: number; pitch: number } {
    const { card } = this;
    card.updateWorldMatrix(true, false);
    card.getWorldPosition(centre);
    normal.set(0, 0, 1).transformDirection(card.matrixWorld);
    if (Math.abs(normal.y) > LYING) heading.set(0, 1, 0).transformDirection(card.matrixWorld);
    else heading.copy(normal).negate();
    heading.setY(0).normalize();
    const pitch = THREE.MathUtils.clamp(Math.atan2(-normal.y, Math.max(0, -normal.dot(heading))), -STEEPEST, STEEPEST);
    view.copy(heading).multiplyScalar(Math.cos(pitch)).setY(Math.sin(pitch));
    const distance = Math.max(NEAREST, card.height / (VIEW_PER_M * HEIGHT_SHARE), card.width / (VIEW_PER_M * NARROWEST_ASPECT * WIDTH_SHARE));
    const position = centre.clone().addScaledVector(view, -distance);
    // Camera looks down -z: yaw maps (0,0,-1) to (-sin yaw, 0, -cos yaw).
    return { position, yaw: Math.atan2(-heading.x, -heading.z), pitch };
  }
}
