import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions, UpgradeOfferLike } from '@/game/SessionActions';
import { invisibleHitbox } from '../meshUtils';
import { Prop, part } from '../props/Prop';
import { paint } from '../materials/palette';
import { HoverGlint } from '../props/hoverGlint';
import { formatCoins } from '@/text/money';

interface BookcaseKitOptions {
  price: number;
  /** Called once the kit is paid for: the bookcase goes up where the kit stood. */
  onBought: () => void;
  /** Where it is for, if not the bedroom (Mrs Roux's rooms, `world/annex`): its purchase's title, and who it shelves. */
  title?: string;
  for?: string;
}

const WIDTH = 0.62;
const HEIGHT = 1.25;
const THICKNESS = 0.1;
/** How far the flat box leans back against the wall (radians). */
const LEAN = 0.09;

const CARDBOARD = paint(0xc29a68, 0.9);
const PRINT = paint(0x2f3a44, 0.8);
const STRAP = paint(0xe8e2d4, 0.5);

/**
 * A flat-packed bookcase leaning against a wall, waiting to be bought: a tall, thin cardboard box
 * with a drawing of the bookcase printed on it and two straps round it. Clicking it buys it like any
 * piece for the flat (`SessionActions.buyUpgrade`: dear as it is, a second click confirms); the builder then stands the bookcase where the kit was. Wall-hung
 * with `y: 0`: origin on the floor at the wall, +z into the room. Decoration: never collides.
 */
export class BookcaseKit extends Prop implements Interactable, UpgradeOfferLike {
  readonly title: string;
  readonly detail = 'It stands where the kit leaned: the games waiting for a shelf go up on it.';
  readonly hitboxes: THREE.Object3D[];
  readonly price: number;
  private readonly glint: HoverGlint;

  constructor(private readonly options: BookcaseKitOptions) {
    super();
    this.name = 'BookcaseKit';
    this.price = options.price;
    this.title = options.title ?? 'A bookcase for the bedroom';
    // Stands on its bottom edge a box's thickness out from the wall and leans back onto it.
    const box = new THREE.Group();
    box.position.z = THICKNESS + Math.sin(LEAN) * HEIGHT;
    box.rotation.x = -LEAN;
    this.add(box);
    const z = -THICKNESS / 2;
    part(box, WIDTH, HEIGHT, THICKNESS, CARDBOARD, { y: HEIGHT / 2, z });
    // The bookcase printed on the front: the outline and its shelves.
    const front = 0.002;
    for (const dx of [-0.16, 0.16]) part(box, 0.012, 0.8, front, PRINT, { x: dx, y: 0.62, z: front / 2 }).castShadow = false;
    for (let i = 0; i < 5; i++) part(box, 0.33, 0.012, front, PRINT, { y: 0.23 + i * 0.195, z: front / 2 }).castShadow = false;
    const straps = [0.3, 0.95].map((y) => {
      const strap = part(box, WIDTH + 0.006, 0.03, THICKNESS + 0.006, STRAP, { y, z });
      strap.castShadow = false;
      return strap;
    });
    // Its hover cue: the straps (what a hand would take it by) catch the light.
    this.glint = HoverGlint.of(...straps);
    const hitbox = invisibleHitbox(WIDTH + 0.04, HEIGHT, THICKNESS + 0.06, { y: HEIGHT / 2, z });
    box.add(hitbox);
    this.hitboxes = [hitbox];
  }

  /** Hides the kit (and its hitbox) once the bookcase stands. */
  setAvailable(available: boolean): void {
    this.visible = available;
    this.hitboxes[0]?.scale.setScalar(available ? 1 : 1e-4);
  }

  // --- UpgradeOfferLike ------------------------------------------------------------------------

  bought(): void {
    this.options.onBought();
  }

  // --- Interactable -------------------------------------------------------------------------

  setHovered(hovered: boolean): void {
    this.glint.set(hovered);
  }

  label(): string | null {
    return this.visible ? `Bookcase kit (${formatCoins(this.price)}, for the games ${this.options.for ?? 'the living room'} has no room left for) · buy` : null;
  }

  activate(session: SessionActions): void {
    if (this.visible) session.buyUpgrade(this);
  }
}
