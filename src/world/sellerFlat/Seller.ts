import type * as THREE from 'three';
import type { SaleReaction } from '@/game/SessionActions';
import { Walker } from '../people/Walker';
import { randomLook } from '../people/looks';
import type { GestureName } from '../people/motion/gestures';
import type { SellerTalk } from './sellerTalk';
import type { SocialHook } from '../people/socialHook';
import { random } from '@/random';

interface SellerOptions {
  viewer: THREE.Object3D;
  seed: number;
  name: string;
  talk: SellerTalk;
  /** Someone the player can talk to (`social/sellers`): the conversation instead of a line. */
  social?: SocialHook;
}

/** How each move of the player's is met, besides the words. */
const GESTURE: Partial<Record<SaleReaction, GestureName>> = {
  bought: 'rubHands',
  haggleWon: 'shrug',
  haggleLost: 'headShake',
  insult: 'headShake',
};

/**
 * The private seller in their own living room (`furnishSellerFlat`): stands by the table where the games are, eyes on
 * the player, a word on their arrival, a line when clicked, and an answer to what the player does with a copy (the
 * `ForSaleLike.react` of each box on the table: picked up, haggled over, bought). Zone-local like any walker.
 */
export class Seller extends Walker {
  private readonly script: SellerTalk;
  private turn = 0;

  constructor(options: SellerOptions) {
    super({ viewer: options.viewer, seed: options.seed, look: randomLook(options.seed, 'vendor'), lines: options.talk.chat, label: `${options.name} · chat`, speaker: options.name, social: options.social });
    this.name = 'Seller';
    this.script = options.talk;
  }

  /** The player came in: a word and a wave (the scripted ad's own greeting, when it has one). */
  greet(line?: string): void {
    this.gesture('wave');
    this.speak(line ?? this.pick(this.script.greeting));
  }

  /** The player did something with a copy off the table. */
  reactTo(reaction: SaleReaction): void {
    const gesture = GESTURE[reaction];
    if (gesture) this.gesture(gesture);
    const lines = this.script.react[reaction];
    if (lines?.length && (reaction !== 'pickUp' || this.turn++ % 2 === 0)) this.speak(this.pick(lines));
  }

  /** The coins changed hands. */
  thanks(): string {
    return this.pick(this.script.thanks);
  }

  private pick(lines: readonly string[]): string {
    return lines[Math.floor(random() * lines.length)] ?? '';
  }
}
