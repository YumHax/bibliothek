import type { Showcases } from './showcase/Showcases';
import type { ShelfLabels } from './labels/ShelfLabels';
import type * as THREE from 'three';
import type { CssLayer } from '@/core/CssLayer';
import type { Input } from '@/core/Input';
import type { MarketStock } from '@/economy/MarketStock';
import type { MarketStanding } from '@/economy/MarketStanding';
import type { NoticeAd } from '@/economy/MarketNotices';
import type { ArcadeScores } from '@/economy/ArcadeScores';
import type { ArcadeDaily } from '@/economy/ArcadeDaily';
import type { PrizeStore } from '@/economy/Prizes';
import type { ArcadeMedals } from '@/economy/ArcadeMedals';
import type { ArcadeLeague } from '@/economy/ArcadeLeague';
import type { ArcadeTournament } from '@/economy/ArcadeTournament';
import type { Jackpot } from '@/economy/Jackpot';
import type { HomeUpgrades } from '@/economy/HomeUpgrades';
import type { GameSource } from '@/collection/GameSource';
import type { GameList } from '@/collection/GameList';
import type { BoxArtLoader } from '@/covers/BoxArtLoader';
import type { ModalLike } from '@/game/SessionParts';
import type { NoticeActions } from '@/notices';
import type { FootSurface } from '@/audio/footSurface';
import type { RemoteScreen } from './arcade/games';
import type { ReplayShelf } from './arcade/replay/ReplayStore';
import type { ParcelContents } from './props/Parcel';
import type { PlatformSelectHandler } from './props/Console';
import type { Sky } from './Sky';
import type { SoundOcclusion } from './acoustics/SoundOcclusion';
import type { Room } from './Room';
import type { Shelving } from './shelving/Shelving';
import type { StrayGames } from './strays/StrayGames';
import type { ShelfArrangement } from './shelving/arrangement';
import type { BoxPool } from './shelving/BoxPool';
import type { Furnishings } from '@/furnishing/Furnishings';
import type { CatPerch } from './cat/spots';
import type { WaterBowlLike } from './cat/types';
import type { CollectorHome } from './collector/furnishCollector';
import type { BuildingServices } from './stairwell/building';
import type { FirstDayLike } from '@/onboarding/FirstDay';
import type { HomeLife } from '@/household/HomeLife';
import type { Pastimes } from '@/household/pastime';
import type { GameBox } from './GameBox';
import type { Today } from '@/time/Today';
import type { MarketDay } from '@/economy/MarketDay';
import type { AuctionHouse } from '@/economy/AuctionHouse';
import type { SealedLots } from '@/economy/SealedLots';
import type { RivalCollector } from '@/economy/rivalCollector';
import type { Transactions } from '@/economy/Transactions';
import type { NewsPanel } from '@/ui/NewsPanel';
import type { ScratchCardPanel } from '@/ui/ScratchCardPanel';
import type { HomeShopPanel } from '@/ui/HomeShopPanel';
import type { ToDoNotePanel } from '@/ui/ToDoNotePanel';
import type { Classifieds } from '@/classifieds/Classifieds';
import type { Ad } from '@/classifieds/ads';
import type { SellerLot } from '@/classifieds/sellerLot';
import type { HomeConsole, Workshop } from '@/repair/Workshop';
import type { StoryChannels } from '@/story';

/*
 * What every zone builder is handed (`BuildContext`) and what it hands back (`ZoneHandle`). Kept
 * apart from `layout.ts` (which imports every builder) so the builders import these types without
 * importing each other through it.
 */

/** The collection and where its games are: on the shelves, in the parcel, lying about the flat, in the overflow. */
export interface CollectionContext {
  /** The collection; the consoles and the posters follow it live. */
  games: GameSource;
  /** Whether a copy of `id` is the player's (owned or lent; a wishlist entry is not). O(1): use it, never a scan of `games`. */
  owns(id: string): boolean;
  /** Whether `id` is on the wishlist. O(1). */
  isWanted(id: string): boolean;
  /** What the shelves show: the collection less what still waits in the parcel (`Deliveries.shelved`); `games` when absent. */
  shelved?: GameSource;
  /** The parcel in the hallway: games bought while out, waiting to be unpacked. */
  deliveries?: ParcelContents;
  /** Where the collection room's shelving writes the games it has no room for; the bedroom's bought bookcases show them. */
  overflow?: GameList;
  /** The games left lying about the flat (the kitchen table, a nightstand); the shelves read `shelved` through it. */
  strays?: StrayGames;
  /** The sort the flat's shelves stand in and the player's own arrangement of the boxes (moved by hand). */
  arrangement?: ShelfArrangement;
  /** The flat's shelf boxes, shared by its shelvings (a game passing from one room's shelves to the other keeps its box). */
  boxes?: BoxPool;
  /** The flat's displays (the display case, the pedestal): what is on show, off its shelf; the shelves read `shelved` through it. */
  showcases?: Showcases;
}

