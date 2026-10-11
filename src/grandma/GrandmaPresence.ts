import { KEYS, PersistedStore, safeStorage } from '@/persistence';
import { gameDayOf, type JournalDay, type JournalEntry } from '@/journal/Journal';
import { SUNDAY_WEEKDAY, weekdayOf } from '@/time/wakefulness';
import { GRANDMA_STORIES, type GrandmaStory } from './storyLines';
import type { HeardKind } from './presenceLines';

/*
 * MÉMÉ'S OWN MEMORY OF THE PLAYER (docs/grandma.md "Her presence"): the stories she has told, the news she has been
 * told (journal lines, each once), the day Gaspard last rang while the player was there, the last visit (a Sunday
 * missed in between), what she last asked after and when, the game she was last shown. Saved as
 * `bibliothek.grandmaPresence.v1`.
 */

/** The days back the news still counts as news. */
const NEWS_DAYS = 7;
/** Told lines kept (the oldest forgotten first: they are out of the news window long before). */
const TOLD_KEPT = 300;
/** Gaspard rings at most once in this many days while the player is there. */
const GASPARD_EVERY = 7;

/** What she can read of the player's life, live (`bootstrap/services`). */
interface PresenceWorld {
  /** The journal's days, newest first. */
  days(): readonly JournalDay[];
}

interface PresenceState {
  /** Stories told (`GRANDMA_STORIES` ids). */
  stories: string[];
  /** Journal lines told her, as `day-00012#3`. */
  told: string[];
  /** The game day Gaspard last rang while the player was at hers. */
  gaspard: number | null;
  /** The game day of the last visit (before this one, once `arrive` has run). */
  lastVisit: number | null;
  /** What she asked after (a topic), by the game day she last did. */
  asked: Record<string, number>;
  /** The title of the last game shown her. */
  shown: string | null;
  /** The game day of the last cup of tea with her. */
  tea: number | null;
}

/** A line of the journal she has not been told, and what it is to her. */
interface News {
  key: string;
  kind: HeardKind;
  /** The thing (a title, a prize) or the line itself. */
  x: string;
  /** Someone named in it. */
  who: string;
}

const fresh = (): PresenceState => ({ stories: [], told: [], gaspard: null, lastVisit: null, asked: {}, shown: null, tea: null });

export class GrandmaPresence {
  private state: PresenceState;
  private readonly store: PersistedStore<PresenceState>;

  constructor(private readonly world: PresenceWorld | null = null, storage: Storage | null = safeStorage()) {
    this.store = new PersistedStore<PresenceState>({ key: KEYS.grandmaPresence, version: 1, storage, defaults: fresh, read: readState });
    this.state = this.store.load();
  }

  /** The player came in on game day `day`: whether a Sunday went by without them since the last visit (none the first time). */
  arrive(day: number): { missedSunday: boolean } {
    const last = this.state.lastVisit;
    let missedSunday = false;
    if (last !== null && day > last + 1) {
      for (let d = last + 1; d < day && d <= last + 14; d++) if (weekdayOf(d) === SUNDAY_WEEKDAY) missedSunday = true;
    }
    if (last !== day) this.commit({ ...this.state, lastVisit: day });
    return { missedSunday };
  }

  /** The next story to tell: the first not told that the memories seen allow, else one told before (`again`). */
  nextStory(seen: (memory: string) => boolean, pick: (count: number) => number): { story: GrandmaStory; again: boolean } | null {
    const open = GRANDMA_STORIES.filter((s) => !s.after || seen(s.after));
    const fresh = open.find((s) => !this.state.stories.includes(s.id));
    if (fresh) return { story: fresh, again: false };
    const story = open[pick(open.length)];
    return story ? { story, again: true } : null;
  }

  /** `id` told to the end. */
  toldStory(id: string): void {
    if (!this.state.stories.includes(id)) this.commit({ ...this.state, stories: [...this.state.stories, id] });
  }

  /** The most telling news of the last week she has not been told (a headline first, then the newest), or null. */
  news(today: number): News | null {
    const days = this.world?.days() ?? [];
    let best: { news: News; rank: number } | null = null;
    for (const page of days) {
      const day = gameDayOf(page.day);
      if (day === null || today - day > NEWS_DAYS) continue;
      for (const [i, entry] of page.entries.entries()) {
        const key = `${page.day}#${i}`;
        if (this.state.told.includes(key)) continue;
        const heard = hear(entry);
        if (!heard) continue;
        // Headlines first, then the newest day, then the latest line of it.
        const rank = (entry.weight === 'headline' ? 1e6 : 0) + day * 100 + i;
        if (!best || rank > best.rank) best = { news: { key, ...heard }, rank };
      }
    }
    return best?.news ?? null;
  }

