import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { basic } from '@/world/materials/palette';
import type { GameBox } from '../GameBox';
import type { ShelfTarget, ShelvingGroup } from './ShelvingGroup';

/** How far away a shelf spot can be aimed at with a box in hand (m). */
const REACH = 2.6;
/** The marker in the gap: a thin upright bar the height of the box, lit (not shaded) so it reads on any shelf. */
const BAR_WIDTH = 0.005;
const BAR_DEPTH = 0.008;
const ROOM = basic({ color: 0xffe6a8, toneMapped: false });
const FULL = basic({ color: 0xff6b5c, toneMapped: false });

/** What `ShelfPlacing` needs of the hand: the box in it, and whether it is in hand (not on its way back). */
export interface HandLike {
  readonly current: GameBox | null;
  /** Non-null while the box is in (or on its way to) the hand. */
  readonly focusDistance: number | null;
}

/**
 * With one of the flat's shelf boxes in hand, the spot on a bookcase under the crosshair (`target`) and a marker
 * in the gap it would go into (warm when the row has room, red when it has none); `place` puts it there (the
 * `ShelvingGroup` makes it the player's arrangement), after which the hand lets it go to its new spot.
 */
export class ShelfPlacing implements Updatable {
  private spot: ShelfTarget | null = null;
  private readonly bar: THREE.Mesh;
  private readonly raycaster = new THREE.Raycaster();
  private readonly centre = new THREE.Vector2(0, 0);

  /** `blocked(from, to)`: a wall stands between two world points. */
  constructor(
    private readonly camera: THREE.Camera,
    scene: THREE.Object3D,
    private readonly shelves: ShelvingGroup,
    private readonly hand: HandLike,
    private readonly blocked: (from: THREE.Vector3, to: THREE.Vector3) => boolean,
  ) {
    this.bar = new THREE.Mesh(new THREE.BoxGeometry(BAR_WIDTH, 1, BAR_DEPTH).translate(0, 0.5, 0), ROOM);
    this.bar.name = 'ShelfSpotMarker';
    this.bar.visible = false;
    this.bar.castShadow = false;
    this.bar.receiveShadow = false;
    scene.add(this.bar);
  }

  /** Whether one of the flat's shelf boxes is in hand (not a market copy, not a stray's own box). */
  get active(): boolean {
    const box = this.hand.current;
    return box !== null && this.hand.focusDistance !== null && this.shelves.findBox(box.game.id) === box;
  }

  /** The spot aimed at with a shelf box in hand, if any (`spot.fits` says whether its row has room). */
  get target(): ShelfTarget | null {
    return this.spot;
  }

  /** Puts the box in hand at the aimed spot (the neighbours slide to make room); false when there is none or no room. */
  place(): boolean {
    const box = this.hand.current;
    const spot = this.spot;
    if (!box || !spot?.spot.fits) return false;
    this.shelves.moveBox(box, spot);
    this.hide();
    return true;
  }

  update(): void {
    const box = this.hand.current;
    if (!box || !this.active) return this.hide();
    this.raycaster.setFromCamera(this.centre, this.camera);
    const ray = this.raycaster.ray;
    const hit = this.shelves.spotAt(ray, box, REACH);
    if (!hit || this.blocked(ray.origin, hit.point)) return this.hide();
    this.spot = hit;
    const { shelf, spot } = hit;
    shelf.updateWorldMatrix(true, false);
    this.bar.position.copy(spot.gap).applyMatrix4(shelf.matrixWorld);
    this.bar.quaternion.setFromRotationMatrix(shelf.matrixWorld);
    this.bar.scale.set(1, spot.height, 1);
    this.bar.material = spot.fits ? ROOM : FULL;
    this.bar.visible = true;
  }

  private hide(): void {
    this.spot = null;
    this.bar.visible = false;
  }
}
