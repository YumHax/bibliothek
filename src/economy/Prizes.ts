import { KEYS, PersistedStore, safeStorage } from '@/persistence';
import { PRIZE_SET_TICKETS, PRIZE_TICKETS } from './pricing';

const PRIZES_STORAGE_KEY = KEYS.prizes;

/** What a prize looks like on the shelf at home; `world/prizes/prizeModel.ts` builds one per kind. */
export type PrizeKind =
  | 'keyring' | 'ball' | 'duck' | 'yoyo' | 'bear' | 'cat' | 'rocket' | 'lavaLamp' | 'trophy' | 'miniCabinet' | 'plush'
  | 'catToy' | 'poster' | 'moodLamp' | 'pennant' | 'mystery'
  // The back room's: the limited editions, the rare cartridge, the sponsor's plate, a retired cabinet.
  | 'token' | 'snowGlobe' | 'joystick' | 'lightBox' | 'cassette' | 'pixelPlush' | 'cart' | 'plate' | 'cabinet';

/**
 * Where a prize that does something lives at home, instead of loose on the prize shelf (`world/prizes`): the cat's
 * wand on the projector rug, the poster on the bedroom wall, the mood lamp on the dresser, the duck in the bath, the
 * bouncy ball on the living-room floor (thrown for the cat), the plush on the bed, the rocket hung over it, the yo-yo
 * and the keyring hung under the prize shelf, and the trophy row along its top board (the cups, the pennants on the
 * wall above, the lava lamp lighting them, the mini cabinet, the limited editions). One of each: a prize with a home
 * is sold once.
 */
export type PrizeHome = 'catToy' | 'poster' | 'moodLamp' | 'bath' | 'bounce' | 'bed' | 'mobile' | 'hangs' | 'trophies';

/**
 * The counter's back room, for when the flat is done (docs/economy.md "Prizes"): this week's limited edition, a rare
 * cartridge, a brass plate with the player's initials on a cabinet of their choice, and the hall's retired cabinet of
 * the week, for the flat.
 */
type PrizeSpecial = 'limited' | 'rare' | 'sponsor' | 'cabinet';

export interface Prize {
  id: string;
  name: string;
  kind: PrizeKind;
  /** Tickets at the prize counter; null for what only the claw, the league or the tournament hands out. */
  tickets: number | null;
  /** Main colour of the model. */
  color: number;
  /** One line for the counter's list. */
  blurb: string;
  /** A prize that does something at home stands there, not loose on the shelf; there is one of it. */
  home?: PrizeHome;
  /** Not a thing for the shelf at all: a game for the collection (the counter hands it over itself). */
  game?: true;
  /** Sold in the counter's back room (not in the glass case nor on the pegboard). */
  special?: PrizeSpecial;
}

/** The claw's bunnies by colour: what the heap in its case is drawn from. */
const BUNNIES: readonly [string, number][] = [
  ['pink', 0xffb3c6], ['blue', 0xa8d8ff], ['yellow', 0xfff1a8], ['green', 0xc8f7c5], ['lilac', 0xe0c3ff], ['peach', 0xffd6a8], ['white', 0xffffff],
];

