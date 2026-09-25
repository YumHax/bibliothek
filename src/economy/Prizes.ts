import { KEYS, PersistedStore, safeStorage } from '@/persistence';
import { PRIZE_TICKETS } from './pricing';

export const PRIZES_STORAGE_KEY = KEYS.prizes;

/** What a prize looks like on the shelf at home; `world/prizes/prizeModel.ts` builds one per kind. */
export type PrizeKind =
  | 'keyring' | 'ball' | 'duck' | 'yoyo' | 'bear' | 'cat' | 'rocket' | 'lavaLamp' | 'trophy' | 'miniCabinet' | 'plush'
  | 'catToy' | 'poster' | 'moodLamp' | 'pennant' | 'mystery';

/**
 * Where a prize that does something lives at home, instead of on the prize shelf: the cat's toy on
 * the collection room's floor, the poster on the bedroom wall, the mood lamp on the bedroom's
 * dresser (see `world/prizes/HomePrizes`).
 */
export type PrizeHome = 'catToy' | 'poster' | 'moodLamp';

export interface Prize {
  id: string;
  name: string;
  kind: PrizeKind;
  /** Tickets at the prize counter; null for what only the claw hands out. */
  tickets: number | null;
  /** Main colour of the model. */
  color: number;
  /** One line for the counter's list. */
  blurb: string;
  /** A prize that does something at home stands there, not on the shelf. */
  home?: PrizeHome;
  /** Not a thing for the shelf at all: a random game for the collection (the counter hands it over itself). */
  game?: true;
}

/** Everything the counter sells, cheapest first, and the claw machine's plush (not for sale). */
export const PRIZES: readonly Prize[] = [
  { id: 'keyring', name: 'Joystick keyring', kind: 'keyring', tickets: PRIZE_TICKETS.keyring, color: 0xd23a3a, blurb: 'A tiny red-ball joystick on a ring.' },
  { id: 'ball', name: 'Bouncy ball', kind: 'ball', tickets: PRIZE_TICKETS.ball, color: 0x33e0ff, blurb: 'Glitter inside. Bounces higher than it should.' },
  { id: 'yoyo', name: 'Neon yo-yo', kind: 'yoyo', tickets: PRIZE_TICKETS.yoyo, color: 0x4dff7a, blurb: 'Glows a little in the dark.' },
  { id: 'duck', name: 'Rubber duck', kind: 'duck', tickets: PRIZE_TICKETS.duck, color: 0xffd23a, blurb: 'Squeaks. Wears sunglasses.' },
  { id: 'bear', name: 'Plush bear', kind: 'bear', tickets: PRIZE_TICKETS.bear, color: 0xb07a4a, blurb: 'The one from the glass case.' },
  { id: 'cat', name: 'Plush cat', kind: 'cat', tickets: PRIZE_TICKETS.cat, color: 0x8a8f99, blurb: 'Grey, smug, a lot like someone at home.' },
  { id: 'rocket', name: 'Tin rocket', kind: 'rocket', tickets: PRIZE_TICKETS.rocket, color: 0xc8443a, blurb: 'Wind-up. The key is stiff.' },
  { id: 'lavaLamp', name: 'Lava lamp', kind: 'lavaLamp', tickets: PRIZE_TICKETS.lavaLamp, color: 0xff2fa0, blurb: 'Magenta wax, takes an hour to get going.' },
  { id: 'trophy', name: 'Champion trophy', kind: 'trophy', tickets: PRIZE_TICKETS.trophy, color: 0xd4a52a, blurb: 'Gold-effect plastic. ARCADE CHAMPION on the base.' },
  { id: 'miniCabinet', name: 'Mini cabinet', kind: 'miniCabinet', tickets: PRIZE_TICKETS.miniCabinet, color: 0x2f4f8f, blurb: 'A cabinet the size of a shoebox. The screen lights up.' },
  { id: 'catToy', name: 'Feather wand', kind: 'catToy', tickets: PRIZE_TICKETS.catToy, color: 0x33e0ff, blurb: 'For someone at home. It lies by the armchairs; watch who comes to play.', home: 'catToy' },
  { id: 'poster', name: 'Arcade poster', kind: 'poster', tickets: PRIZE_TICKETS.poster, color: 0xff2fa0, blurb: 'NEON SHERIFF, rolled up. It goes on the bedroom wall.', home: 'poster' },
  { id: 'moodLamp', name: 'Neon mood lamp', kind: 'moodLamp', tickets: PRIZE_TICKETS.moodLamp, color: 0xb05cff, blurb: 'Stands on the bedroom dresser. Click it to change the colour.', home: 'moodLamp' },
  { id: 'mysteryGame', name: 'Mystery game', kind: 'mystery', tickets: PRIZE_TICKETS.mysteryGame, color: 0xffd23a, blurb: 'A wrapped cartridge: a random game for the collection. It comes home in the parcel.', game: true },
  { id: 'pennant', name: 'League pennant', kind: 'pennant', tickets: null, color: 0x33e0ff, blurb: 'First in the weekly league. Not for sale, obviously.' },
  { id: 'saturdayCup', name: 'Saturday cup', kind: 'trophy', tickets: null, color: 0xc9d2dc, blurb: 'Won the Saturday tournament. Real pewter, or near enough.' },
  { id: 'plush-pink', name: 'Claw bunny (pink)', kind: 'plush', tickets: null, color: 0xffb3c6, blurb: 'Won at the claw. Nobody will believe you.' },
  { id: 'plush-blue', name: 'Claw bunny (blue)', kind: 'plush', tickets: null, color: 0xa8d8ff, blurb: 'Won at the claw. Nobody will believe you.' },
  { id: 'plush-yellow', name: 'Claw bunny (yellow)', kind: 'plush', tickets: null, color: 0xfff1a8, blurb: 'Won at the claw. Nobody will believe you.' },
  { id: 'plush-green', name: 'Claw bunny (green)', kind: 'plush', tickets: null, color: 0xc8f7c5, blurb: 'Won at the claw. Nobody will believe you.' },
  { id: 'plush-lilac', name: 'Claw bunny (lilac)', kind: 'plush', tickets: null, color: 0xe0c3ff, blurb: 'Won at the claw. Nobody will believe you.' },
  { id: 'plush-peach', name: 'Claw bunny (peach)', kind: 'plush', tickets: null, color: 0xffd6a8, blurb: 'Won at the claw. Nobody will believe you.' },
  { id: 'plush-white', name: 'Claw bunny (white)', kind: 'plush', tickets: null, color: 0xffffff, blurb: 'Won at the claw. Nobody will believe you.' },
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
    // Version 1: an array of `{ id, at }`.
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

  add(id: string): void {
    if (!getPrize(id) || getPrize(id)?.game) return;
    this.list = [...this.list, { id, at: new Date().toISOString() }];
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
  for (const p of data as { id?: unknown; at?: unknown }[]) {
    if (typeof p === 'object' && p !== null && typeof p.id === 'string' && getPrize(p.id)) owned.push({ id: p.id, at: typeof p.at === 'string' ? p.at : '' });
    else if (typeof p === 'object' && p !== null) aside.push(p);
  }
  return { owned, aside };
}
