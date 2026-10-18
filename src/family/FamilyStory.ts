import { KEYS, PersistedStore, safeStorage } from '@/persistence';
import { inHours } from '@/time/clock';
import { gameDayRandom } from '@/time/daily';
import { oncePerDay } from '@/time/OncePerDay';
import { SUNDAY_WEEKDAY, weekdayOf } from '@/time/wakefulness';

/*
 * THE END OF THE FAMILY'S STORY (docs/grandma.md "The end of the story"): how far it has gone, saved as
 * `bibliothek.familyStory.v1`. Gaspard at Mémé's Sunday table once the row is seen in her album, every Sunday once the
 * sale is (until the player has had it out with him), and how that ended; the Christmas-95 Game Boy (lot one, in
 * Victor Crane's hands) told, priced, bought back, given back to her; her visits to the flat, the first planned for a
 * Saturday, and the photo for her album.
 */

/** How it ended with Gaspard: he said sorry, she showed him the door, or the player said nothing and he left. */
export type GaspardEnd = 'apologised' | 'gone' | 'silent';

/** Where the Game Boy is: not told yet, told by Mémé, priced by Crane, home (in the collection), put in her hands. */
type GameBoyStage = 'none' | 'trail' | 'offered' | 'home' | 'given';

/** The numbers of it. */
const FAMILY = {
  /** Gaspard's Sunday at hers: from his arrival to his leaving, game hours. */
  gaspardHours: [11, 16] as [number, number],
  /** After his first Sunday (and while the sale is not seen yet), the odds of him there on a Sunday, and how many such. */
  gaspardOdds: 0.3,
  gaspardCasual: 3,
  /** Her visit to the flat: the hours she may ring, game hours. */
  visitHours: [14, 18] as [number, number],
  /** After her first visit, now and then on a Saturday: the odds, and the fewest days between two. */
  againOdds: 0.35,
  againGap: 14,
  /** After his apology: the fewest days before his one Sunday back, sorry to the player too, something of Félix's in hand. */
  backAfter: 7,
} as const;

/** The day's marker for Gaspard gone from her table (`time/OncePerDay`). */
const GASPARD_LEFT = 'gaspard:left';

/** Saturday, the day before Sunday. */
const SATURDAY = ((SUNDAY_WEEKDAY + 6) % 7) as number;

interface FamilyState {
  /** Game days Gaspard was at her table. */
  gaspardDays: number[];
  /** How it ended with him, and when; null while it has not. */
  gaspard: GaspardEnd | null;
  gaspardOn: number | null;
  /** After his apology, he came back one Sunday with what he had kept back from the sale. */
  gaspardBack: boolean;
  gameBoy: GameBoyStage;
  /** What Crane asked for it (coins), once he named a price. */
  price: number | null;
  /** Her visit to the flat: the game day planned, or null; how often she came, the last time; her photo taken. */
  visitDay: number | null;
  visits: number;
  previous: number | null;
  photo: boolean;
  /** The closing reel (the end of the story, after her photo) has played. */
  ended: boolean;
  /** `?debug`: Gaspard at her table on this day whatever the day; her visit today whatever the hour. */
  debugGaspard: number | null;
  debugVisit: number | null;
}

const fresh = (): FamilyState => ({
  gaspardDays: [], gaspard: null, gaspardOn: null, gaspardBack: false, gameBoy: 'none', price: null,
  visitDay: null, visits: 0, previous: null, photo: false, ended: false, debugGaspard: null, debugVisit: null,
});

/** What it reads of Mémé's album (whether a memory has been seen, `GrandmaVisits.hasSeen`), and the journal it writes to. */
interface FamilyDeps {
  seen(memory: string): boolean;
  note?(text: string, weight: 'headline' | 'line' | 'note'): void;
}

export class FamilyStory {
  private state: FamilyState;
  private readonly store: PersistedStore<FamilyState>;
  private readonly backListeners = new Set<(day: number) => void>();

  constructor(private readonly deps: FamilyDeps, storage: Storage | null = safeStorage()) {
    this.store = new PersistedStore<FamilyState>({ key: KEYS.familyStory, version: 1, storage, defaults: fresh, read: readState });
    this.state = this.store.load();
  }

  /** The album's memories this story could only have reached past (a lost album save is mended from it: `GrandmaVisits.restoreSeen`). */
  impliesSeen(): string[] {
    const s = this.state;
    if (s.gaspard !== null || s.gameBoy !== 'none') return ['row', 'sale'];
    return s.gaspardDays.length ? ['row'] : [];
  }

  /** A line in the day's journal (the scenes at hers and at the flat write theirs here). */
  note(text: string, weight: 'headline' | 'line' | 'note' = 'line'): void {
    this.deps.note?.(text, weight);
  }

  // --- Gaspard ------------------------------------------------------------------------------------

  /** How it ended with him, or null. */
  get gaspardEnd(): GaspardEnd | null {
    return this.state.gaspard;
  }