/** Everything the counter sells, cheapest first, the back room's, then what is won (the claw's plush, the league's pennant, the cup). */
export const PRIZES: readonly Prize[] = [
  { id: 'keyring', name: 'Joystick keyring', kind: 'keyring', tickets: PRIZE_TICKETS.keyring, color: 0xd23a3a, blurb: 'A tiny red-ball joystick on a ring. It hangs under the prize shelf.', home: 'hangs' },
  { id: 'ball', name: 'Bouncy ball', kind: 'ball', tickets: PRIZE_TICKETS.ball, color: 0x33e0ff, blurb: 'Glitter inside. Bounces higher than it should, and the cat knows it.', home: 'bounce' },
  { id: 'yoyo', name: 'Neon yo-yo', kind: 'yoyo', tickets: PRIZE_TICKETS.yoyo, color: 0x4dff7a, blurb: 'Glows a little in the dark. It hangs under the prize shelf, ready to throw.', home: 'hangs' },
  { id: 'duck', name: 'Rubber duck', kind: 'duck', tickets: PRIZE_TICKETS.duck, color: 0xffd23a, blurb: 'Squeaks. Wears sunglasses. Lives on the edge of the bath.', home: 'bath' },
  { id: 'bear', name: 'Plush bear', kind: 'bear', tickets: PRIZE_TICKETS.bear, color: 0xb07a4a, blurb: 'The one from the glass case. It sits on the bed.', home: 'bed' },
  { id: 'cat', name: 'Plush cat', kind: 'cat', tickets: PRIZE_TICKETS.cat, color: 0x8a8f99, blurb: 'Grey, smug, a lot like someone at home. It sits on the bed.', home: 'bed' },
  { id: 'rocket', name: 'Tin rocket', kind: 'rocket', tickets: PRIZE_TICKETS.rocket, color: 0xc8443a, blurb: 'Wind-up. The key is stiff. It hangs over the bed and turns.', home: 'mobile' },
  { id: 'lavaLamp', name: 'Lava lamp', kind: 'lavaLamp', tickets: PRIZE_TICKETS.lavaLamp, color: 0xff2fa0, blurb: 'Magenta wax, takes an hour to get going. It lights the trophies.', home: 'trophies' },
  { id: 'trophy', name: 'Champion trophy', kind: 'trophy', tickets: PRIZE_TICKETS.trophy, color: 0xd4a52a, blurb: 'Gold-effect plastic. ARCADE CHAMPION on the base.', home: 'trophies' },
  { id: 'miniCabinet', name: 'Mini cabinet', kind: 'miniCabinet', tickets: PRIZE_TICKETS.miniCabinet, color: 0x2f4f8f, blurb: 'A cabinet the size of a shoebox. The screen lights up.', home: 'trophies' },
  { id: 'catToy', name: 'Feather wand', kind: 'catToy', tickets: PRIZE_TICKETS.catToy, color: 0x33e0ff, blurb: 'For someone at home. It lies by the armchairs; watch who comes to play.', home: 'catToy' },
  { id: 'poster', name: 'Arcade poster', kind: 'poster', tickets: PRIZE_TICKETS.poster, color: 0xff2fa0, blurb: 'NEON SHERIFF, rolled up. It goes on the bedroom wall.', home: 'poster' },
  { id: 'moodLamp', name: 'Neon mood lamp', kind: 'moodLamp', tickets: PRIZE_TICKETS.moodLamp, color: 0xb05cff, blurb: 'Stands on the bedroom dresser. Click it to change the colour.', home: 'moodLamp' },
  { id: 'mysteryGame', name: 'Mystery game', kind: 'mystery', tickets: PRIZE_TICKETS.mysteryGame, color: 0xffd23a, blurb: 'A wrapped cartridge: a random game for the collection. It comes home in the parcel.', game: true },
  // The back room's limited editions, one a week (`limitedOnOffer`), each sold once.
  { id: 'goldToken', name: 'Golden token', kind: 'token', tickets: PRIZE_TICKETS.goldToken, color: 0xe8c04a, blurb: 'The hall’s first token, struck in brass and gilded. Gus had a dozen made.', home: 'trophies', special: 'limited' },
  { id: 'snowGlobe', name: 'Arcade snow globe', kind: 'snowGlobe', tickets: PRIZE_TICKETS.snowGlobe, color: 0x33e0ff, blurb: 'The hall in miniature, neon and all. Shake it and it snows confetti.', home: 'trophies', special: 'limited' },
  { id: 'goldStick', name: 'Gold joystick', kind: 'joystick', tickets: PRIZE_TICKETS.goldStick, color: 0xd4a52a, blurb: 'A real stick off a real panel, chromed gold, on a walnut base.', home: 'trophies', special: 'limited' },
  { id: 'lightBox', name: 'Marquee light box', kind: 'lightBox', tickets: PRIZE_TICKETS.lightBox, color: 0xff2fa0, blurb: 'A cabinet marquee in a box frame, lit from behind. INSERT COIN.', home: 'trophies', special: 'limited' },
  { id: 'jukeboxTape', name: 'Jukebox tape', kind: 'cassette', tickets: PRIZE_TICKETS.jukeboxTape, color: 0xb05cff, blurb: 'The jukebox’s four stations, dubbed onto one cassette. Side B is all italo.', home: 'trophies', special: 'limited' },
  { id: 'pixelPal', name: 'Pixel pal', kind: 'pixelPlush', tickets: PRIZE_TICKETS.pixelPal, color: 0x4dff7a, blurb: 'STAR RAID’s little alien as a cube of felt. Only twenty were sewn.', home: 'trophies', special: 'limited' },
  // The rest of the back room.
  { id: 'rareGame', name: 'Rare cartridge', kind: 'cart', tickets: PRIZE_TICKETS.rareGame, color: 0xd4a52a, blurb: 'From Gus’s own shelf: a sought-after game the collection lacks. It comes home in the parcel.', game: true, special: 'rare' },
  { id: 'sponsor', name: 'Sponsor’s plate', kind: 'plate', tickets: PRIZE_TICKETS.sponsor, color: 0xc9a23a, blurb: 'A brass plate with your initials, screwed on the cabinet you choose. The whole hall reads it.', special: 'sponsor' },
  { id: 'hallCabinet', name: 'Retired cabinet', kind: 'cabinet', tickets: PRIZE_TICKETS.hallCabinet, color: 0x2f4f8f, blurb: 'The hall is replacing one of its uprights: take it home, its one game and all, to the living room corner.', home: 'trophies', special: 'cabinet' },
  { id: 'pennant', name: 'League pennant', kind: 'pennant', tickets: null, color: 0x33e0ff, blurb: 'First in the weekly league. Not for sale, obviously.', home: 'trophies' },
  { id: 'saturdayCup', name: 'Saturday cup', kind: 'trophy', tickets: null, color: 0xc9d2dc, blurb: 'Won the Saturday tournament. Real pewter, or near enough.', home: 'trophies' },
  // What the league's higher divisions, the bigger cups and the hall's tour bring home (`pricing.LEAGUE`, `TOURNAMENT.cups`, `HALL_TOUR`).
  { id: 'pennant-silver', name: 'Silver league pennant', kind: 'pennant', tickets: null, color: 0xd8dde6, blurb: 'First in the silver division. The regulars there do not lose often.', home: 'trophies' },
  { id: 'pennant-gold', name: 'Gold league pennant', kind: 'pennant', tickets: null, color: 0xffd23a, blurb: 'First in the gold division. Gus pinned a photo of it behind the counter.', home: 'trophies' },
  { id: 'saturdayCup-silver', name: 'Silver cup', kind: 'trophy', tickets: null, color: 0xe6ecf4, blurb: 'The Saturday tournament, played for silver. Heavier than it looks.', home: 'trophies' },
  { id: 'saturdayCup-gold', name: 'Gold cup', kind: 'trophy', tickets: null, color: 0xffd23a, blurb: 'The Saturday tournament, played for gold. Gold-effect, but the effect is very convincing.', home: 'trophies' },
  { id: 'hallTour', name: 'The hall’s tour', kind: 'trophy', tickets: null, color: 0xffe08a, blurb: 'Gold on every machine in the hall. Gus had it engraved with your initials.', home: 'trophies' },
  ...BUNNIES.map(([name, color]): Prize => ({ id: `plush-${name}`, name: `Claw bunny (${name})`, kind: 'plush', tickets: null, color, blurb: 'Won at the claw. Nobody will believe you.', home: 'bed' })),
];

