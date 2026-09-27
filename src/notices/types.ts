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
  read(card: ReadingNotice): void;
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
}

export interface TipOptions {
  /** A tip with the same id replaces it (a new one for the same step). */
  id?: string;
  /** The card's heading. Default "Tip"; the first day's are "To do". */
  head?: string;
  /** Asked every frame: true takes the tip down (the thing was done). */
  until?: () => boolean;
  /** Takes it down after this long, counted while playing. Default: twice its reading time, at least 12 s. */
  ms?: number;
}

/** The paper the card is printed on. */
export type ReadingLook = 'note' | 'letter' | 'radio' | 'plaque';

export interface ReadingNotice {
  title?: string;
  text: string;
  /** What it changed, in bold under the text ("Worth its full price again."). */
  effect?: string;
  look?: ReadingLook;
}
