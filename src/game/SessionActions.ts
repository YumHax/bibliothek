import type * as THREE from 'three';
import type { GameBox } from '@/world/GameBox';
import type { Seat } from '@/world/Seat';
import type { VideoScreen } from '@/world/screen';
import type { StockItem } from '@/economy/MarketStock';

/** What the player is doing right now; interactables read it to phrase labels and choose actions. */
export interface PlayerState {
  readonly held: GameBox | null;
  readonly seated: boolean;
}

/** An arcade cabinet as the session drives it: park the player, start, abort. */
export interface ArcadeCabinetLike {
  readonly game: { readonly id: string; readonly title: string; readonly hint: string };
  readonly isPlaying: boolean;
  eyePose(): { position: THREE.Vector3; yaw: number };
  screenCentre(): THREE.Vector3;
  start(onOver: (score: number) => void): void;
  abort(): void;
}

/** A copy for sale on a stall: what it is, what it costs, and how to take it off the stall. */
export interface ForSaleLike {
  readonly item: StockItem;
  sold(): void;
}

/** The moves an interactable may ask the session to make on the player's behalf. */
export interface SessionActions extends PlayerState {
  pickUp(box: GameBox): void;
  putBack(): void;
  sit(seat: Seat): void;
  stand(): void;
  /** Shows the game's longplay on `screen` (TV, projector…); any other screen that was on is switched off. */
  playOn(screen: VideoScreen, box: GameBox): Promise<void>;
  stopScreen(screen: VideoScreen): void;
  hint(message: string): void;
  /** A door that leads elsewhere was clicked: offer the destinations and teleport. */
  travel(): void;
  /** Insert a coin and play (or walk away from the cabinet being played). */
  playArcade(cabinet: ArcadeCabinetLike): void;
  /** Turn the tickets in the wallet into coins at the prize counter. */
  redeemTickets(): void;
  /** Buy a copy off a market stall. */
  buy(item: ForSaleLike): void;
  /** Open the mail-order catalogue. */
  openCatalogue(): void;
}