  /** The sale seen in the album and not had out with him yet: the reckoning is open. */
  get reckoning(): boolean {
    return this.state.gaspard === null && this.deps.seen('sale');
  }

  /** Whether the sale has been seen (he dodges until then). */
  get saleSeen(): boolean {
    return this.deps.seen('sale');
  }

  /**
   * Gaspard at her table on `day` at `hour`: a Sunday's lunch hours, once the row is seen; after the reckoning only
   * once more, a Sunday a week or more after he said sorry (`returning`).
   */
  gaspardAt(day: number, hour: number): boolean {
    const s = this.state;
    if (!this.deps.seen('row')) return false;
    if (s.gaspard !== null && !this.returning) return false;
    if (s.debugGaspard === day) return true;
    if (oncePerDay.done(GASPARD_LEFT, day)) return false;
    if (weekdayOf(day) !== SUNDAY_WEEKDAY || !inHours(hour, FAMILY.gaspardHours)) return false;
    if (this.returning) return s.gaspardOn !== null && day - s.gaspardOn >= FAMILY.backAfter;
    // Once the sale is seen he is there every Sunday until it is had out; before, his first Sunday, then now and then.
    if (this.deps.seen('sale') || !s.gaspardDays.length || s.gaspardDays.includes(day)) return true;
    return s.gaspardDays.length <= FAMILY.gaspardCasual && gameDayRandom('gaspard:sunday', day)() < FAMILY.gaspardOdds;
  }

  /** He said sorry at her table and has not come back yet: his next Sunday there is his last scene (`gaspardBrought`). */
  get returning(): boolean {
    return this.state.gaspard === 'apologised' && !this.state.gaspardBack;
  }

  /** Back after his apology, he gave the player what he kept from the sale (`onGaspardBack` hands it over). */
  gaspardBrought(day: number): void {
    if (!this.returning) return;
    this.commit({ ...this.state, gaspardBack: true });
    for (const listener of [...this.backListeners]) listener(day);
  }

  /** Hears Gaspard's return (`gaspardBrought`), to put what he brought into the collection. Returns the unsubscribe. */
  onGaspardBack(listener: (day: number) => void): () => void {
    this.backListeners.add(listener);
    return () => this.backListeners.delete(listener);
  }

  /** He was there on `day` (counted once). */
  gaspardCame(day: number): void {
    if (this.state.gaspardDays.includes(day)) return;
    this.commit({ ...this.state, gaspardDays: [...this.state.gaspardDays, day] });
  }

  /** He sat down at her table on `day` and has not got up and gone yet (his plate laid at lunch, his name not said). */
  gaspardIn(day: number): boolean {
    return this.state.gaspardDays.includes(day) && !oncePerDay.done(GASPARD_LEFT, day);
  }

  /** He got up and went on `day`: not at her table again that day (her flat built anew included). */
  gaspardLeft(day: number): void {
    oncePerDay.mark(GASPARD_LEFT, day);
  }

  /** It ended with him on `day`. */
  settleGaspard(end: GaspardEnd, day: number): void {
    if (this.state.gaspard) return;
    this.commit({ ...this.state, gaspard: end, gaspardOn: day });
  }

  // --- the Game Boy -------------------------------------------------------------------------------

  get gameBoy(): GameBoyStage {
    return this.state.gameBoy;
  }

  /** What Crane asked for it, or null. */
  get price(): number | null {
    return this.state.price;
  }

  /** Mémé should tell where the Game Boy went: the sale seen, not told yet. */
  get trailDue(): boolean {
    return this.state.gameBoy === 'none' && this.deps.seen('sale');
  }

  /** She told it. */
  tellTrail(): void {
    if (this.state.gameBoy === 'none') this.commit({ ...this.state, gameBoy: 'trail' });
  }

  /** Crane named his price. */
  priced(price: number): void {
    if (this.state.gameBoy === 'trail' || this.state.gameBoy === 'offered') this.commit({ ...this.state, gameBoy: 'offered', price });
  }

  /** It came home (bought, or given by Crane). */
  cameHome(): void {
    if (this.state.gameBoy !== 'home' && this.state.gameBoy !== 'given') this.commit({ ...this.state, gameBoy: 'home' });
  }

  /** Put back in her hands (she announces her visit to the flat next: `announceDue`). */
  givenBack(): void {
    if (this.state.gameBoy !== 'home') return;
    this.commit({ ...this.state, gameBoy: 'given' });
  }

  // --- her visit to the flat ----------------------------------------------------------------------

  /** She should announce her visit: the Game Boy back in her hands, or the keys handed over in the album; not yet planned nor made. */
  get announceDue(): boolean {
    const s = this.state;
    return s.visitDay === null && s.visits === 0 && (s.gameBoy === 'given' || this.deps.seen('keys'));
  }

