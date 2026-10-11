import { KEYS, PersistedStore, safeStorage } from '@/persistence';
import { SUNDAY_WEEKDAY, weekdayOf } from '@/time/wakefulness';

/*
 * MÉMÉ'S BREAD (docs/grandma.md "Around her flat"): now and then, on the way in, she asks the player to bring her a
 * baguette from Lebrun's next time (the bakery downstairs on Linden Avenue: her knees and the stairs). The player buys
 * one at the bakery's door and gives it to her; she pays it back with something on top, however the player argues.
 * Not on a Sunday (lunch is bought), not twice in three days. A baguette bought without her asking is welcome too.
 * Saved as `bibliothek.grandmaBread.v1`.
 */

interface BreadState {
  /** The game day she asked, or null (nothing asked, or brought since). */
  asked: number | null;
  /** A baguette from Lebrun's is under the player's arm. */
  carried: boolean;
  /** The game day one was last brought her, or null. */
  brought: number | null;
}

/** What the bread costs, what she gives back for it, the days between two asks. */
export const BREAD = { price: 1, payBack: 2, rest: 3 } as const;

/** What is said: hers (asking, thanked, without asking), the baker's, the caption's. */
export const BREAD_WORDS = {
  ask: [
    'Could you get me a baguette from Lebrun’s next time you come? The stairs and my knees aren’t speaking.',
    'If you pass Lebrun’s on your way next time, a baguette. Not too cooked, I’ve only got my own teeth.',
    'Next time, love, bring me a baguette from downstairs. The one from the supermarket tastes of cardboard.',
  ],
  /** Brought when she had asked: her thanks; she pays it back. */
  thanks: [
    'Still warm! Here, for the bread, and don’t argue. Keep the change.',
    'Oh, you remembered. Your uncle never did. Take this, I insist.',
    'Lebrun’s! He always picks the best one for me. Here, put that in your pocket.',
  ],
  /** Brought without her asking. */
  unasked: ['Bread? I had some… but this is better. Thank you, love.', 'You’ll have me fat. Leave it on the dresser.'],
  /** The bakery's door, sold. */
  sold: ['A baguette, wrapped in its paper. “For Madame Aubry? I’ll pick her a good one.”', 'A baguette, warm. “Say hello to Madame Aubry.”'],
  /** The bakery's door with one already carried. */
  carrying: 'You have a baguette under your arm already.',
  /** Her conversation's entry. */
  give: 'Give her the baguette',
} as const;

const fresh = (): BreadState => ({ asked: null, carried: false, brought: null });

const isDay = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Mémé's bread: asked, carried, brought. */
export class BreadErrand {
  private state: BreadState;
  private readonly store: PersistedStore<BreadState>;

  constructor(storage: Storage | null = safeStorage()) {
    this.store = new PersistedStore<BreadState>({
      key: KEYS.grandmaBread,
      version: 1,
      defaults: fresh,
      storage,
      read: (data) => {
        if (typeof data !== 'object' || data === null) return null;
        const o = data as Partial<BreadState>;
        return { asked: isDay(o.asked) ? o.asked : null, carried: o.carried === true, brought: isDay(o.brought) ? o.brought : null };
      },
    });
    this.state = this.store.load();
  }

  /** A baguette under the player's arm. */
  get carried(): boolean {
    return this.state.carried;
  }

  /** She has asked for one and has not had it yet. */
  get wanted(): boolean {
    return this.state.asked !== null;
  }

  /**
   * On the way in on `day` (not the first visit): whether she asks now. Every third day or so, never a Sunday, nor
   * while one is asked or carried, nor within `BREAD.rest` days of the last brought.
   */
  ask(day: number): boolean {
    const { asked, carried, brought } = this.state;
    if (asked !== null || carried || weekdayOf(day) === SUNDAY_WEEKDAY) return false;
    if (brought !== null && day - brought < BREAD.rest) return false;
    if (((day * 2654435761) >>> 0) % 3 !== 0) return false;
    this.set({ ...this.state, asked: day });
    return true;
  }

  /** Bought at Lebrun's: carried (one at a time). */
  buy(): void {
    this.set({ ...this.state, carried: true });
  }

  /** Given her on `day`: whether she had asked (she pays it back then). */
  give(day: number): boolean {
    const asked = this.state.asked !== null;
    this.set({ asked: null, carried: false, brought: day });
    return asked;
  }

  /** `?debug`: she asks for one now (a fresh start of the errand). */
  askNow(day: number): void {
    this.set({ ...this.state, asked: day, carried: false });
  }

  private set(state: BreadState): void {
    this.state = state;
    this.store.save(state);
  }
}
