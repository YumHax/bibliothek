import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { easeInCubic } from '@/math/easing';
import { invisibleHitbox } from '../meshUtils';
import { Prop, disposeTree } from './Prop';
import { HoverGlint } from './hoverGlint';
import type { Stash } from './Openable';

interface FindPickupOptions {
  /** Where it lies: in the door's or drawer's own space, so it stays put as a panel swings or slides out with a drawer. */
  stash: Stash;
  /** What lies there (`findModels`): its origin on its bottom face. */
  model: THREE.Object3D;
  /** It lies at the stash's `flat` spot (a booklet, on top of what is in the drawer), not at `at`. */
  flat?: boolean;
  /** The caption: "Loose change · take". */
  label: string;
  /** How far its door or drawer is open (`Openable.openness`). */
  openness: () => number;
  /** Clicked: the builder pockets it (the wallet, the slip, the sound). */
  take: (session: SessionActions) => void;
  /** It has gone into the pocket and off the shelf: the builder takes it out of the zone. */
  gone: () => void;
}

/** Reachable once its door or drawer is this far open: not through a gap, nor through a worktop over a shut drawer. */
const REACH_OPEN = 0.6;
/** The hitbox reaches this far round what lies there (m): coins are tiny from eye height. */
const MARGIN = 0.02;
/** The smallest hitbox, across and deep (m). */
const MIN_REACH = 0.07;
/** Seconds from the click to gone: it lifts off the shelf and shrinks into the hand. */
const POCKET_SECONDS = 0.3;
/** How high it lifts on its way to the pocket (m). */
const POCKET_LIFT = 0.07;
/** A hitbox out of reach: scaled to nothing, the ray misses it. */
const UNREACHABLE = 1e-4;

/**
 * Something found behind a door or in a drawer of the flat, lying there to be picked up (docs/household.md "Doors and
 * drawers"): the model sits in the stash's `holder` (the leaf, or a drawer's `inside`), drawn and reachable only once
 * the door is open; it glints when the crosshair is on it, and a click takes it: the builder pockets it and it lifts
 * off the shelf into the hand. This object holds no mesh of its own: it is what the zone places, ticks and makes
 * clickable (an item is placed in the zone's group, so the model cannot be it). Decoration: it never blocks the player.
 */
export class FindPickup extends Prop implements Interactable, Updatable {
  readonly contactShadow = false;
  readonly hitboxes: THREE.Object3D[];
  /** The model where it lies, and what moves on its way to the pocket. */
  private readonly item = new THREE.Group();
  private readonly hitbox: THREE.Mesh;
  private readonly glint: HoverGlint;
  private readonly rest: THREE.Vector3;
  /** Seconds since it was taken, or null while it lies there. */
  private leaving: number | null = null;

  constructor(private readonly options: FindPickupOptions) {
    super();
    this.name = 'FindPickup';
    const { stash, model } = options;
    this.rest = (options.flat && stash.flat ? stash.flat : stash.at).clone();
    // Measured in its own space before it is put anywhere (a turned room would swap its width and depth).
    const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    this.item.position.copy(this.rest);
    this.item.add(model);
    stash.holder.add(this.item);
    const width = Math.max(MIN_REACH, size.x + 2 * MARGIN);
    const depth = Math.max(MIN_REACH, size.z + 2 * MARGIN);
    const height = size.y + 2 * MARGIN;
    this.hitbox = invisibleHitbox(width, height, depth, { y: height / 2 - MARGIN });
    this.item.add(this.hitbox);
    this.hitboxes = [this.hitbox];
    const meshes: THREE.Mesh[] = [];
    model.traverse((obj) => {
      if (obj instanceof THREE.Mesh) meshes.push(obj);
    });
    this.glint = HoverGlint.of(...meshes);
    this.reach();
  }

  update(dt: number): void {
    if (this.leaving === null) return this.reach();
    this.leaving += dt;
    const t = Math.min(1, this.leaving / POCKET_SECONDS);
    this.item.position.set(this.rest.x, this.rest.y + POCKET_LIFT * Math.sin((t * Math.PI) / 2), this.rest.z);
    this.item.scale.setScalar(Math.max(UNREACHABLE, 1 - easeInCubic(t)));
    if (t < 1) return;
    this.removeModel();
    this.options.gone();
  }

  /** Drawn only once the door is ajar (behind a shut one it would cost a draw call for nothing), reachable once it is open. */
  private reach(): void {
    const openness = this.options.openness();
    this.item.visible = openness > 0;
    this.hitbox.scale.setScalar(openness >= REACH_OPEN ? 1 : UNREACHABLE);
  }

  /** Off the shelf for good (picked up, or yesterday's find replaced by today's): the model and its own textures freed. */
  removeModel(): void {
    this.item.removeFromParent();
    disposeTree(this.item);
  }

  // --- Interactable -------------------------------------------------------------------------

  setHovered(hovered: boolean): void {
    this.glint.set(hovered && this.leaving === null);
  }

  label(): string | null {
    return this.leaving === null ? this.options.label : null;
  }

  activate(session: SessionActions): void {
    if (this.leaving !== null) return;
    this.leaving = 0;
    this.glint.set(false);
    this.hitbox.scale.setScalar(UNREACHABLE);
    this.options.take(session);
  }
}