/** The hall's cabinets that can stand in the flat once retired: those with nothing bolted on (no light gun, pad or web page). */
export const RETIRED_CABINETS = ['breakout', 'invaders', 'stacker', 'frog', 'snake', 'comets', 'duel'] as const;

/** The back room's limited editions, in the order the weeks bring them round. */
const LIMITED: readonly Prize[] = PRIZES.filter((p) => p.special === 'limited');

/** The week of a game day (the market calendar's): what the back room shows changes on it. */
function weekOf(day: number): number {
  return Math.max(0, Math.floor(day / 7));
}

/** This week's limited edition (game day `day`), the same all week: the next one round the next week. */
export function limitedOnOffer(day: number): Prize {
  return LIMITED[weekOf(day) % LIMITED.length]!;
}

/** The cabinet the hall retires this week (game day `day`): one of `RETIRED_CABINETS`, a different one each week. */
export function retiredOnOffer(day: number): string {
  return RETIRED_CABINETS[(weekOf(day) * 3) % RETIRED_CABINETS.length]!;
}

/** Whether a prize is sold once (it has a place at home, or it is a game): the counter greys it once owned. */
export function soldOnce(prize: Prize): boolean {
  return !!prize.home && prize.special !== 'sponsor';
}

/** A prize the trophy row shows (along the prize shelf's top board, the pennants on the wall above it). */
export function onTrophyRow(prize: Prize): boolean {
  return prize.home === 'trophies' && prize.special !== 'cabinet';
}

/** A set of prizes that, once all home, pays a bonus once (`PrizeSets`). */
export interface PrizeSet {
  id: string;
  name: string;
  ids: readonly string[];
  tickets: number;
}