/** The flat's own: what was bought for it, what its furniture reports or asks for. */
export interface HomeContext {
  /** Furniture bought for the flat (the bedroom's bookcases, the market's home goods). */
  upgrades?: HomeUpgrades;
  /** What the player may move about the flat (M): builders register the bought pieces they place. */
  furnishings?: Furnishings;
  /** The labels stuck on the shelves' edges (the label maker): every shelving's bookcases wear theirs (`labelledBookcases`). */
  shelfLabels?: ShelfLabels;
  /** Clicking a console on the TV stand reports its platform. */
  onSelectPlatform?: PlatformSelectHandler;
  /** Calls the cat over (the feather wand won at the arcade), and says how that went. */
  callCat?: () => string;
  /** The collector's book on the sideboard, and what its milestones bring home (the plaque, the display cabinet). */
  collector?: CollectorHome;
  /** The guided first day: the to-do card on the hall console and "KEYS!" on the front door (none: no notes). */
  firstDay?: FirstDayLike;
  /** The journal's panel, opened by the notebook on the hall console. */
  journalPanel?: ModalLike;
  /** What the kitchen, the bathroom and the bedroom are for (docs/household.md); none: they stay as they were. */
  household?: HouseholdContext;
}

/** What the flat's rooms are for (`src/household/`): the rules their furniture calls, the panels it opens, what it tells the player. */
export interface HouseholdContext {
  life: HomeLife;
  /** The phone's panel (the stallholders, the friends), opened by the phone on the nightstand. */
  phone: ModalLike;
  /** The wardrobe's panel: what to wear. */
  wardrobe: ModalLike;
  /** What came of it, told to the player (`tellOutcome`), and the radio's chronicle. */
  notices: NoticeActions;
  /** The cat's name, for what it left by its bowl. */
  catName(): string;
  /** The treat jar shaken: whether the cat comes (the day's treat is spent only then), and how that went. */
  callCat?: () => { came: boolean; line: string };
  /** The long jobs (cleaning a box, a sticker, the cake, a soak) told in a fade to black, the clock wound on (`household/pastime.ts`). */
  pastimes?: Pastimes;
  /** The shelf's own box of a game (rebuilt after a change to the copy): the one put back in the hand after a job on it. */
  boxOf?: (gameId: string) => GameBox | undefined;
}

/** The player's money, as the builders see it. */
export interface MoneyContext {
  /** The player's coins: the market's price tags read as affordable or not. */
  wallet: { readonly coins: number; readonly tickets: number; addTickets(tickets: number): void; subscribe(cb: () => void): () => void };
  /** The same coins, to spend and to pocket out in the street (a scratch card's winnings, a coin found on the pavement). */
  purse?: { readonly coins: number; spend(coins: number): boolean; earnCoins(coins: number): void };
}

/** The arcade's stores: its tables, its day, its medals and league, the prizes taken home. */
export interface ArcadeContext {
  /** The arcade's hall of fame: the cabinets' attract screens, the board, the initials. */
  scores: ArcadeScores;
  /** The arcade's day: the challenge, whether the change machine works. */
  daily?: ArcadeDaily;
  /** The prizes taken home from the arcade (the bedroom's prize shelf shows them, the feather wand is one). */
  prizes?: PrizeStore;
  /** The medals per arcade machine: lamps on the cabinets, the next one on their attract screens. */
  medals?: ArcadeMedals;
  /** The arcade's weekly league and the player's streak (the league board). */
  league?: ArcadeLeague;
  /** The big frame a web-page cabinet game (LexiPunk) is played in. */
  screen?: RemoteScreen;
  /** The Saturday tournament (the Session's arcade play settles its rounds). Absent: the hall's own, made once (`arcade/hallStores`). */
  tournament?: ArcadeTournament;
  /** The ticket wheel's progressive pot. Absent: the hall's own, made once. */
  jackpot?: Jackpot;
  /** The player's best run per cabinet game (the attract screens replay them). Absent: the hall's own, made once. */
  replays?: ReplayShelf;
}

/** What the market's hall needs beyond the shared services: the panels it opens, and how the market knows the player. */
export interface MarketHallServices {
  standing: MarketStanding;
  /** The notice board's panel; `cards()` gives today's cards for the board's face. */
  notices: ModalLike & { cards(): Promise<NoticeAd[]> };
  /** The job lot's panel; `sign()` is what the crate's card says; `onBought` is set by the hall. */
  lot: ModalLike & { sign(): Promise<string>; onBought?: () => void };
}

