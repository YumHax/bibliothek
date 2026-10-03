import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SeatLike, SessionActions } from '@/game/SessionActions';
import type { Furniture } from '../Furniture';
import { FACING_OUT, eyePoseAt, invisibleHitbox } from '../meshUtils';
import { cloth, timber } from '../materials/palette';
import { part } from '../props/Prop';
import { HoverGlint } from '../props/hoverGlint';

const SEAT = { width: 0.44, depth: 0.42, height: 0.46 };
const WOOD = timber(0x6a4024, 0.55);
const PAD = cloth(0x5a1a22, 1);
/** Seated, the eye is this high over the floor, a little behind the seat's middle. */
const EYE = new THREE.Vector3(0, 1.18, -0.02);

/**
 * A saleroom chair: bentwood legs, a padded seat, two back rails. One a bidder sits on is theirs (`taken`); any
 * other the player can sit on to follow the sale (a click; any movement key stands up). Origin on the floor at the
 * seat's middle, +z the way a sitter faces.
 */
export class SaleChair extends THREE.Group implements Furniture, Interactable, SeatLike {
  readonly hitboxes: THREE.Object3D[];
  /** Someone of the room sits here: not offered to the player. */
  taken = false;
  private readonly glint: HoverGlint;

  constructor() {
    super();
    this.name = 'SaleChair';
    const { width, depth, height } = SEAT;
    for (const x of [-1, 1]) for (const z of [-1, 1]) part(this, 0.03, height - 0.03, 0.03, WOOD, { x: x * (width / 2 - 0.03), y: (height - 0.03) / 2, z: z * (depth / 2 - 0.03) });
    part(this, width, 0.03, depth, WOOD, { y: height - 0.015 });
    const pad = part(this, width - 0.04, 0.025, depth - 0.04, PAD, { y: height + 0.0125 });
    // The back: two uprights going on from the back legs, two rails across.
    for (const x of [-1, 1]) part(this, 0.03, 0.42, 0.03, WOOD, { x: x * (width / 2 - 0.03), y: height + 0.21, z: -(depth / 2 - 0.03) });
    const rails = [0.2, 0.38].map((y) => part(this, width - 0.06, 0.06, 0.02, WOOD, { y: height + y, z: -(depth / 2 - 0.03) }));
    for (const r of rails) r.castShadow = false;
    this.glint = HoverGlint.of(pad);
    const hitbox = invisibleHitbox(width, height + 0.45, depth, { y: (height + 0.45) / 2 });
    this.add(hitbox);
    this.hitboxes = [hitbox];
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(-SEAT.width / 2, 0, -SEAT.depth / 2), new THREE.Vector3(SEAT.width / 2, SEAT.height + 0.45, SEAT.depth / 2));
  }

  eyePose(): { position: THREE.Vector3; yaw: number } {
    return eyePoseAt(this, EYE, FACING_OUT);
  }

  setHovered(hovered: boolean): void {
    this.glint.set(!this.taken && hovered);
  }

  label(): string | null {
    return this.taken ? null : 'A chair · sit down';
  }

  activate(session: SessionActions): void {
    if (!this.taken) session.sit(this);
  }
}
