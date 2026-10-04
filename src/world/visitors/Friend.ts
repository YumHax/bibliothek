import type * as THREE from 'three';
import type { SessionActions } from '@/game/SessionActions';
import { Walker } from '../people/Walker';
import { randomLook } from '../people/looks';
import type { FriendPlan } from './friendsPlan';
import type { SocialHook } from '../people/socialHook';

/** The radius (m) their path's corners are swept round with: tight enough for the flat's doorways. */
const CORNERS = 0.25;

/** Something the friend waits for the player to answer (a game they would like to borrow): the caption, and what a click does. */
interface FriendRequest {
  label: string;
  answer(session: SessionActions): void;
}

/**
 * A friend on a visit: a `Walker` (walks what the `Visit` gives it, says a word in a bubble, fades
 * so the camera can pass through) with a name. A click chats (`chat`, which turns them to the
 * player first), or answers what they asked (`request`, a borrow). Seen from next door: they belong to the collection room's zone, like the
 * cat, but walk the whole flat, so culling the room never hides them in the corridor.
 */
export class Friend extends Walker {
  readonly seenFromNextDoor = true;
  request: FriendRequest | null = null;
  /** A line for a click, asked afresh each time. */
  chat: (() => string) | null = null;
  /** Hears them talk: every line or word said, when its bubble shows (the host plays it as a murmur at their mouth). */
  voice: ((text: string) => void) | null = null;
  /**
   * Talking to them (docs/social.md "Friends"): a click opens the conversation, what they asked among its entries;
   * null (a guest, a build without the social layer): the line, or the request answered straight away.
   */
  talker: SocialHook | null = null;
  /** The session of the last click (the conversation's entries open panels through it). */
  session: SessionActions | null = null;
  /** Clicked to talk: the visit turns them to the player. */
  onTalk: (() => void) | null = null;

  constructor(readonly plan: FriendPlan, viewer: THREE.Object3D) {
    // Corners swept rather than pivoted; the `Visit` makes way for the player itself (a word, a sidestep clear of walls).
    super({ viewer, seed: plan.seed, look: { ...randomLook(plan.seed, 'shopper'), ...plan.look }, speed: plan.speed, fade: true, speaker: plan.name, corners: CORNERS, yields: false });
    this.name = `Friend:${plan.id}`;
  }

  /** Their murmur starts with the bubble (a line queued behind another waits with it). */
  protected override lineShown(text: string): void {
    super.lineShown(text);
    this.voice?.(text);
  }

  override label(): string | null {
    if (!this.isPresent) return null;
    return this.request?.label ?? this.talker?.caption() ?? `${this.plan.name} · chat`;
  }

  override activate(session: SessionActions): void {
    if (!this.isPresent) return;
    this.session = session;
    if (this.talker) {
      this.onTalk?.();
      if (this.talker.open(session)) return;
    }
    if (this.request) {
      this.request.answer(session);
      return;
    }
    const line = this.chat?.();
    if (line) this.speak(line);
  }
}
