import type * as THREE from 'three';
import type { ModalLike } from '@/game/SessionParts';
import type { SessionActions } from '@/game/SessionActions';
import type { Reaction } from './conversation';
import type { InteractionGroup, PersonId, SocialPlace } from './types';

/** The point over someone's head their words come from (their `SpeechBubble`): what the panel sits beside and frames. */
export type SocialAnchor = THREE.Object3D;

/*
 * What a conversation is made of (docs/social.md "Talking"): who, where, the body that answers in the room, and
 * what this place adds to the panel (swap at a resident's door, haggle at a stall, visit, buy). The world builds
 * a `TalkSession` when someone is clicked; `ui/social/ConversationPanel` runs it.
 */

/**
 * The person as the conversation reaches them: in the room (a body that `react`s: their lines over their head, the
 * panel showing neither their face nor their words), or only a voice (through a door, over a counter: no `react`,
 * so the panel shows their face and says their lines itself).
 */
export interface SocialBody {
  speak(line: string): void;
  react?(reaction: Reaction): void;
  /** Where their words come from (a body in the room): the panel turns the view to them, sits beside them, shows the hearts by their face. */
  anchor?: SocialAnchor;
}

/** What one extra entry of the panel does when chosen: a line they say, and whether the conversation ends with it. */
export interface ExtraResult {
  line?: string;
  close?: boolean;
}

/** An entry the place adds to the panel: "Swap games", "Visit their flat", "Haggle", "Buy a coffee". */
export interface TalkExtra {
  id: string;
  group: InteractionGroup;
  /** Phrased as the player's words ("Any news?", ending ?, ! or …) it is said; else it is something done ("Take the parcel"). */
  label: string;
  /** Why it is not open now, or null: the panel leaves it out until it is. Asked each time the panel paints. */
  disabled?: () => string | null;
  /** A word on the row's right for something of the moment ("news"): words, never a symbol. */
  tag?: string;
  /** It opens a panel of its own (the swap, the haggle, a sub-shop): the conversation closes first, then `run`. */
  opensPanel?: boolean;
  run(): ExtraResult | void;
}

/** One conversation: with whom, where, their body, the place's extras, what happens when it ends. */
export interface TalkSession {
  person: PersonId;
  place: SocialPlace;
  body?: SocialBody;
  extras?: readonly TalkExtra[];
  onClose?: () => void;
  /** The session's moves, set by `SocialServices.open` (an extra may open a panel, pay, travel). */
  session?: SessionActions;
  /** Their first word of this conversation instead of their card's hello (how a rivalry stands), or null for the usual. Not asked at a first meeting (their intro) nor when they are cold. */
  opening?: () => string | null;
}

/** The conversation panel as the world opens it: dealt the session, then opened by the Session (`openPanel`). */
export interface ConversationPanelLike extends ModalLike {
  prepare(talk: TalkSession): void;
}

/**
 * The social layer as the world's builders get it (`BuildContext.social`, made in `bootstrap/ui`): open a
 * conversation, and the game day and hour every rule asks.
 */
export interface SocialServices {
  /** Deals `talk` to the conversation panel and has the Session open it. */
  open(session: SessionActions, talk: TalkSession): void;
  /** The game day and hour now. */
  day(): number;
  hour(): number;
}