  /** `key` told her. */
  toldNews(key: string): void {
    if (this.state.told.includes(key)) return;
    this.commit({ ...this.state, told: [...this.state.told, key].slice(-TOLD_KEPT) });
  }

  /** Whether Gaspard may ring on `day` (once a week at most). */
  gaspardMayRing(day: number): boolean {
    return this.state.gaspard === null || day - this.state.gaspard >= GASPARD_EVERY;
  }

  gaspardRang(day: number): void {
    this.commit({ ...this.state, gaspard: day });
  }

  /** Whether she may ask after `topic` on `day` (not within `every` days of the last time); asking marks it. */
  ask(topic: string, day: number, every: number): boolean {
    const last = this.state.asked[topic];
    if (last !== undefined && day - last < every) return false;
    this.commit({ ...this.state, asked: { ...this.state.asked, [topic]: day } });
    return true;
  }

  /** The last game shown her (its title), or null. */
  get shown(): string | null {
    return this.state.shown;
  }

  setShown(title: string): void {
    if (title !== this.state.shown) this.commit({ ...this.state, shown: title });
  }

  /** Whether tea was had with her on `day`. */
  hadTea(day: number): boolean {
    return this.state.tea === day;
  }

  teaOn(day: number): void {
    this.commit({ ...this.state, tea: day });
  }

  /** `?debug`: as on the first day (no story told, no news heard, Gaspard free to ring). */
  debugReset(): void {
    this.commit(fresh());
  }

  /** `?debug`: Gaspard may ring at the next visit. */
  debugGaspard(): void {
    this.commit({ ...this.state, gaspard: null });
  }

  private commit(state: PresenceState): void {
    this.state = state;
    this.store.save(state);
  }
}

/** What a journal line is to her, or null for what she would not care about (a wish, a chore, a box unpacked). */
function hear(entry: JournalEntry): Omit<News, 'key'> | null {
  const text = entry.text;
  const who = typeof entry.data?.who === 'string' ? entry.data.who : '';
  switch (entry.kind) {
    case 'bought':
      return { kind: 'bought', x: text, who };
    case 'gift':
      return { kind: 'gift', x: text.split(',')[0] ?? text, who: who || 'a friend' };
    case 'prize':
      return { kind: 'prize', x: text.replace(/^Prize: /, ''), who };
    case 'medal':
      return { kind: 'medal', x: text, who };
    case 'arcade':
      return entry.weight === 'headline' ? { kind: 'pennant', x: text, who } : null;
    case 'home':
      if (entry.data?.id === 'cat') return { kind: 'cat', x: text, who };
      return entry.weight === 'note' ? null : { kind: 'home', x: text, who };
    case 'sold':
      return { kind: 'sold', x: text.replace(/^Parted with /, ''), who };
    case 'visit':
      if (entry.weight === 'headline') return { kind: 'party', x: text, who };
      return entry.weight === 'note' ? null : { kind: 'visit', x: text, who };
    case 'social': {
      const met = /^Met ([^,]+)/.exec(text);
      return met ? { kind: 'met', x: text, who: met[1] ?? '' } : null;
    }
    case 'story':
      return /Félix/.test(text) ? { kind: 'felix', x: text, who } : null;
    case 'hunt':
      return { kind: 'hunt', x: text, who };
    default:
      return null;
  }
}

function readState(data: unknown): PresenceState | null {
  if (typeof data !== 'object' || data === null) return null;
  const raw = data as Partial<Record<keyof PresenceState, unknown>>;
  const day = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []);
  const asked: Record<string, number> = {};
  if (typeof raw.asked === 'object' && raw.asked !== null) {
    for (const [topic, d] of Object.entries(raw.asked)) if (typeof d === 'number' && Number.isFinite(d)) asked[topic] = d;
  }
  return {
    stories: strings(raw.stories),
    told: strings(raw.told).slice(-TOLD_KEPT),
    gaspard: day(raw.gaspard),
    lastVisit: day(raw.lastVisit),
    asked,
    shown: typeof raw.shown === 'string' ? raw.shown : null,
    tea: day(raw.tea),
  };
}