  /** The day her visit is planned for, or null. */
  get visitDay(): number | null {
    return this.state.visitDay;
  }

  /** She came at least once. */
  get visited(): boolean {
    return this.state.visits > 0;
  }

  /** Her photo was taken for the album. */
  get photoTaken(): boolean {
    return this.state.photo;
  }

  /** Announced on `day`: the next Saturday (a week on if today is one). */
  planVisit(day: number): number {
    const visitDay = saturdayFrom(day + 1);
    this.commit({ ...this.state, visitDay, debugVisit: null });
    return visitDay;
  }

  /** She rings at the player's on `day` at `hour`: her planned Saturday, or now and then a Saturday after her first visit. */
  visitAt(day: number, hour: number): boolean {
    const s = this.state;
    if (s.debugVisit === day) return true;
    if (!inHours(hour, FAMILY.visitHours)) return false;
    if (s.visitDay === day) return true;
    if (!s.visits || s.visitDay !== null || weekdayOf(day) !== SATURDAY || s.previous === day) return false;
    if (s.previous !== null && day - s.previous < FAMILY.againGap) return false;
    return gameDayRandom('meme:dropIn', day)() < FAMILY.againOdds;
  }

  /** A planned day gone by without her (nobody home): moved to the next Saturday. */
  tidy(day: number): void {
    const planned = this.state.visitDay;
    if (planned !== null && planned < day) this.commit({ ...this.state, visitDay: saturdayFrom(day) });
  }

  /** Nobody answered on `day`: a planned visit is tried again next Saturday (a drop-in is just missed). */
  missed(day: number): void {
    if (this.state.visitDay !== null) this.planVisit(day);
  }

  /** She came on `day`. */
  came(day: number): void {
    const s = this.state;
    this.commit({ ...s, visits: s.visits + 1, previous: day, visitDay: null, debugVisit: null });
  }

  /** Her photo is in her album now. */
  photographed(): void {
    if (!this.state.photo) this.commit({ ...this.state, photo: true });
  }

  /** The story's closing reel is due: her photo is in the album and it has not played. */
  get endingDue(): boolean {
    return this.state.photo && !this.state.ended;
  }

  /** The closing reel played (to its end, or skipped): the story is told. */
  get ended(): boolean {
    return this.state.ended;
  }

  storyEnded(): void {
    if (!this.state.ended) this.commit({ ...this.state, ended: true });
  }

  // --- ?debug -------------------------------------------------------------------------------------

  /** Gaspard at her table today, whatever the day and the hour (the row taken as seen by the album's own switch). */
  debugGaspardToday(day: number): void {
    this.commit({ ...this.state, gaspard: null, gaspardOn: null, gaspardBack: false, debugGaspard: day });
  }

  /** The Game Boy's trail at its start (Mémé tells it on the next visit). */
  debugGameBoyTrail(): void {
    this.commit({ ...this.state, gameBoy: 'none', price: null });
  }

  /** The Game Boy home, ready to give her. */
  debugGameBoyHome(): void {
    this.commit({ ...this.state, gameBoy: 'home' });
  }

  /** Her visit to the flat today, as soon as the player is home, whatever the hour. */
  debugVisitToday(day: number): void {
    this.commit({ ...this.state, debugVisit: day, visitDay: day });
  }

  private commit(state: FamilyState): void {
    this.state = state;
    this.store.save(state);
  }
}

/** The first Saturday on or after `day`. */
function saturdayFrom(day: number): number {
  return day + ((SATURDAY - weekdayOf(day) + 7) % 7);
}

function readState(data: unknown): FamilyState | null {
  if (typeof data !== 'object' || data === null) return null;
  const raw = data as Partial<Record<keyof FamilyState, unknown>>;
  const day = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const ends: readonly GaspardEnd[] = ['apologised', 'gone', 'silent'];
  const stages: readonly GameBoyStage[] = ['none', 'trail', 'offered', 'home', 'given'];
  return {
    gaspardDays: Array.isArray(raw.gaspardDays) ? raw.gaspardDays.filter((d): d is number => typeof d === 'number' && Number.isFinite(d)) : [],
    gaspard: ends.includes(raw.gaspard as GaspardEnd) ? (raw.gaspard as GaspardEnd) : null,
    gaspardOn: day(raw.gaspardOn),
    gaspardBack: raw.gaspardBack === true,
    gameBoy: stages.includes(raw.gameBoy as GameBoyStage) ? (raw.gameBoy as GameBoyStage) : 'none',
    price: day(raw.price),
    visitDay: day(raw.visitDay),
    visits: typeof raw.visits === 'number' && Number.isFinite(raw.visits) ? Math.max(0, Math.floor(raw.visits)) : 0,
    previous: day(raw.previous),
    photo: raw.photo === true,
    ended: raw.ended === true,
    debugGaspard: day(raw.debugGaspard),
    debugVisit: day(raw.debugVisit),
  };
}
