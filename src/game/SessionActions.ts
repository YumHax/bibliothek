import type * as THREE from 'three';
import type { GameBox } from '@/world/GameBox';
import type { VideoScreen } from '@/world/screen';
import type { StockItem } from '@/economy/StockItem';
import type { ModalLike } from './SessionParts';

/** What the player is doing right now; interactables read it to phrase labels and choose actions. */
export interface PlayerState {
  readonly held: GameBox | null;
  readonly seated: boolean;
  /** What the player sits (or lies) in, while seated: the bed tells "in me" from "in the chair across the room". */
  readonly seatedIn?: SeatLike | null;
}

/** How a play at an arcade machine went: the score, whether it beat the player's best, a prize won (the claw). */
export interface ArcadeResult {
  score: number;
  best: boolean;
  /** A prize id (`economy/Prizes`) to take home. */
  prize?: string;
}

/**
 * An arcade machine as the session drives it (a cabinet, the pinball, the alley, the claw): park
 * the player at it, start a paid play, abort. `isPlaying` is true from the coin to the end of
 * everything the player does there (the initials included): a click or E then walks away.
 */
export interface ArcadeMachineLike {
  readonly game: { readonly id: string; readonly title: string; readonly hint: string };
  readonly isPlaying: boolean;
  /** Ticket machines play for free when the player is broke; the claw never does. */
  readonly freeWhenBroke: boolean;
  /** A game of pure luck (the ticket wheel): its score is the tickets it paid; no medals, no challenge. */
  readonly luck?: boolean;
  eyePose(): { position: THREE.Vector3; yaw: number };
  /** World point the camera looks at while playing. */
  screenCentre(): THREE.Vector3;
  start(onOver: (result: ArcadeResult) => void): void;
  abort(): void;
}

/** Something the player did with a stall copy that its stallholder answers (a word, a look). */
export type SaleReaction = 'pickUp' | 'putBack' | 'bought' | 'hold' | 'haggleWon' | 'haggleLost' | 'haggleStopped' | 'insult' | 'caught' | 'locked';

/** A copy for sale at the market: what it is, what it costs, the box to hand over, and how to take it off the stall. */
export interface ForSaleLike {
  readonly item: StockItem;
  readonly box: GameBox;
  /** Whether the game is on the player's wishlist. */
  readonly wanted: boolean;
  /** Where it is sold, for the receipt: "the NES stall", "the bargain bin". */
  readonly where: string;
  /** In a locked glass case: only a player the market trusts may take it in hand. */
  readonly behindGlass?: boolean;
  /** Takes the copy off the stall, once paid for and put away. */
  sold(): void;
  /** The coins change hands: the stallholder's word (and the clink). */
  thanks(): string;
  /** The stallholder answers what the player just did. */
  react?(reaction: SaleReaction): void;
  /** Puts the copy back on its stall after it was sold (a purchase handed back at once). */
  restock?(): void;
}

/** Anything the player can sit (or lie) in: an armchair, the bed. `eyePose` is where the camera goes. */
export interface SeatLike {
  eyePose(): { position: THREE.Vector3; yaw: number };
}

/** Something for the flat paid for on the spot (a bookcase kit): what it is, what it costs, and what happens once it is paid. */
export interface UpgradeOfferLike {
  readonly title: string;
  readonly price: number;
  bought(): void;
}

/** A few coins handed over on the spot (a tip for the busker): the price, and what is said once paid (the toast). */
export interface PaymentLike {
  readonly price: number;
  paid(): string;
}

/** The moves an interactable may ask the session to make on the player's behalf. */
export interface SessionActions extends PlayerState {
  pickUp(box: GameBox): void;
  putBack(): void;
  sit(seat: SeatLike): void;
  stand(): void;
  /** Lying in bed: sleep until the next morning (the view fades out and back, the clock winds on). */
  sleep(): void;
  /** Shows the game's longplay on `screen` (TV, projector…); any other screen that was on is switched off. */
  playOn(screen: VideoScreen, box: GameBox): Promise<void>;
  stopScreen(screen: VideoScreen): void;
  hint(message: string): void;
  /** A door that leads elsewhere was clicked: teleport to `to`, or offer the destinations when it names none. */
  travel(to?: string): void;
  /** Insert a coin and play (or walk away from the machine being played). */
  playArcade(machine: ArcadeMachineLike): void;
  /** Open the prize counter: prizes for tickets, tickets for coins. */
  openPrizeCounter(): void;
  /** The change machine was clicked: today's coins if it works and still has them, else its line. */
  collectChange(): void;
  /** Take a copy off a market stall for a closer look; while it is in hand B buys it, H haggles. */
  inspectForSale(item: ForSaleLike): void;
  /** Open the mail-order catalogue. */
  openCatalogue(): void;
  /** Open the WE BUY desk: sell games from the collection. */
  openSellDesk(): void;
  /** Pay for something on the spot (a bookcase kit in the bedroom, a coffee, a lava lamp off the household stall). */
  buyUpgrade(offer: UpgradeOfferLike): void;
  /** Opens a DOM panel over the room (the notice board, the job lot, the household stall...); the player's hands are emptied first. */
  openPanel(panel: ModalLike): void;
  /** Hand over a few coins (a tip): spent from the wallet, then `paid()`'s line as a toast. */
  pay(payment: PaymentLike): void;
}
