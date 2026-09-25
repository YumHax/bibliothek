import type { FirstPersonController } from '@/player/FirstPersonController';
import type { Inspector } from '@/interaction/Inspector';
import type { Interactor } from '@/interaction/Interactor';
import type { Overlay } from '@/ui/Overlay';
import type { GamePanel } from '@/ui/GamePanel';
import type { Toast } from '@/ui/Toast';
import type { SearchBar } from '@/ui/SearchBar';
import type { VideoProvider } from '@/video/VideoProvider';
import type { GameSource } from '@/collection/GameSource';
import type { Game, PlatformId } from '@/catalog/types';
import type { GameBox } from '@/world/GameBox';
import type { Seat } from '@/world/Seat';
import type { SortMode } from '@/world/shelving/sort';
import type { StockItem } from '@/economy/StockItem';
import type { Negotiation } from '@/economy/haggle';
import type { Highlighter } from './Highlighter';

/*
 * Minimal shapes of the optional features the session routes keys to. They are defined here (not
 * imported from the feature modules) so the session compiles and runs whether or not a feature is
 * wired in; `main.ts` passes the concrete objects, which only need to be structurally compatible.
 */

/** The shelves: which boxes exist, where a game's box is, and (optionally) how they are sorted. */
export interface ShelvingLike {
  readonly boxes: readonly GameBox[];
  findBox(gameId: string): GameBox | undefined;
  cycleSort?(): SortMode;
}

/** Day / night lighting toggle. `isNight` lets the toast name the new state. */
export interface DayNightLike {
  toggleNight(): unknown;
  readonly isNight?: boolean;
}

/**
 * A full-screen DOM panel that takes the keyboard and the mouse (the collection editor, the
 * mail-order catalogue). `onOpenChange` is assigned by the session so that closing the panel from
 * its own UI (close button, Esc) also re-enters the room.
 */
export interface ModalLike {
  toggle(): unknown;
  close(): unknown;
  readonly isOpen: boolean;
  onOpenChange?: (open: boolean) => void;
}

/** The cat: the session calls it with a key and tells it which armchair the player sits in. */
export interface CatLike {
  readonly settings: { readonly name: string };
  /** The player calls it: it comes, ignores the call, or is asleep. */
  call(): 'coming' | 'ignored' | 'asleep';
  setPlayerSeat?(seat: Seat | null): void;
}

/** Sleeping until morning in bed; `isAsleep` while the view is dark. */
export interface SleepLike {
  readonly isAsleep: boolean;
  untilMorning(): Promise<void>;
}

/** The player's money: coins to spend, tickets to redeem. */
export interface WalletLike {
  readonly coins: number;
  readonly tickets: number;
  spend(coins: number): boolean;
  addTickets(tickets: number): void;
  earnCoins(coins: number): void;
}

/** The collection as something that can be bought into. */
export interface CollectionLike {
  has(id: string): boolean;
  /** Owned or lent out: a wishlist entry is not a copy. */
  owns(id: string): boolean;
  add(game: Game): void;
  /** Takes a game out (a purchase handed back, a game swapped away). */
  remove?(id: string): void;
  /** Changes a copy in place (an ordinary printing swapped for a first print). */
  update?(id: string, patch: Partial<Omit<Game, 'id'>>): void;
  find?(id: string): Game | undefined;
}

/** The flea market's rules for a copy in hand (see `MarketStock`). */
export interface MarketLike {
  readonly day: number;
  /** A haggle over `item`, or the stallholder's reason for not haggling. */
  negotiate(item: StockItem): Negotiation | { line: string };
  settle(item: StockItem, negotiation: Negotiation, insults: number): void;
  holdDeposit(item: StockItem): number;
  hold(item: StockItem, deposit: number): void;
  /** `item` changed hands: holds, orders and loyalty are brought up to date. */
  sold(item: StockItem): void;
  /** A fake found out; false when it is none, or already found out. */
  expose(item: StockItem): boolean;
  /** A game swapped away goes out on its stall from tomorrow. */
  consign(game: Game): void;
}

/** How the market knows the player: reputation (the glass case), loyalty per stall. */
export interface StandingLike {
  readonly mayHandleGlass: boolean;
  readonly reputation: { name: string; points: number };
  loyaltyName(platform: PlatformId): string;
  record(deed: 'swap'): void;
  undo?(deed: 'buy', platform: PlatformId): void;
}

