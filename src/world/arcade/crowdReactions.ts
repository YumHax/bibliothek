import type { Sfx } from '@/audio/ChipSpeaker';
import type { Reaction } from '../people/performer';
import type { Walker } from '../people/Walker';
import { random } from '@/random';

/** What a machine's sounds mean to the people at it and round it. */
const REACTION_OF: Partial<Record<Sfx, Reaction>> = {
  score: 'good',
  eat: 'good',
  perfect: 'good',
  swish: 'good',
  bonus: 'great',
  jackpot: 'great',
  win: 'great',
  stage: 'great',
  best: 'record',
  lose: 'fail',
  drain: 'fail',
  penalty: 'fail',
  tilt: 'fail',
  crunch: 'fail',
  miss: 'fail',
};
/** Seconds before the same person reacts again, by how much it matters (a record always shows), and how often a small one shows at all. */
const REACT_GAP: Record<Reaction, number> = { good: 3, great: 1.5, record: 0, fail: 1.6, near: 1.2, over: 0, ready: 0 };
const GOOD_ODDS = 0.45;

/** What `sfx` means to whoever hears it at the machine, or null (a sound that means nothing to people). */
export function reactionOf(sfx: Sfx): Reaction | null {
  return REACTION_OF[sfx] ?? null;
}

/**
 * Who reacted when, on the hall's own clock, so nobody twitches at every point: a record always shows, a small
 * thing only now and then, and never twice within its gap.
 */
export class CrowdReactions {
  private readonly reacted = new Map<Walker, number>();
  private clock = 0;

  tick(dt: number): void {
    this.clock += dt;
  }

  /** `walker` reacts, unless they did a moment ago. True when they did. */
  once(walker: Walker, reaction: Reaction): boolean {
    const last = this.reacted.get(walker) ?? -Infinity;
    if (this.clock - last < REACT_GAP[reaction]) return false;
    if (reaction === 'good' && random() > GOOD_ODDS) return false;
    this.mark(walker);
    walker.react(reaction);
    return true;
  }

  /** `walker` just reacted another way (a game's end): the small things wait their gap. */
  mark(walker: Walker): void {
    this.reacted.set(walker, this.clock);
  }
}
