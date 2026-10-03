import type * as THREE from 'three';
import type { Game } from '@/catalog/types';
import type { Friend } from '../Friend';
import type { FriendPlan, Word } from '../friendsPlan';
import type { Visit, VisitRoute } from '../Visit';
import type { VisitorsOptions } from '../Visitors';

/**
 * What the visitors' director (`Visitors`) lends a gathering: the round, the bodies, the voices and the sounds of a
 * visit, so several people can be played out at once by the same rules as one friend (docs/visitors.md "Gatherings").
 */
export interface VisitHost {
  readonly options: VisitorsOptions;
  /** The way up the stairs, in and round the collection room (zone-local), the armchairs read live. */
  readonly route: VisitRoute;
  /** After dark on the in-game clock. */
  readonly night: boolean;
  /** A friend's (or a guest's) body, hidden in the collection room's zone until a visit shows it; its murmur wired. */
  person(plan: FriendPlan): Friend;
  /** A visit of the director's own is on (one friend round): no gathering starts meanwhile. */
  readonly visiting: boolean;
  /** The bell rang today (a friend came, or a gathering did): one visit a day. */
  rang(day: number): void;
  rangOn(day: number): boolean;
  /** The line itself over their head for a player in earshot (or always), else a word of `word`'s kind. */
  say(plan: FriendPlan, line: string, word: Word, always?: boolean): void;
  /** A line of `bucket`, from its persisted shuffle bag. */
  line(bucket: string, lines: readonly string[]): string;
  /** At a stop: what they look at and say (a shelf's box, the street), and the game they looked at. */
  browse(plan: FriendPlan, kind: 'shelf' | 'window', at: THREE.Vector3, yaw: number): { look: THREE.Vector3 | null; line: string | null; game: Game | null };
  /** The cat nearby: a word for it, or null. */
  greetCat(): string | null;
  excuse(): string;
  footstep(at: THREE.Vector3): void;
  shutFront(): void;
  ring(): void;
  coinsFrom(plan: FriendPlan, coins: number): void;
  /** The environment a `Visit` walks in: the cat, the screen to watch, the straight ways and the detours. */
  visitOptions(): Pick<ConstructorParameters<typeof Visit>[5], 'cat' | 'watch' | 'clear' | 'detour'>;
  /** Hands the director's door to an occasion (its bell, its guests), or takes it back (null). */
  attach(occasion: Occasion | null): void;
}

/** A gathering as the director sees it: it holds the day, and answers the front door while its guests are at it. */
export interface Occasion {
  /** Today is the gathering's: no friend drops by on their own. */
  holds(day: number): boolean;
  /** Who rings, while one of its guests waits on the landing. */
  caller(): string | null;
  /** The player opened the door to them. */
  answered(): void;
  /** One of its guests is on the way through the open front door. */
  passing(): boolean;
}
