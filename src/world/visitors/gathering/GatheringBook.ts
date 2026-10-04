import { KEYS, PersistedStore, safeStorage } from '@/persistence';
import { GATHERING_RULES } from './gatheringPlan';

/** A games night's photo on the string by the window: the day, who came, the last match's score. */
export interface NightPhoto {
  day: number;
  names: string[];
  score: string;
}

/** What the paper prints the day after an open house. */
interface OpenHouseAccount {
  day: number;
  guests: number;
  coins: number;
  /** The most valuable copy on the shelves that day, as the guests saw it. */
  best: string | null;
  /** A couple of things guests said. */
  quotes: string[];
  printed: boolean;
}

interface BookState {
  /** A games night asked for on the phone: the in-game day and the hour they come. */
  night: { day: number; hour: number } | null;
  /** The in-game day of the last games night held (somebody came in). */
  lastNight: number;
  /** An open house announced: its in-game day. */
  house: { day: number } | null;
  lastHouse: number;
  article: OpenHouseAccount | null;
  photos: NightPhoto[];
}

const fresh = (): BookState => ({ night: null, lastNight: -99, house: null, lastHouse: -99, article: null, photos: [] });

/**
 * The flat's book of gatherings (`KEYS.gatherings`): the games night asked for and the last one held, the open house
 * announced and the paper's account of the last one, the evenings' photos. New game wipes it with the rest of the save.
 */
export class GatheringBook {
  private state: BookState;
  private readonly store: PersistedStore<BookState>;

  constructor(storage: Storage | null = safeStorage()) {
    this.store = new PersistedStore<BookState>({ key: KEYS.gatherings, version: 1, storage, defaults: fresh, read: readBook });
    this.state = this.store.load();
  }

  get photos(): readonly NightPhoto[] {
    return this.state.photos;
  }

  get article(): OpenHouseAccount | null {
    return this.state.article;
  }

  /** The games night planned for `day`, if any. */
  nightOn(day: number): { day: number; hour: number } | null {
    const night = this.state.night;
    return night && night.day === day ? night : null;
  }

  /** The open house announced for `day` or later, if any. */
  get house(): { day: number } | null {
    return this.state.house;
  }

  /** Why no games night can be asked for on `day`, or null. */
  nightRefusal(day: number): string | null {
    if (this.state.night?.day === day) return 'Everyone is coming round tonight already.';
    if (day - this.state.lastNight < GATHERING_RULES.gamesNight.everyDays) return 'You had everyone round only the other day. Give it a few days.';
    if (this.state.house?.day === day) return 'Not tonight: it is your open house today.';
    return null;
  }

  planNight(day: number, hour: number): void {
    this.state.night = { day, hour };
    this.save();
  }

  /** The games night happened (or its day is gone). */
  heldNight(day: number, held: boolean): void {
    if (this.state.night?.day === day) this.state.night = null;
    if (held) this.state.lastNight = day;
    this.save();
  }

  /** Why no open house can be announced on `day` (with `games` in the collection), or null. */
  houseRefusal(day: number, games: number): string | null {
    const { minGames, everyDays } = GATHERING_RULES.openHouse;
    if (games < minGames) return `The paper only takes collections of ${minGames} games or more. You have ${games}.`;
    if (this.state.house && this.state.house.day >= day) return 'Your open house is announced already.';
    if (day - this.state.lastHouse < everyDays) return 'The paper ran your open house only last week. Another time.';
    return null;
  }

  announceHouse(day: number): void {
    this.state.house = { day };
    this.save();
  }

  /** The open house of `account.day` is over: its account waits for the paper (none if nobody came). */
  heldHouse(account: Omit<OpenHouseAccount, 'printed'> | null, day: number): void {
    if (this.state.house?.day === day) this.state.house = null;
    if (account) {
      this.state.lastHouse = day;
      this.state.article = { ...account, printed: false };
    }
    this.save();
  }

  /** The paper's article was read. */
  printed(): void {
    if (!this.state.article) return;
    this.state.article = { ...this.state.article, printed: true };
    this.save();
  }

  addPhoto(photo: NightPhoto): void {
    this.state.photos = [...this.state.photos, photo].slice(-GATHERING_RULES.gamesNight.photos);
    this.save();
  }

  /** Plans whose day went by without them (the player was out all day): dropped, no harm done. */
  tidy(day: number): void {
    let changed = false;
    if (this.state.night && this.state.night.day < day) {
      this.state.night = null;
      changed = true;
    }
    if (this.state.house && this.state.house.day < day) {
      this.state.house = null;
      changed = true;
    }
    if (changed) this.save();
  }

  private save(): void {
    this.store.save(this.state);
  }
}

const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

function readBook(data: unknown): BookState | null {
  const raw = data as Partial<Record<keyof BookState, unknown>> | null;
  if (typeof raw !== 'object' || raw === null) return null;
  const night = raw.night as { day?: unknown; hour?: unknown } | null | undefined;
  const house = raw.house as { day?: unknown } | null | undefined;
  const a = raw.article as Partial<Record<keyof OpenHouseAccount, unknown>> | null | undefined;
  const article: OpenHouseAccount | null = a && typeof a.day === 'number'
    ? {
        day: a.day,
        guests: num(a.guests, 0),
        coins: num(a.coins, 0),
        best: typeof a.best === 'string' ? a.best : null,
        quotes: Array.isArray(a.quotes) ? a.quotes.filter((q): q is string => typeof q === 'string').slice(0, 3) : [],
        printed: a.printed === true,
      }
    : null;
  const photos = (Array.isArray(raw.photos) ? raw.photos : [])
    .filter((p): p is NightPhoto => typeof p === 'object' && p !== null && typeof (p as NightPhoto).day === 'number' && Array.isArray((p as NightPhoto).names))
    .map((p) => ({ day: p.day, names: p.names.filter((n): n is string => typeof n === 'string'), score: typeof p.score === 'string' ? p.score : '' }));
  return {
    night: night && typeof night.day === 'number' && typeof night.hour === 'number' ? { day: night.day, hour: night.hour } : null,
    lastNight: num(raw.lastNight, -99),
    house: house && typeof house.day === 'number' ? { day: house.day } : null,
    lastHouse: num(raw.lastHouse, -99),
    article,
    photos,
  };
}
