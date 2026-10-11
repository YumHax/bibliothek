import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../Furniture';
import { getPrize } from '@/economy/Prizes';
import { invisibleHitbox } from '../meshUtils';
import { PROUD } from '../props/joinery';
import { playSqueak } from '@/audio/prizeSounds';
import { prizeModel } from './prizeModel';
import { type OwnedPrizes, showWhenOwned } from './ownedPrize';

interface BathDuckOptions {
  prizes: OwnedPrizes;
  /** Tub-local spot on the rim where it sits while the bath is dry, and where it floats once there is water. */
  rim: THREE.Vector3;
  float: THREE.Vector3;
  /** The tub's water surface (tub-local height), or null while it is too shallow to float in (`Bathtub.waterSurface`). */
  water: () => number | null;
  /** The prize that brings it home. Default 'duck'. */
  prizeId?: string;
}

/** How fast it moves between the rim and the water (m/s), and how it bobs afloat. */
const HOP_SPEED = 0.6;
const BOB = { height: 0.004, speed: 1.7 };
const SQUASH_SECONDS = 0.25;

/**
 * The rubber duck won at the arcade, on the bath's rim at the far end from the taps, in its sunglasses; once the bath
 * is run it is in the water, bobbing and turning slowly, and back on the rim when it drains. A click squeezes it: a
 * squeak, a squash. Hidden (and unclickable) until the prize is owned. Tub-local (placed with the tub); never collides.
 */
export class BathDuck extends THREE.Group implements Furniture, Interactable, Updatable {
  readonly contactShadow = false;
  readonly hitboxes: THREE.Object3D[];
  private readonly body = new THREE.Group();
  private readonly duck: THREE.Group;
  private readonly hitbox: THREE.Object3D;
  private readonly unsubscribe: () => void;
  private owned = false;
  /** Where the duck is heading this frame (reused, not allocated per frame). */
  private readonly target = new THREE.Vector3();
  private clock = 0;
  private squash = 0;

  constructor(private readonly options: BathDuckOptions) {
    super();
    this.name = 'BathDuck';
    const prize = getPrize(options.prizeId ?? 'duck')!;
    this.duck = prizeModel(prize.kind, prize.color);
    this.body.add(this.duck);
    this.body.position.copy(options.rim).setY(options.rim.y + PROUD);
    this.body.rotation.y = -0.6; // looking along the bath, towards the taps
    this.add(this.body);
    this.hitbox = invisibleHitbox(0.1, 0.1, 0.1, { y: 0.05 });
    this.hitbox.position.copy(this.body.position).add(new THREE.Vector3(0, 0.05, 0));
    this.hitboxes = [this.hitbox];
    this.add(this.hitbox);
    this.unsubscribe = showWhenOwned(options.prizes, prize.id, this.body, this.hitbox, (owned) => (this.owned = owned));
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  setHovered(): void {}

  label(): string | null {
    return this.owned ? 'Rubber duck · squeeze it' : null;
  }

  activate(): void {
    if (!this.owned) return;
    this.squash = SQUASH_SECONDS;
    playSqueak();
  }

  update(dt: number): void {
    if (!this.owned) return;
    this.clock += dt;
    const water = this.options.water();
    const target = water === null ? this.target.copy(this.options.rim).setY(this.options.rim.y + PROUD) : this.target.copy(this.options.float).setY(water - 0.012);
    // Over to where it belongs (in the water once the bath is run, back on the rim when it drains), at a duck's pace.
    const at = this.body.position;
    const step = HOP_SPEED * dt;
    const gap = at.distanceTo(target);
    if (gap > step) at.addScaledVector(target.sub(at).normalize(), step);
    else at.copy(target);
    if (water !== null) {
      at.y += Math.sin(this.clock * BOB.speed) * BOB.height;
      this.body.rotation.y += dt * 0.08;
    }
    if (this.hitbox.position.y > -10) this.hitbox.position.set(at.x, at.y + 0.05, at.z); // still out of reach while not owned
    this.squash = Math.max(0, this.squash - dt);
    const s = Math.sin((this.squash / SQUASH_SECONDS) * Math.PI) * 0.25;
    this.duck.scale.set(1 + s * 0.5, 1 - s, 1 + s * 0.5);
  }

  dispose(): void {
    this.unsubscribe();
  }
}
