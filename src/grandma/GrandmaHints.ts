import { KEYS, PersistedStore, safeStorage } from '@/persistence';
import { inHours } from '@/time/clock';
import { MEMORIES, type Memory } from './memories';
import type { GrandmaVisits } from './GrandmaVisits';
import { CALL_LINES, HINTS, JOURNAL_DUE, JOURNAL_HINT, LETTER, LETTERS, MISSED, hintLines, type HintFacts } from './hintLines';

/*
 * MÉMÉ'S HINTS (docs/grandma.md "Hints toward the next memory"): what points the player at the next photo of her album
 * without a list. The next memory still locked, and how many visits it has stood for (vague, warmer, then clear), what
 * she said last on the way in; once a memory is ready, her ring on the flat's phone (answered, or the message she leaves)
 * and the letter she posts after days without a visit, each once per memory. Saved as `bibliothek.grandmaHints.v1`.
 */

/** How she rang about a memory: picked up, or the message left. */
type Rang = 'answered' | 'missed';

interface HintState {
  /** The next memory still locked when she was last visited, and the visits it has stood for (that one included). */
  target: string | null;
  visitsOn: number;
  /** What she hinted last on the way in: the memory, the tier, the visit (her visits' count). */
  said: { id: string; tier: number; visit: number } | null;
  /** The game day of the last visit, or null. */
  lastVisit: number | null;
  /** Her rings, by memory. */
  rang: Record<string, Rang>;
  /** The memory whose message waits on the phone, or null. */
  message: string | null;
  /** The memories she has written about. */
  posted: string[];
}

/** Her hours for ringing (game hours): after her coffee, before her programme. */
const CALL_HOURS: [number, number] = [9, 20];
/** Days without a visit before she posts a letter about a memory waiting. */
const LETTER_AFTER = 3;
/** Visits between two hints on the way in about the same thing (a clearer one is said at once). */
const HINT_EVERY = 3;

const fresh = (): HintState => ({ target: null, visitsOn: 0, said: null, lastVisit: null, rang: {}, message: null, posted: [] });

/** A letter on the mat, by shape (`hallway/mail`'s `MailPiece`). */
interface HintLetter {
  title: string;
  lines: string[];
  accent: number;
  look: 'letter';
  from: string;
  hand: 'pen';
}

export class GrandmaHints {
  private state: HintState;
  private readonly store: PersistedStore<HintState>;
  /** `?debug`: ring at the next look whatever the hour; post a letter in the next post whatever the days. */
  private forceRing = false;
  private forceLetter = false;

  constructor(
    private readonly grandma: GrandmaVisits,
    private readonly day: () => number,
    storage: Storage | null = safeStorage(),
  ) {
    this.store = new PersistedStore<HintState>({ key: KEYS.grandmaHints, version: 1, storage, defaults: fresh, read: readState });
    this.state = this.store.load();
    grandma.subscribe((event) => {
      if (event.kind === 'visit') this.visited();
    });
  }

  // --- At hers: her chat and the way in ---------------------------------------------------------------

  /** A hint on the way in, now and then (a clearer one at once), marked said; or null. */
  arrivalLine(): string | null {
    const now = this.current();
    if (!now) return null;
    const visit = this.grandma.facts().visits;
    const said = this.state.said;
    if (said && said.id === now.id && said.tier >= now.tier && visit - said.visit < HINT_EVERY) return null;
    const line = now.lines[visit % now.lines.length];
    if (!line) return null;
    this.commit({ ...this.state, said: { id: now.id, tier: now.tier, visit } });
    return line;
  }

  /** Her hint's lines for the chat (the tier she is at). */
  chatLines(): readonly string[] {
    return this.current()?.lines ?? [];
  }

  // --- The phone ---------------------------------------------------------------------------------------

  /** The memory she would ring about at `hour` (ready, not rung about yet, in her hours), or null. */
  callWaiting(hour: number): Memory | null {
    const due = this.grandma.due;
    if (!due || !CALL_LINES[due.id] || this.state.rang[due.id]) return null;
    if (!this.forceRing && !inHours(hour, CALL_HOURS)) return null;
    return due;
  }

  /** What she says when the player picks up about `id`. */
  callLine(id: string): string {
    return CALL_LINES[id] ?? CALL_LINES.wednesdays!;
  }

  /** The player picked up (`answered`) or let it ring (`missed`: her message waits on the phone). */
  rang(id: string, how: Rang): void {
    this.forceRing = false;
    this.commit({ ...this.state, rang: { ...this.state.rang, [id]: how }, message: how === 'missed' ? id : this.state.message });
  }

  /** Her message waiting on the phone (a card to read), or null. */
  message(): { title: string; text: string } | null {
    const id = this.state.message;
    return id ? { title: MISSED.title, text: MISSED.text(id) } : null;
  }

  messageHeard(): void {
    if (this.state.message) this.commit({ ...this.state, message: null });
  }

  // --- The post ----------------------------------------------------------------------------------------

