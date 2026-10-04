import type { Game } from '@/catalog/types';
import { readGame } from '@/catalog/validate';
import { KEYS, PersistedStore } from '@/persistence';
import { gameDayRandom, isEventDay } from '@/time/daily';
import { nudge, tier } from '@/social/standing';
import { atLeast, tierRank } from '@/social/tiers';
import { RIVAL } from './pricing';

/*
 * THE RIVAL COLLECTOR: one man wherever he turns up. Outside RETRO GAMES with his suitcase some real days
 * (`street/shops/Trader`), at the flea market some market days after the priciest copy on the stalls
 * (`market/RivalInHall`), in the saleroom's front row on sale days (`saleroom/`). What he and the player did to
 * each other is kept here (`bibliothek.rival.v1`), so all three, and anything else that shows him (a window onto
 * the courtyard), tell one story. Read API: `RIVAL_COLLECTOR` (who he is), `rivalOnFrontStreet(date)`,
 * `rivalAtMarket(day)`, and a `RivalCollector`'s `view()`.
 */

/** Who he is: his name, the name on his lines, his caption, the seed his look is drawn from (the same body everywhere). */
export const RIVAL_COLLECTOR = { name: 'Victor Crane', short: 'Victor', label: 'Victor, the collector', seed: 911 } as const;

/** One real day in this many he sets up on Front Street (`isEventDay('trader', …)`: phase 1, the trader's draw since day one). */
const RIVAL_STREET_ONE_DAY_IN = 3;

/** Whether today (the real date) he stands outside RETRO GAMES with his suitcase. */
export function rivalOnFrontStreet(date = new Date(), oneDayIn = RIVAL_STREET_ONE_DAY_IN): boolean {
  return isEventDay('trader', oneDayIn, { date, phase: 1 });
}

/** Whether he comes to the flea market on market day `day` (the same for everyone, every reload). */
export function rivalAtMarket(day: number): boolean {
  return gameDayRandom('rival-hall', day)() < RIVAL.marketOdds;
}

/**
 * How he feels about the player: even, stung (beaten more often than not), smug (he has been winning); and, once the
 * social standing says so (docs/social.md "Victor"), warm (a friend now, whoever wins) or bitter (hostile and worse).
 */
type RivalMood = 'even' | 'stung' | 'smug' | 'warm' | 'bitter';

/** His person id in the social layer (`social/people/town.ts`). */
export const RIVAL_PERSON = 'victor';

/** What anything showing him may read. */
interface RivalView {
  name: string;
  /** Times the player got there first (a copy he was after, a lot he bid on). */
  beaten: number;
  /** Times he did. */
  took: number;
  mood: RivalMood;
  /** Spoken to at least once (he says "you" by then, not "friend"). */
  met: boolean;
}

/** His hunt at the flea market on a market day: the copy, and how it ended (none yet: on his way). */
interface RivalHunt {
  day: number;
  gameId: string;
  title: string;
  outcome?: 'took' | 'beaten';
}

/** A game he took (off a stall, at the saleroom) and still has: offered from his suitcase on Front Street. */
interface HaulEntry {
  game: Game;
  /** What he paid for it (his price is that times `TRADER_MARKUP`). */
  price: number;
  /** The market day he took it. */
  day: number;
}

interface RivalFile {
  beaten: number;
  took: number;
  met: boolean;
  hunt: RivalHunt | null;
  haul: HaulEntry[];
  /** The game day the player last beat him (a copy, a lot): talking to him that day is gracious or gloating. -1: never. */
  lastBeaten: number;
  /** He showed the player his collection (the arc's end: `showsCollection`, once). */
  shown: boolean;
}

const fresh = (): RivalFile => ({ beaten: 0, took: 0, met: false, hunt: null, haul: [], lastBeaten: -1, shown: false });

/**
 * The rival's side of the story, persisted: who beat whom (lifetime), today's hunt, his haul. Never a penalty on
 * what the player owns: he only ever takes copies still on sale, and what he takes waits in his suitcase.
 */
export class RivalCollector {
  private state: RivalFile;
  private readonly store: PersistedStore<RivalFile>;
  private readonly listeners = new Set<() => void>();

  constructor(storage?: Storage | null) {
    this.store = new PersistedStore<RivalFile>({ key: KEYS.rival, version: 1, defaults: fresh, read: readRival, ...(storage !== undefined ? { storage } : {}) });
    this.state = this.store.load();
  }

  view(): RivalView {
    const { beaten, took, met } = this.state;
    const standing = tier(RIVAL_PERSON);
    const mood: RivalMood = atLeast(standing, 'friend') ? 'warm' : tierRank(standing) <= tierRank('hostile') ? 'bitter' : beaten > took + 1 ? 'stung' : took > beaten + 1 ? 'smug' : 'even';
    return { name: RIVAL_COLLECTOR.name, beaten, took, met, mood };
  }

  /** Whether the player beat him on game day `day` (his feelings are raw: a kind word lands, a gloat bites). */
  beatenOn(day: number): boolean {
    return this.state.lastBeaten === day;
  }

  /** Whether he showed the player his collection already. */
  get shown(): boolean {
    return this.state.shown;
  }

  /** He showed the player his collection (once). */
  showCollection(): void {
    if (this.state.shown) return;
    this.state = { ...this.state, shown: true };
    this.save();
  }

  /** How much harder he bids: a little more for every time the player beat him (capped). */
  get keenness(): number {
    return 1 + Math.min(RIVAL.keenness.max, this.state.beaten * RIVAL.keenness.perWin);
  }

