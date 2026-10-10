/**
 * What the game tells the player, by kind (docs/notices.md). Each kind has its own place and look
 * on the screen, and stays up as long as it takes to read (`readMs`), counted only while the game
 * is in front of the player (not under the pause menu, not in a hidden tab).
 *
 * - `say`: a voice with no body in the room (the intercom, a shopkeeper through the door, the
 *   stallholder behind the copy in hand): a subtitle with the speaker's name. People in the room
 *   speak through their own `SpeechBubble` instead, over their head.
 * - `react`: what the click just did ("Keys in pocket", "Alarm set for 7:00"), under the crosshair.
 * - `refuse`: why the click did nothing ("The door is locked", too few coins), under the crosshair, in
 *   red, with a shake and a buzz.
 * - `reward`: something gained (coins, tickets, a game, a prize, a milestone): a banner that pops up in
 *   the middle of the screen with a fanfare; rewards queue, none is lost.
 * - `tip`: how to do something (keys, the first day's next step): a card pinned top left that stays
 *   until it is done (`until`) or replaced.
 * - `prompt`: the keys that matter in a state the player is in (seated, carrying): a quiet line at the
 *   bottom, no sound, gone with the state.
 * - `slip`: something that changed hands without a fanfare (bought, held, a parcel): a slip under the
 *   crosshair with its coin chip.
 * - `read`: something to read (the radio's chronicle, the mail, a plaque, a bath's effect): a paper
 *   card that does not go before it has been read.
 */
export interface NoticeActions {
  /** A voice without a body in view: `speaker` names it on the subtitle. */
  say(line: string, speaker?: string): void;
  /** What the player's action did. */
  react(text: string): void;
  /** Why the player's action did nothing. */
  refuse(text: string): void;
  reward(reward: RewardNotice): void;
  /** Pins a tip; returns the function that takes it down. */
  tip(text: string, options?: TipOptions): () => void;
  /**
   * The keys that matter while the player is in a state (seated, carrying a piece, a pad in hand, at a machine):
   * a quiet line at the bottom of the view, no sound, gone when `until` says the state ended. Returns the function
   * that takes it down.
   */
  prompt(text: string, options?: PromptOptions): () => void;
  /**
   * Something that changed hands with no fanfare (a game bought, a parcel come, a copy held, a debt settled): a slip
   * under the crosshair with its coin / ticket chip. A gain with a number, a prize or a milestone is a `reward`.
   */
  slip(notice: SlipNotice): void;
  read(card: ReadingNotice): void;
}

export interface PromptOptions {
  /** A prompt with the same id replaces it (the same state, new keys). */
  id?: string;
  /** Asked every frame: true takes the prompt down (the state ended). Without it the prompt stays until its remover is called. */
  until?: () => boolean;
}

export interface SlipNotice {
  /** Short: "Bought Chrono Trigger", "A parcel came". */
  title: string;
  /** A line under it: where it went. */
  detail?: string;
  /** Coins spent (negative) or had back (positive), as a chip. */
  coins?: number;
  tickets?: number;
}

/**
 * What the player can put away by hand (the `dismissNotice` key, X): the card being read at once (`all`: every waiting
 * card too), else the reward banner, else the tips (newest first; `all`: every one); the subtitles go with any press.
 * Never the alerts (they have their own button). False when there was nothing to put away.
 */
export interface NoticeDismissing {
  dismiss(all?: boolean): boolean;
  /** Only the card being read (Esc heard in the room, before it pauses); false when no card is up. */
  putDownCard(): boolean;
}

export interface RewardNotice {
  /** Short: "Bought Chrono Trigger", "Milestone reached". */
  title: string;
  /** A line under it: what it means, where it went. */
  detail?: string;
  /** Coins won (positive) or spent (negative), shown as a chip. */
  coins?: number;
  tickets?: number;
  /** The big ones (a milestone, a tournament, a prize): a larger banner with rays. */
  big?: boolean;
  /** A picture over the title (a person's portrait when they become a friend), and the colour it is ringed in. */
  picture?: HTMLCanvasElement;
  pictureRing?: string;
}

export interface TipOptions {
  /** A tip with the same id replaces it (a new one for the same step). */
  id?: string;
  /** The card's heading. Default "Tip"; the first day's are "To do". */
  head?: string;
  /** `note`: a handwritten slip like the to-do list (default for a "To do" head); `card`: the blue tip card. */
  look?: 'card' | 'note';
  /** Asked every frame: true takes the tip down (the thing was done). */
  until?: () => boolean;
  /** Takes it down after this long, counted while playing. Default: twice its reading time, at least 12 s. */
  ms?: number;
}

/**
 * The paper the card is printed on: a `note` (a scrap, a plaque's neighbour), a `letter` (a sheet with a sender, a date and
 * a signature, out of an envelope), a `postcard` (picture side first), a `flyer` (printed in its `accent` colour), the
 * `radio`'s printout, a brass `plaque`.
 */
export type ReadingLook = 'note' | 'letter' | 'postcard' | 'flyer' | 'radio' | 'plaque';

export interface ReadingNotice {
  title?: string;
  text: string;
  /** What it changed, in bold under the text ("Worth its full price again."). */
  effect?: string;
  look?: ReadingLook;
  /** Who wrote it (a letter, a postcard): the signature line. */
  from?: string;
  /** A letter's hand: in `pen` (default), on a `typewriter`, or in `print` (the paper). */
  hand?: 'pen' | 'typewriter' | 'print';
  /** When (a letter): the date line, in the writer's words ("December 1993", "Tuesday"). */
  date?: string;
  /** Where from (a postcard): the picture side's caption. */
  place?: string;
  /** A flyer's printed colour (the 3D sheet's `accent`). */
  accent?: number;
  /** One of a batch (the mailbox's three pieces, the notice board): "2 of 3" on the card. */
  of?: { index: number; count: number };
}
