import { KEYS, PersistedStore, safeStorage } from '@/persistence';
import { SUNDAY_WEEKDAY, weekdayOf } from '@/time/wakefulness';
import { inHours } from '@/time/clock';

/*
 * MÉMÉ ON THE 38 (docs/grandma.md "Around her flat"): some mornings she is on the bus the player takes to hers, back
 * from the market with her trolley. She waves from her seat during the ride (`ui/busRide`), gets off with the player at
 * Linden Avenue and walks home ahead of them (`world/linden/MemeOffTheBus`); in her flat, the visit knows she came in
 * with the player (`cameWith`: her hello may say so). Not on a Sunday, not a morning she was already seen at home.
 * Saved as `bibliothek.sharedRide.v1`.
 */

interface RideState {
  /** The game day she last rode with the player, or null. */
  rode: number | null;
  /** She has walked home from the stop since (the avenue showed her going in). */
  walked: boolean;
  /** The game day the player last found her at home, or null (she was not out at the market that morning). */
  home: number | null;
}

/** Her market mornings: the hours she is on the way back, and one morning in `every` she is. */
const MARKET = { from: 9.5, to: 12, every: 4 } as const;

/** What she says, on the bus and on the pavement. */
export const RIDE_WORDS = {
  /** Off the bus, to the player, as she sets off home. */
  offTheBus: ['Fancy that! Come on, I’ll go ahead and put the kettle on.', 'You took my bus! Mind the trolley, it has a mind of its own.', 'What luck. Walk slowly, love, I’ve got leeks in here.'],
} as const;

const isDay = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** The mornings Mémé shares the 38 with the player. */
export class SharedRide {
  private state: RideState;
  /** The day `?debug` put her on the next ride, or null. */
  private forced: number | null = null;
  private readonly store: PersistedStore<RideState>;

  constructor(storage: Storage | null = safeStorage()) {
    this.store = new PersistedStore<RideState>({
      key: KEYS.sharedRide,
      version: 1,
      defaults: () => ({ rode: null, walked: true, home: null }),
      storage,
      read: (data) => {
        if (typeof data !== 'object' || data === null) return null;
        const o = data as Partial<RideState>;
        return { rode: isDay(o.rode) ? o.rode : null, walked: o.walked !== false, home: isDay(o.home) ? o.home : null };
      },
    });
    this.state = this.store.load();
  }

  /**
   * A ride to hers on `day` at `hour` is starting: whether she is on it (a market morning of hers, not seen at home
   * yet that day, not already ridden with; or `?debug` asked for it). Marks the ride when she is.
   */
  board(day: number, hour: number): boolean {
    const { rode, home } = this.state;
    const forced = this.forced === day;
    this.forced = null;
    if (!forced) {
      if (rode === day || home === day || weekdayOf(day) === SUNDAY_WEEKDAY) return false;
      if (!inHours(hour, [MARKET.from, MARKET.to])) return false;
      if (((day * 2246822519) >>> 0) % MARKET.every !== 1) return false;
    }
    this.set({ ...this.state, rode: day, walked: false });
    return true;
  }

  /** Off the bus on `day`: whether she is with the player and has still to walk home (once). */
  walkHome(day: number): boolean {
    if (this.state.rode !== day || this.state.walked) return false;
    this.set({ ...this.state, walked: true });
    return true;
  }

  /** She came to her door with the player on `day` (the visit's hello may say so). */
  cameWith(day: number): boolean {
    return this.state.rode === day;
  }

  /** The player found her at home on `day` (she was not out that morning), unless she came with them. */
  seenHome(day: number): void {
    if (this.state.home !== day && this.state.rode !== day) this.set({ ...this.state, home: day });
  }

  /** `?debug`: she is on the next ride to hers on `day`, whatever the hour. */
  forceNext(day: number): void {
    this.forced = day;
  }

  private set(state: RideState): void {
    this.state = state;
    this.store.save(state);
  }
}