  /** Her letter in game day `day`'s post (asked once, as the post is collected): a memory waits, days without a visit. */
  mail(day: number): HintLetter | null {
    const due = this.grandma.due;
    const letter = due ? LETTERS[due.id] : undefined;
    if (!due || !letter || this.state.posted.includes(due.id)) return null;
    if (!this.forceLetter) {
      const { lastVisit } = this.state;
      if (lastVisit === null || day - lastVisit < LETTER_AFTER || this.state.rang[due.id] === 'answered') return null;
    }
    this.forceLetter = false;
    this.commit({ ...this.state, posted: [...this.state.posted, due.id] });
    return { title: LETTER.title, lines: letter.lines, accent: LETTER.accent, look: 'letter', from: LETTER.from, hand: 'pen' };
  }

  // --- The journal -------------------------------------------------------------------------------------

  /** The journal's line in her words: she rang or wrote about the memory ready; else what she said of the next. */
  journal(): { due: boolean; text: string } | null {
    const due = this.grandma.due;
    if (due) {
      if (this.state.rang[due.id] === 'answered') return { due: true, text: JOURNAL_DUE.rang };
      if (this.state.posted.includes(due.id)) return { due: true, text: JOURNAL_DUE.wrote };
      return null;
    }
    const now = this.current();
    const said = this.state.said;
    if (!now || !said || said.id !== now.id || said.tier < 1) return null;
    const text = JOURNAL_HINT[now.id];
    return text ? { due: false, text } : null;
  }

  // --- `?debug` ----------------------------------------------------------------------------------------

  /** She rings at the flat's phone's next look, whatever the hour (a memory made ready first if none is). */
  debugRing(): void {
    if (!this.grandma.due) this.grandma.debugEveryMemory();
    const id = this.grandma.due?.id;
    if (id) {
      const rang = { ...this.state.rang };
      delete rang[id];
      this.commit({ ...this.state, rang });
    }
    this.forceRing = true;
  }

  /** Her letter in the next post collected (a memory made ready first if none is). */
  debugLetter(): void {
    if (!this.grandma.due) this.grandma.debugEveryMemory();
    const id = this.grandma.due?.id;
    this.commit({ ...this.state, posted: this.state.posted.filter((p) => p !== id) });
    this.forceLetter = true;
  }

  // --- Inside ------------------------------------------------------------------------------------------

  /** A visit: the day kept, and the next memory still locked counted one more visit (or a new one starts at one). */
  private visited(): void {
    const next = this.next();
    const target = next?.id ?? null;
    const visitsOn = target && target === this.state.target ? this.state.visitsOn + 1 : target ? 1 : 0;
    this.commit({ ...this.state, lastVisit: this.day(), target, visitsOn });
  }

  /** The first memory not seen and still locked, when none is ready; null else. */
  private next(): Memory | null {
    if (this.grandma.due) return null;
    const facts = this.grandma.facts();
    return MEMORIES.find((memory) => HINTS[memory.id] && !this.grandma.hasSeen(memory.id) && !memory.unlocked(facts)) ?? null;
  }

  /** The next memory, the tier she is at about it, and that tier's lines. */
  private current(): { id: string; tier: number; lines: readonly string[] } | null {
    const next = this.next();
    if (!next) return null;
    const facts = this.facts();
    const tier = next.id === this.state.target ? Math.min(2, Math.max(0, this.state.visitsOn - 1)) : 0;
    const lines = hintLines(next.id, tier, facts);
    return lines.length ? { id: next.id, tier, lines } : null;
  }

  private facts(): HintFacts {
    const facts = this.grandma.facts();
    return { ...facts, trailStarted: facts.prototypeFound || this.grandma.news().includes('trail') };
  }

  private commit(state: HintState): void {
    this.state = state;
    this.store.save(state);
  }
}

function readState(data: unknown): HintState | null {
  if (typeof data !== 'object' || data === null) return null;
  const raw = data as Partial<Record<keyof HintState, unknown>>;
  const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);
  const said = raw.said as Partial<{ id: unknown; tier: unknown; visit: unknown }> | null | undefined;
  const rang: Record<string, Rang> = {};
  if (typeof raw.rang === 'object' && raw.rang !== null) {
    for (const [id, how] of Object.entries(raw.rang)) if (how === 'answered' || how === 'missed') rang[id] = how;
  }
  return {
    target: typeof raw.target === 'string' ? raw.target : null,
    visitsOn: count(raw.visitsOn),
    said: said && typeof said.id === 'string' ? { id: said.id, tier: count(said.tier), visit: count(said.visit) } : null,
    lastVisit: typeof raw.lastVisit === 'number' && Number.isFinite(raw.lastVisit) ? raw.lastVisit : null,
    rang,
    message: typeof raw.message === 'string' ? raw.message : null,
    posted: Array.isArray(raw.posted) ? raw.posted.filter((id): id is string => typeof id === 'string') : [],
  };
}