/** The flea market: the day's stock and the hall's own services. */
export interface MarketContext {
  /** What the flea market has on its stalls today (also the retro shop's window, the street's talk). */
  stock: MarketStock;
  /** What kind of market day it is: the theme, the events, the talk of the days ahead. */
  day: MarketDay;
  /** The panels its hall opens (notice board, job lot), how the market knows the player. */
  hall?: MarketHallServices;
  /** The saleroom, the sealed cartons and the rival collector (docs/economy.md "The saleroom"); none: none of them. */
  lots?: LotServices;
}

/** What the saleroom, the sealed cartons and the rival collector run on. */
export interface LotServices {
  /** The sale days, their lots, how each went. */
  auction: AuctionHouse;
  /** Cartons bought, waiting at home; the market's carton of the day. */
  sealed: SealedLots;
  /** The rival collector's side of the story (the street's trader, the hall, the saleroom). */
  rival: RivalCollector;
  /** The money side: the hammer, a carton bought, a thing out of a carton. */
  tx: Transactions;
}

/**
 * The DOM panels world things open (made once in `bootstrap/ui`, so no builder builds DOM): the
 * newsstand's paper, the tabac's scratch card, the counter of the shops that sell for the flat, the
 * first day's to-do list.
 */
export interface WorldPanels {
  news: NewsPanel;
  scratch: ScratchCardPanel;
  homeShop: HomeShopPanel;
  toDo?: ToDoNotePanel;
  /** The residents' table at the neighbours' party in the courtyard: they buy games off the player (`building/neighboursParty`). */
  partySale?: ModalLike;
}

/** The shared services every zone builder may draw on; `src/bootstrap/world.ts` assembles it once. */
export interface BuildContext {
  cssLayer: CssLayer;
  /** Object whose distance to a screen drives its volume (the camera). */
  listener: THREE.Object3D;
  /** Counts the walls between the listener and a screen, so a longplay is muffled from the next room. */
  acoustics: SoundOcclusion;
  /** The keys, read directly by the arcade cabinets while a game runs. */
  input: Input;
  /** The one sky: clock + view outside the windows. */
  sky: Sky;
  /** The one "today": the game day and the real date (see `time/Today`). */
  today: Today;
  /** The DOM panels world things open. */
  panels: WorldPanels;
  covers: BoxArtLoader;
  collection: CollectionContext;
  home: HomeContext;
  money: MoneyContext;
  arcade: ArcadeContext;
  market: MarketContext;
  /** The building's life the hallway and the stairs share: the doorstep, the post, the neighbours' swaps (`stairwell/building.ts`). */
  building?: BuildingServices;
  /** The lost prototype's trail (`src/story`): the mail, the stallholders, the radio, the arcade's counter, the collector and the friends ask it first. */
  story?: StoryChannels;
  /** The paper's small ads, the sellers' flats and the consoles mended at home (`src/classifieds`, `src/repair`). */
  classifieds?: ClassifiedsContext;
}

/** The small ads and the consoles (docs/economy.md "Small ads and the seller's flat", docs/household.md "Repairing a console"). */
export interface ClassifiedsContext {
  /** The ads, the visit booked or under way, what was bought from whom. */
  book: Classifieds;
  /** What an ad's seller has out (drawn once per ad). */
  lot(ad: Ad): Promise<SellerLot>;
  /** The consoles bought broken, mended or not. */
  workshop: Workshop;
  /** The kitchen table's repair, for one console (`ui/repair/RepairPanel`). */
  repairPanel: ModalLike & { prepare(console: HomeConsole): void };
  /** TV REPAIR's counter: working consoles bought back. */
  consoleDesk: ModalLike;
}

/** What every zone builder returns: its `Room`, or for a zone without one (the street) how lit it is. */
export interface ZoneHandle {
  room?: Room;
  /** How lit the zone is, 0 dark .. 1 full day (reflections and haze follow it); a `Room` says it itself. */
  lightLevel?: () => number;
  /** The zone's shelves of the collection (the collection room's, the bedroom's bought bookcases): searched and sorted as one. */
  shelving?: Shelving | null;
  /** Floor points (world) the cat comes to have a look at when it wanders out of the collection room. */
  catVisits?: THREE.Vector3[];
  /** Places in the room the cat naps on (a radiator's cradle, the dry bath); see `CatPerch`. */
  catPerches?: CatPerch[];
  /** Water bowls of the cat's put down in the room. */
  catWaters?: WaterBowlLike[];
  /** What is underfoot at a zone-local point, for the footsteps (a zone without it: its room's floor finish). */
  surfaceAt?: (local: THREE.Vector3) => FootSurface;
}