/** The sets: every claw bunny (the rainbow on the bed), the whole counter's knick-knacks, every limited edition. */
export const PRIZE_SETS: readonly PrizeSet[] = [
  { id: 'bunnies', name: 'Every claw bunny', ids: PRIZES.filter((p) => p.kind === 'plush').map((p) => p.id), tickets: PRIZE_SET_TICKETS.bunnies },
  { id: 'counter', name: 'The whole glass case', ids: PRIZES.filter((p) => p.tickets !== null && !p.game && !p.special).map((p) => p.id), tickets: PRIZE_SET_TICKETS.counter },
  { id: 'limited', name: 'Every limited edition', ids: LIMITED.map((p) => p.id), tickets: PRIZE_SET_TICKETS.limited },
];

export function getPrize(id: string): Prize | undefined {
  return PRIZES.find((p) => p.id === id);
}

/** The claw's plush of a given colour (the heap in the case is drawn from these colours). */
export function clawPrizeFor(color: number): Prize | undefined {
  return PRIZES.find((p) => p.kind === 'plush' && p.color === color);
}

/** One prize taken home. */
export interface OwnedPrize {
  id: string;
  /** When it was won, ISO. */
  at: string;
  /** The game day it was taken (the market calendar's): the counter's case shows a gap there till the next one. */
  day?: number;
  /** The cabinet game it is for: the sponsor's plate's cabinet, the retired cabinet's game. */
  game?: string;
}

/**
 * The prizes the player has taken home, in the order they got them, persisted. The shelf at home
 * shows them; the counter buys them with tickets (`Wallet.spendTickets`), the claw hands out plush.
 */
export class PrizeStore {
  private list: OwnedPrize[];
  /** Saved prizes this build does not know: kept in storage, not shown. */
  private readonly aside: unknown[];
  private readonly listeners = new Set<() => void>();
  private readonly store: PersistedStore<SavedPrizes>;

  constructor(
    storage: Storage | null = safeStorage(),
    key: string = PRIZES_STORAGE_KEY,
  ) {
    // Version 1: an array of `{ id, at }` (`day` and `game` added since, optional: an older save reads as it was).
    this.store = new PersistedStore<SavedPrizes>({
      key, version: 1, storage, defaults: () => ({ owned: [], aside: [] }), read: readPrizes, write: (s) => [...s.owned, ...s.aside],
    });
    ({ owned: this.list, aside: this.aside } = this.store.load());
  }

  get owned(): readonly OwnedPrize[] {
    return this.list;
  }

  count(id: string): number {
    return this.list.filter((p) => p.id === id).length;
  }

  /** Whether at least one of `id` has been taken home. */
  owns(id: string): boolean {
    return this.list.some((p) => p.id === id);
  }

  /** The cabinet games the plate of `id` is on (the sponsor's plates) or that `id` runs (the retired cabinet), in the order taken. */
  gamesOf(id: string): string[] {
    return this.list.filter((p) => p.id === id && p.game).map((p) => p.game!);
  }

  /** Whether one of `id` was taken on game day `day` (the counter's case keeps the gap till the next). */
  takenOn(id: string, day: number): boolean {
    return this.list.some((p) => p.id === id && p.day === day);
  }

  add(id: string, extra: { day?: number; game?: string } = {}): void {
    if (!getPrize(id) || getPrize(id)?.game) return;
    const entry: OwnedPrize = { id, at: new Date().toISOString() };
    if (extra.day !== undefined) entry.day = extra.day;
    if (extra.game) entry.game = extra.game;
    this.list = [...this.list, entry];
    this.store.save({ owned: this.list, aside: this.aside });
    for (const cb of this.listeners) cb();
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
}

interface SavedPrizes {
  owned: OwnedPrize[];
  aside: unknown[];
}

/** The prizes saved; those this build does not know are kept aside. */
function readPrizes(data: unknown): SavedPrizes | null {
  if (!Array.isArray(data)) return null;
  const owned: OwnedPrize[] = [];
  const aside: unknown[] = [];
  for (const p of data as { id?: unknown; at?: unknown; day?: unknown; game?: unknown }[]) {
    if (typeof p === 'object' && p !== null && typeof p.id === 'string' && getPrize(p.id)) {
      const entry: OwnedPrize = { id: p.id, at: typeof p.at === 'string' ? p.at : '' };
      if (typeof p.day === 'number' && Number.isInteger(p.day)) entry.day = p.day;
      if (typeof p.game === 'string') entry.game = p.game;
      owned.push(entry);
    }
    else if (typeof p === 'object' && p !== null) aside.push(p);
  }
  return { owned, aside };
}