  /** His hunt on market day `day`, if he set out on one. */
  huntOn(day: number): RivalHunt | null {
    const hunt = this.state.hunt;
    return hunt && hunt.day === day ? hunt : null;
  }

  /** He has his eye on `game` today (said aloud in the hall). */
  startHunt(day: number, game: Pick<Game, 'id' | 'title'>): void {
    if (this.huntOn(day)) return;
    this.state = { ...this.state, hunt: { day, gameId: game.id, title: game.title } };
    this.save();
  }

  /** Today's hunt ended: he took it (into his haul), or the player was first. */
  endHunt(day: number, outcome: 'took' | 'beaten', taken?: { game: Game; price: number }): void {
    const hunt = this.huntOn(day);
    if (!hunt || hunt.outcome) return;
    this.state = { ...this.state, hunt: { ...hunt, outcome } };
    if (outcome === 'took') this.tookOne(day, taken);
    else this.beatenOnce(day);
  }

  /**
   * The player won something he was after (a lot he bid on), on game day `day`: it stings (warmth) but he respects
   * a fair win (trust; docs/social.md "Victor").
   */
  beatenOnce(day?: number): void {
    this.state = { ...this.state, beaten: this.state.beaten + 1, ...(day !== undefined ? { lastBeaten: day } : {}) };
    this.save();
    if (day !== undefined) nudge(RIVAL_PERSON, { warmth: -3, trust: 4, why: 'stung, but you beat him fairly', day, memory: 'you beat me to one', memoryWeight: -3 });
  }

  /** He won something the player could have had; a game goes into his suitcase. */
  tookOne(day: number, taken?: { game: Game; price: number }): void {
    const haul = taken ? [...this.state.haul.filter((h) => h.game.id !== taken.game.id), { game: taken.game, price: taken.price, day }] : this.state.haul;
    this.state = { ...this.state, took: this.state.took + 1, haul };
    this.save();
    nudge(RIVAL_PERSON, { warmth: 2, why: 'pleased he got there first', reason: 'rivalTook', day });
  }

  /** He bought `taken` with the player nowhere in it (a lot they never bid on): into his suitcase, no point to anyone. */
  keep(day: number, taken: { game: Game; price: number }): void {
    this.state = { ...this.state, haul: [...this.state.haul.filter((h) => h.game.id !== taken.game.id), { game: taken.game, price: taken.price, day }] };
    this.save();
  }

  /** Spoken to: he knows the player from now on. */
  meet(): void {
    if (this.state.met) return;
    this.state = { ...this.state, met: true };
    this.save();
  }

  /** What is still in his suitcase on market day `day` (taken within `RIVAL.haulDays`). */
  haulOn(day: number): readonly HaulEntry[] {
    return this.state.haul.filter((h) => day - h.day <= RIVAL.haulDays && h.day <= day);
  }

  /** The player bought `id` from him (or got it elsewhere): out of his haul. */
  sold(id: string): void {
    if (!this.state.haul.some((h) => h.game.id === id)) return;
    this.state = { ...this.state, haul: this.state.haul.filter((h) => h.game.id !== id) };
    this.save();
  }

  /** A line for the player, by how things stand between them. */
  greeting(): string {
    const { mood, met } = this.view();
    const you = met ? 'you' : 'friend';
    if (mood === 'warm') return `Ah, my favourite thorn in the side. Found anything I should be jealous of?`;
    if (mood === 'bitter') return `You. Of course. Don't let me keep you from whatever you're about to snatch.`;
    if (mood === 'stung') return `Ah, it's ${you}. Beat me to it again lately? I'm keeping count, you know.`;
    if (mood === 'smug') return `Hello, ${you}. Early bird, and all that. Try getting up before me some time.`;
    return `${RIVAL_COLLECTOR.short} Crane. I collect too: we'll be seeing a lot of each other.`;
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private save(): void {
    // Old haul entries go: he sold them on.
    const latest = Math.max(0, ...this.state.haul.map((h) => h.day));
    this.state = { ...this.state, haul: this.state.haul.filter((h) => latest - h.day <= RIVAL.haulDays) };
    this.store.save(this.state);
    for (const cb of this.listeners) cb();
  }
}

function readRival(data: unknown): RivalFile | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Partial<Record<keyof RivalFile, unknown>>;
  const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  const hunt = readHunt(d.hunt);
  const haul: HaulEntry[] = [];
  if (Array.isArray(d.haul)) {
    for (const entry of d.haul) {
      if (typeof entry !== 'object' || entry === null) continue;
      const { game, price, day } = entry as Partial<Record<keyof HaulEntry, unknown>>;
      const g = readGame(game);
      if (g && typeof price === 'number' && Number.isFinite(price) && typeof day === 'number') haul.push({ game: g, price, day });
    }
  }
  return { beaten: count(d.beaten), took: count(d.took), met: d.met === true, hunt, haul, lastBeaten: typeof d.lastBeaten === 'number' ? d.lastBeaten : -1, shown: d.shown === true };
}

function readHunt(value: unknown): RivalHunt | null {
  if (typeof value !== 'object' || value === null) return null;
  const { day, gameId, title, outcome } = value as Partial<Record<keyof RivalHunt, unknown>>;
  if (typeof day !== 'number' || typeof gameId !== 'string' || typeof title !== 'string') return null;
  return { day, gameId, title, ...(outcome === 'took' || outcome === 'beaten' ? { outcome } : {}) };
}
