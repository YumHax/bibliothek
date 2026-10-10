import type { Game } from '@/catalog/types';
import type { SfxEvent } from '@/audio/ChipSpeaker';
import type { ModalLike } from '@/game/SessionParts';
import type { KidPlan } from './kidsPlan';
import type { KidVerdict } from './yardKids';

/*
 * What the courtyard's kids hand the two panels they open (`ui/yard/KidSwapPanel`, `ui/yard/HandheldPanel`), made by
 * the world's `courtyard/YardKids` when the player asks them: the kid, what is theirs, and how the kid in the yard
 * answers (their words over their head, their face) and what the rules keep of it (`building/kids/yardKids`).
 */

/** A swap of carts with a kid. */
export interface KidSwapDeal {
  kid: KidPlan;
  /** The game day: how many offers the kid has heard is counted per day, not per opening of the panel. */
  day: number;
  /** What is in their pencil case this week (drawn from the market's index: it may take a moment). */
  carts: Promise<readonly Game[]>;
  /** They say it, over their head in the yard. */
  say(line: string): void;
  /** How they take an offer (a grin, a shake of the head). */
  react(verdict: KidVerdict['kind']): void;
  /** The swap was made: the rules keep it, they are pleased with you. */
  swapped(theirs: Game, mine: Game): void;
}

/** A go on a kid's handheld, against their score. */
export interface HandheldPlay {
  kid: KidPlan;
  /** The score to beat: theirs, today. */
  best: number;
  /** Plays the game's sounds out of the handheld in the yard. */
  sounds(events: readonly SfxEvent[]): void;
  /** The go is over: the score, or null when the player gave up before the end. */
  over(score: number | null): void;
}

/** The kids' panels as the courtyard's builder gets them (`BuildContext.panels.kids`, made in `bootstrap/uiPanels`). */
export interface KidPanels {
  swap: ModalLike & { prepare(deal: KidSwapDeal): void };
  handheld: ModalLike & { prepare(play: HandheldPlay): void };
  /** A cart a kid hands over, bored of it: into the parcel, free, from `where`; false when the player has it already. */
  give(cart: Game, where: string): boolean;
}
