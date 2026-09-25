import type * as THREE from 'three';
import type { SessionActions } from '@/game/SessionActions';
import { Walker } from '../people/Walker';
import { randomLook } from '../people/looks';
import type { FriendPlan } from './friendsPlan';

/** Something the friend waits for the player to answer (a game they would like to borrow): the caption, and what a click does. */
export interface FriendRequest {
  label: string;
  answer(session: SessionActions): void;
}

/**
 * A friend on a visit: a `Walker` (walks what the `Visit` gives it, says a word in a bubble, fades
 * so the camera can pass through) with a name. A click chats (`chat`), or answers what they asked
 * (`request`, a borrow). Seen from next door: they belong to the collection room's zone, like the
 * cat, but walk the whole flat, so culling the room never hides them in the corridor.
 */
export class Friend extends Walker {
  readonly seenFromNextDoor = true;
  request: FriendRequest | null = null;
  /** A line for a click, asked afresh each time. */
  chat: (() => string) | null = null;

  constructor(readonly plan: FriendPlan, viewer: THREE.Object3D) {
    super({ viewer, seed: plan.seed, look: { ...randomLook(plan.seed, 'shopper'), ...plan.look }, speed: plan.speed, fade: true });
    this.name = `Friend:${plan.id}`;
  }

  override label(): string | null {
    if (!this.isPresent) return null;
    return this.request?.label ?? `Chat with ${this.plan.name}`;
  }

  override activate(session: SessionActions): void {
    if (!this.isPresent) return;
    if (this.request) {
      this.request.answer(session);
      return;
    }
    const line = this.chat?.();
    if (line) session.hint(`${this.plan.name}: ${line}`);
  }
}