/** The haggle panel: an exchange of offers over the copy in hand. */
export interface HagglePanelLike extends ModalLike {
  start(options: {
    item: StockItem;
    negotiation: Negotiation;
    /** "the NES stall": who the player is haggling with. */
    stall: string;
    /** The panel closed: how many insulting offers were made, and how it ended ('none': no offer made, nothing to settle). */
    onClose: (result: { insults: number; outcome: 'deal' | 'walk' | 'stopped' | 'none' }) => void;
  }): void;
}

/** The swap panel: pick a game from the collection to part-exchange for the copy in hand. */
export interface TradePanelLike extends ModalLike {
  start(options: {
    item: StockItem;
    stall: string;
    /** Makes the swap (`value`: what `mine` counts for); returns why it failed, or null once done. */
    onSwap: (mine: Game, value: number) => string | null;
  }): void;
}

/** The prizes taken home (the claw's plush goes straight in). */
export interface PrizesLike {
  add(id: string): void;
}

/** The medals per arcade machine: what a score earns that was not earned before (paid once). */
export interface MedalsLike {
  award(gameId: string, score: number): readonly { tier: string; reward: number }[];
}

/** The weekly league and the streak: every ticket play counts, the first of a day pays the streak; a finished week is announced once. */
export interface LeagueLike {
  record(tickets: number): { days: number; bonus: number };
  takeWeekResult(): { rank: number; tickets: number; won: boolean } | null;
}

/** The balance table (`?payout`): each real play's score, tickets and time. */
export interface PayoutStatsLike {
  record(gameId: string, score: number, tickets: number, seconds: number): void;
}

/** What changes at the arcade day by day: the challenge, the change machine. */
export interface ArcadeDailyLike {
  challenge(): { gameId: string; target: number; reward: number; done: boolean };
  claimChallenge(): boolean;
  readonly changeMachineWorks: boolean;
  claimChange(): number;
}

/** The teleport: where one can go from here, and going there. */
export interface TravelLike {
  choices(): { id: string; label: string }[];
  go(id: string): Promise<void>;
}

/** The "Where to?" panel a door opens. */
export interface TravelMenuLike {
  open(choices: { id: string; label: string }[]): void;
  close(): void;
  readonly isOpen: boolean;
  readonly events: { onPick?: (id: string) => void; onCancel?: () => void };
}

export interface SessionParts {
  player: FirstPersonController;
  inspector: Inspector;
  interactor: Interactor;
  overlay: Overlay;
  panel: GamePanel;
  videos: VideoProvider;

  // --- optional features (each is silently skipped when absent) -------------------------------
  toast?: Toast;
  search?: SearchBar;
  highlighter?: Highlighter;
  gameSource?: GameSource;
  shelving?: ShelvingLike;
  dayNight?: DayNightLike;
  collectionEditor?: ModalLike;
  cat?: CatLike;
  /** A night's sleep from the bed (fade, clock to the next morning, fade back): `game/Sleep`. */
  sleep?: SleepLike;
  /** Re-enters the room after a modal (the collection editor) released the pointer lock: `() => void lockFlow.enter()`. */
  enterRoom?: () => void;

  // --- the economy: going out, playing, buying ---------------------------------------------------
  wallet?: WalletLike;
  collection?: CollectionLike;
  prizes?: PrizesLike;
  arcadeDaily?: ArcadeDailyLike;
  /** The prize counter's panel (prizes for tickets, tickets for coins). */
  prizeCounter?: ModalLike;
  /** The big frame a web-page cabinet game plays in (LexiPunk): a modal the cabinet opens. */
  arcadeScreen?: ModalLike;
  medals?: MedalsLike;
  league?: LeagueLike;
  payoutStats?: PayoutStatsLike;
  travel?: TravelLike;
  travelMenu?: TravelMenuLike;
  catalogue?: ModalLike;
  market?: MarketLike;
  /** The WE BUY desk's panel. */
  sellDesk?: ModalLike;
  standing?: StandingLike;
  haggle?: HagglePanelLike;
  trade?: TradePanelLike;
  /** Whether a game bought now finds room on the shelves at home: a warning line, or null when it does. */
  shelfRoom?: () => string | null;
}
