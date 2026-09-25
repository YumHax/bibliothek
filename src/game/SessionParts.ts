import type { FirstPersonController } from '@/player/FirstPersonController';
import type { Inspector } from '@/interaction/Inspector';
import type { Interactor } from '@/interaction/Interactor';
import type { Overlay } from '@/ui/Overlay';
import type { GamePanel } from '@/ui/GamePanel';
import type { Toast } from '@/ui/Toast';
import type { Game, PlatformId } from '@/catalog/types';
import type { GameBox } from '@/world/GameBox';
import type { ZoneId } from '@/world/zoneIds';
import type { Seat } from '@/world/Seat';
import type { SortMode } from '@/world/shelving/sort';
import type { StockItem } from '@/economy/StockItem';
import type { Negotiation } from '@/economy/haggle';
import type { ModalParts } from './ModalStack';
import type { HandsParts } from './Hands';
import type { SeatingParts } from './Seating';
import type { ScreenParts } from './Screens';
import type { TravelParts } from './GoingOut';
import type { ArcadeParts } from './ArcadePlay';
import type { MarketCounterParts } from './MarketCounter';
import type { PurchaseParts } from './Purchases';
import type { BrowseParts } from './Browse';
import type { CatParts } from './CatCare';
import type { PhotoParts } from './PhotoControl';

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
 * mail-order catalogue; `ui/ModalPanel`). The session subscribes through `addOpenListener` (or,
 * failing it, assigns `onOpenChange`) so that closing the panel from its own UI (close button, Esc)
 * also re-enters the room.
 */
export interface ModalLike {
  toggle(): unknown;
  close(): unknown;
  readonly isOpen: boolean;
  onOpenChange?: (open: boolean) => void;
  addOpenListener?(listener: (open: boolean) => void): () => void;
  /** Works on the box in hand (haggle, swap): it stays in hand while the panel has the mouse. */
  readonly keepsHeld?: boolean;
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
  choices(): { id: ZoneId; label: string }[];
  go(id: ZoneId): Promise<void>;
}

/** The "Where to?" panel a door opens: it hands back the id of the choice picked. */
export interface TravelMenuLike {
  open(choices: { id: ZoneId; label: string }[]): void;
  close(): void;
  readonly isOpen: boolean;
  onPick(listener: (id: ZoneId) => void): () => void;
  onCancel(listener: () => void): () => void;
}

/** What every controller may be handed: the player, the hands, the crosshair, the HUD. */
export interface CoreParts {
  player: FirstPersonController;
  inspector: Inspector<GameBox>;
  interactor: Interactor;
  overlay: Overlay;
  panel: GamePanel;
  /** The toast; without it, messages go to the hint line. */
  toast?: Toast;
}

/**
 * Everything `main.ts` hands the Session: the core, and each controller's own parts (declared
 * next to the controller). A new controller adds its parts interface here, once. Every optional
 * part is silently skipped when absent.
 */
export interface SessionParts
  extends CoreParts, ModalParts, HandsParts, SeatingParts, ScreenParts, TravelParts, ArcadeParts, MarketCounterParts, PurchaseParts, BrowseParts, CatParts, PhotoParts {}
