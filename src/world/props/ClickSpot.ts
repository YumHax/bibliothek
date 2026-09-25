import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { invisibleHitbox } from '../meshUtils';
import { Prop } from './Prop';

export interface ClickSpotOptions {
  /** Size of the invisible click target, centred on the spot's origin. */
  size: [width: number, height: number, depth: number];
  /** The caption while hovered, or null for none (asked every time: it can follow the host's state). */
  label: () => string | null;
  onClick: () => void;
}

/**
 * A second click target on a fitting that already answers one (the WC's lid beside its flush,
 * a tub's plug beside its tap): an invisible box whose caption and click are the host's callbacks.
 * The host sets its pose in its own space and exposes it; the builder places it with `placeWith`.
 * Draws nothing and never collides.
 */
export class ClickSpot extends Prop implements Interactable {
  readonly contactShadow = false;
  readonly hitboxes: THREE.Object3D[];

  constructor(private readonly options: ClickSpotOptions) {
    super();
    this.name = 'ClickSpot';
    const [w, h, d] = options.size;
    const hitbox = invisibleHitbox(w, h, d);
    this.add(hitbox);
    this.hitboxes = [hitbox];
  }

  setHovered(_hovered: boolean): void {}

  label(): string | null {
    return this.options.label();
  }

  activate(_session: SessionActions): void {
    this.options.onClick();
  }
}
