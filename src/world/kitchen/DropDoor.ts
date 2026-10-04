import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { invisibleHitbox } from '../meshUtils';
import { Prop } from '../props/Prop';
import { HoverGlint } from '../props/hoverGlint';
import { captionName } from '../props/SwingLeaf';
import { playLatchClick, playSoftThud } from '@/audio/furnitureSounds';

interface DropDoorOptions {
  width: number;
  height: number;
  thickness: number;
  /** What the caption calls it: "oven", "dishwasher". */
  noun: string;
  /** How far it drops open (radians). Default 85°. */
  maxAngle?: number;
  /** Seconds from shut to open. Default 0.7. */
  seconds?: number;
  /** Called whenever the openness (0 shut .. 1 open) changes: the host shows what is behind it. */
  onOpenness?: (openness: number) => void;
}

const DEFAULT_ANGLE = THREE.MathUtils.degToRad(85);

/**
 * A door hinged along its bottom edge that drops open towards the room on a click: an oven door,
 * a dishwasher. The hinged-at-the-bottom sibling of `SwingLeaf`: the host builds the face into
 * `panel` (x centred, y from the bottom edge up, z from the back face out), sets the door's
 * `position` in its own space (the hinge line: bottom edge of the back face) and exposes it among
 * its `leaves`, which the builder places with `placeLeaves`. Decoration: it never blocks the player.
 */
export class DropDoor extends Prop implements Interactable, Updatable {
  readonly contactShadow = false;
  readonly hitboxes: THREE.Object3D[];
  /** The door's parts, turning about the hinge line (local x). */
  readonly panel = new THREE.Group();
  private readonly maxAngle: number;
  private readonly seconds: number;
  private target = 0;
  private openness = 0;
  /** The handle bar (the panel's small fittings) glints on hover; found on first hover, once the host has built it. */
  private readonly glint = HoverGlint.fittings(this.panel);

  constructor(private readonly options: DropDoorOptions) {
    super();
    this.name = 'DropDoor';
    this.maxAngle = options.maxAngle ?? DEFAULT_ANGLE;
    this.seconds = options.seconds ?? 0.7;
    const { width, height, thickness } = options;
    const hitbox = invisibleHitbox(width, height, thickness + 0.03, { y: height / 2, z: thickness / 2 + 0.01 });
    this.panel.add(hitbox);
    this.hitboxes = [hitbox];
    this.add(this.panel);
  }

  get isOpen(): boolean {
    return this.target > 0;
  }

  update(dt: number): void {
    if (this.openness === this.target) return;
    const step = dt / this.seconds;
    this.openness = this.target > this.openness ? Math.min(this.target, this.openness + step) : Math.max(this.target, this.openness - step);
    // A positive turn about +x brings the top edge (+y) forward (+z).
    this.panel.rotation.x = this.maxAngle * THREE.MathUtils.smoothstep(this.openness, 0, 1);
    this.options.onOpenness?.(this.openness);
    // Down onto its stays with a soft thud; shut, the catch clicks.
    if (this.openness === this.target) {
      if (this.target > 0) playSoftThud(0.08);
      else playLatchClick(0.08);
    }
  }

  // --- Interactable -------------------------------------------------------------------------

  setHovered(hovered: boolean): void {
    this.glint.set(hovered);
  }

  label(): string {
    return `${captionName(this.options.noun)} · ${this.isOpen ? 'close' : 'open'}`;
  }

  activate(_session: SessionActions): void {
    this.target = this.target > 0 ? 0 : 1;
  }
}
