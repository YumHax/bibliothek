import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { invisibleHitbox } from '../meshUtils';
import { Prop } from './Prop';

export interface SlideDrawerOptions {
  /** Size of the drawer front. */
  width: number;
  height: number;
  /** How far it pulls out (m). */
  travel: number;
  /** What the caption calls it: "drawer". Default "drawer". */
  noun?: string;
  /** Seconds from shut to out. Default 0.35. */
  seconds?: number;
}

/**
 * A drawer that slides out on a click, the `SwingLeaf` of a chest or a nightstand. The host builds
 * the front into `front` and the box with what is in it into `inside` (drawer coordinates: x
 * across, y from the bottom of the front, z from the front's back face; the box runs to -z), and
 * sets the drawer's `position` in its own space: the middle of the bottom edge of the shut front's
 * back face. `inside` is drawn only while the drawer is out (no draw call behind a shut front). The
 * drawer is then placed in the zone next to its host (`placeWith`), since only placed furniture is
 * ticked and clickable. Decoration: it never blocks the player (see `Prop`).
 */
export class SlideDrawer extends Prop implements Interactable, Updatable {
  readonly contactShadow = false;
  readonly hitboxes: THREE.Object3D[];
  /** The front and everything that slides with it. */
  readonly front = new THREE.Group();
  /** The drawer's box and its contents, riding on `front`, hidden while shut. */
  readonly inside = new THREE.Group();
  private readonly noun: string;
  private readonly travel: number;
  private readonly seconds: number;
  private target = 0;
  private openness = 0;

  constructor(options: SlideDrawerOptions) {
    super();
    this.name = 'SlideDrawer';
    this.noun = options.noun ?? 'drawer';
    this.travel = options.travel;
    this.seconds = options.seconds ?? 0.35;
    const hitbox = invisibleHitbox(options.width, options.height, 0.04, { y: options.height / 2, z: 0.02 });
    this.front.add(hitbox, this.inside);
    this.hitboxes = [hitbox];
    this.inside.visible = false;
    this.add(this.front);
  }

  get isOpen(): boolean {
    return this.target > 0;
  }

  update(dt: number): void {
    if (this.openness === this.target) return;
    const step = dt / this.seconds;
    this.openness = this.target > this.openness ? Math.min(this.target, this.openness + step) : Math.max(this.target, this.openness - step);
    this.front.position.z = this.travel * THREE.MathUtils.smoothstep(this.openness, 0, 1);
    this.inside.visible = this.openness > 0;
  }

  // --- Interactable -------------------------------------------------------------------------

  setHovered(_hovered: boolean): void {}

  label(): string {
    return this.isOpen ? `Click to close the ${this.noun}` : `Click to open the ${this.noun}`;
  }

  activate(_session: SessionActions): void {
    this.target = this.target > 0 ? 0 : 1;
  }
}
