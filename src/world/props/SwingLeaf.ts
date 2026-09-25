import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { invisibleHitbox } from '../meshUtils';
import { Prop } from './Prop';

export interface SwingLeafOptions {
  width: number;
  height: number;
  thickness: number;
  /** The vertical edge the hinges are on, as seen from the front. */
  hinge: 'left' | 'right';
  /** What the caption calls it: "fridge", "wardrobe", "cupboard". */
  noun: string;
  /** How far it swings open (radians). Default 100°. */
  maxAngle?: number;
  /** Seconds from shut to open. Default 0.6. */
  seconds?: number;
  /** Called whenever the openness (0 shut .. 1 open) changes: the host shows its insides while any leaf is ajar. */
  onOpenness?: (openness: number) => void;
}

const DEFAULT_ANGLE = THREE.MathUtils.degToRad(100);

/**
 * A hinged leaf that opens on a click: a fridge door, a wardrobe door, a cupboard door. The host
 * furniture builds the face into `panel` (leaf coordinates: `edge(d)` is the x at `d` from the
 * hinge line, y from the bottom edge, z from the back face out) and sets the leaf's `position`
 * and `rotation.y` in its own space: the hinge line at the bottom of the leaf's back face. It
 * turns about its front edge on the hinge side, as an overlay hinge does, so its thickness never
 * sweeps into the neighbouring door or the unit beside it. The leaf is then placed in the zone
 * next to its host (`placeWith`), since only placed furniture is ticked and clickable.
 * Decoration: it never blocks the player (see `Prop`).
 */
export class SwingLeaf extends Prop implements Interactable, Updatable {
  readonly contactShadow = false;
  readonly hitboxes: THREE.Object3D[];
  /** The leaf's parts, turning about the hinge line. */
  readonly panel = new THREE.Group();
  /** The pivot the panel turns on: the front edge of the leaf on the hinge side. */
  private readonly pivot = new THREE.Group();
  private readonly sign: 1 | -1;
  private readonly maxAngle: number;
  private readonly seconds: number;
  private target = 0;
  private openness = 0;

  constructor(private readonly options: SwingLeafOptions) {
    super();
    this.name = 'SwingLeaf';
    this.sign = options.hinge === 'left' ? 1 : -1;
    this.maxAngle = options.maxAngle ?? DEFAULT_ANGLE;
    this.seconds = options.seconds ?? 0.6;
    const { width, height, thickness } = options;
    const hitbox = invisibleHitbox(width, height, thickness + 0.02, { x: this.edge(width / 2), y: height / 2, z: thickness / 2 });
    this.panel.add(hitbox);
    this.hitboxes = [hitbox];
    this.pivot.position.z = thickness;
    this.panel.position.z = -thickness;
    this.pivot.add(this.panel);
    this.add(this.pivot);
  }

  /** Leaf-local x of a point `distance` from the hinge line towards the free edge. */
  edge(distance: number): number {
    return this.sign * distance;
  }

  get isOpen(): boolean {
    return this.target > 0;
  }

  update(dt: number): void {
    if (this.openness === this.target) return;
    const step = dt / this.seconds;
    this.openness = this.target > this.openness ? Math.min(this.target, this.openness + step) : Math.max(this.target, this.openness - step);
    // Hinged on the left, a negative turn about +y brings the free edge (+x) forward (+z).
    this.pivot.rotation.y = -this.sign * this.maxAngle * THREE.MathUtils.smoothstep(this.openness, 0, 1);
    this.options.onOpenness?.(this.openness);
  }

  // --- Interactable -------------------------------------------------------------------------

  setHovered(_hovered: boolean): void {}

  label(): string {
    return this.isOpen ? `Click to close the ${this.options.noun}` : `Click to open the ${this.options.noun}`;
  }

  activate(_session: SessionActions): void {
    this.target = this.target > 0 ? 0 : 1;
  }
}

/**
 * Shows `interior` only while one of the host's leaves is ajar: what is behind a shut door costs no draw call.
 * Returns the callback to hand every leaf as `onOpenness`.
 */
export function revealWhileOpen(interior: THREE.Object3D, leafCount: number): (index: number) => (openness: number) => void {
  const open = new Array<number>(leafCount).fill(0);
  interior.visible = false;
  return (index) => (openness) => {
    open[index] = openness;
    interior.visible = open.some((o) => o > 0);
  };
}
