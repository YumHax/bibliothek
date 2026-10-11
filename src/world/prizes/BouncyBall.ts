import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { Updatable } from '@/core/Engine';
import type { SessionActions } from '@/game/SessionActions';
import type { Furniture } from '../Furniture';
import { getPrize } from '@/economy/Prizes';
import { invisibleHitbox } from '../meshUtils';
import { playBounce } from '@/audio/prizeSounds';
import { prizeModel } from './prizeModel';
import { type OwnedPrizes, showWhenOwned } from './ownedPrize';

interface BouncyBallOptions {
  prizes: OwnedPrizes;
  /** Throws it for the cat: calls it over, and says how that went (the cat comes, ignores it, sleeps on). */
  callCat?: () => string;
  /** The prize that brings it home. Default 'ball'. */
  prizeId?: string;
}

/** How high the first hop goes (m), what each bounce keeps of the last, and gravity. */
const THROW_HEIGHT = 0.9;
const RESTITUTION = 0.72;
const G = 9.81;
/** Below this the hops stop. */
const LAST_HOP = 0.01;

/**
 * The bouncy ball won at the arcade, on the living-room floor by the armchairs: glitter in a clear ball. A click throws
 * it down hard: it bounces high and lower and lower, each hop a little thud, and the cat is called over to chase it
 * (`callCat`). Hidden (and unclickable) until the prize is owned. Origin on the floor under it; never collides.
 */
export class BouncyBall extends THREE.Group implements Furniture, Interactable, Updatable {
  readonly contactShadow = false;
  readonly hitboxes: THREE.Object3D[];
  private readonly ball: THREE.Group;
  private readonly unsubscribe: () => void;
  private readonly callCat: (() => string) | undefined;
  private owned = false;
  /** Up speed (m/s) and height of the hop under way; null at rest. */
  private hop: { v: number; y: number } | null = null;

  constructor(options: BouncyBallOptions) {
    super();
    this.name = 'BouncyBall';
    this.callCat = options.callCat;
    const prize = getPrize(options.prizeId ?? 'ball')!;
    this.ball = prizeModel(prize.kind, prize.color);
    this.add(this.ball);
    const hitbox = invisibleHitbox(0.12, 0.1, 0.12, { y: 0.05 });
    this.hitboxes = [hitbox];
    this.add(hitbox);
    this.unsubscribe = showWhenOwned(options.prizes, prize.id, this.ball, hitbox, (owned) => (this.owned = owned));
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  setHovered(): void {}

  label(): string | null {
    return this.owned ? 'Bouncy ball · throw it' : null;
  }

  activate(session: SessionActions): void {
    if (!this.owned) return;
    this.hop = { v: Math.sqrt(2 * G * THROW_HEIGHT), y: 0 };
    playBounce(1);
    session.react(this.callCat?.() ?? 'Boing, boing, boing. It rolls under the armchair and back.');
  }

  update(dt: number): void {
    const hop = this.hop;
    if (!hop) return;
    hop.v -= G * dt;
    hop.y += hop.v * dt;
    if (hop.y <= 0) {
      // A bounce: back up with what the rubber keeps, or still once the hops are too small to see.
      hop.y = 0;
      hop.v = -hop.v * RESTITUTION;
      const height = (hop.v * hop.v) / (2 * G);
      if (height < LAST_HOP) this.hop = null;
      else playBounce(Math.min(1, height / THROW_HEIGHT));
    }
    this.ball.position.y = this.hop ? hop.y : 0;
    this.ball.rotation.x += dt * 6;
  }

  dispose(): void {
    this.unsubscribe();
  }
}
