import { KEYS, PersistedStore } from '@/persistence';
import { inHours } from '@/time/clock';
import { gameDayRandom } from '@/time/daily';
import { oncePerDay } from '@/time/OncePerDay';
import { mainsOn, onMains, setMains } from './mains';
import { pinSource, refreshBoard } from './boardNotes';

/*
 * The building's power cut. On a storm's evening (the weather's `storm` spell, a lightning strike
 * between `EVENING.from` and `EVENING.to` game hours), about one stormy evening in `1 / ODDS`, the
 * strike takes the mains with it (`building/mains`): the flat's lamps and screens, the stairwell's
 * timer lights, the lift (stuck between two floors), the cellars' bulbs. It lasts until someone
 * resets the main fuse (the meters cupboard in the hall, or the board in the cellars) once the storm
 * has moved on a little (`FUSE_HOLDS_S`), or until the power company puts it back (`AUTO_RESTORE_S`).
 * At most one a game day (`KEYS.blackout`); a reload brings the power back.
 */

/** The game hours a strike may cut the power in: the evening, people home, the lamps wanted. */
const EVENING = { from: 17.5, to: 23.5 };
/** Chance that a stormy evening's strike cuts the power (a draw per game day): about one stormy evening in four. */
const ODDS = 0.25;
/** Real seconds before the main fuse holds once reset (sooner, it trips again: the storm is overhead). */
const FUSE_HOLDS_S = 40;
/** Real seconds after which the power comes back by itself. */
const AUTO_RESTORE_S = 420;

/** What the blackout reads of the world: the weather, the clock, the day. */
interface BlackoutInputs {
  weatherKind(): string;
  /** The weather's strike count: a new strike is the moment the power goes. */
  strikes(): number;
  hours(): number;
  gameDay(): number;
  /** Whether a cut may fall now (not with the player shut in the lift's car). */
  canCut(): boolean;
}

/** What resetting the fuse did. */
type FuseOutcome = 'restored' | 'trips' | 'on';

/**
 * The game day of the last cut: "done today" lives in `time/OncePerDay` under `blackout`. The store it had before
 * (`KEYS.blackout`, `{ day }`, 0 for none) is read once to carry an older save over.
 */
const CUT = 'blackout';
const legacy = new PersistedStore<{ day: number }>({
  key: KEYS.blackout,
  version: 1,
  defaults: () => ({ day: 0 }),
  read: (data) => (typeof data === 'object' && data !== null && typeof (data as { day?: unknown }).day === 'number' ? { day: (data as { day: number }).day } : null),
});
oncePerDay.adopt(CUT, legacy.exists ? legacy.load().day : null, 0);

/** The game day of the last cut, 0 for none yet. */
function lastCutDay(): number {
  const day = oncePerDay.lastDone(CUT);
  return typeof day === 'number' ? day : 0;
}

/** What the syndic pins after a power cut. */
const NOTICE = {
  id: 'blackout',
  title: 'POWER CUT',
  lines: ['The storm took the building’s power.', 'The main fuse is in the meters cupboard,', 'in the hall by the stairs. Wait for the', 'storm to pass before resetting it.'],
  paper: 0xf2e6c8,
  signed: 'The syndic',
  weight: 2,
};

/** The one blackout of the page (made by the stairwell's builder), for the fuse boxes and the debug hook. */
let current: Blackout | null = null;

export class Blackout {
  private strikes = -1;
  private since = 0;
  private forced = false;

  constructor(private readonly inputs: BlackoutInputs) {
    current = this;
    // The syndic's word on the hall's board, the day of a cut and the next.
    pinSource('blackout', (day) => {
      const cut = lastCutDay();
      return cut > 0 && day >= cut && day - cut <= 1 ? [NOTICE] : [];
    });
  }

  /** Seconds since the power went (0 while it is on). */
  get secondsDark(): number {
    return mainsOn() ? 0 : this.since;
  }

  update(dt: number): void {
    const { inputs } = this;
    const strikes = inputs.strikes();
    const struck = this.strikes >= 0 && strikes !== this.strikes;
    this.strikes = strikes;
    if (!mainsOn()) {
      this.since += dt;
      if (this.since >= AUTO_RESTORE_S) this.restore();
      return;
    }
    if (!struck || !inputs.canCut() || inputs.weatherKind() !== 'storm') return;
    const hours = inputs.hours();
    if (!inHours(hours, EVENING)) return;
    const day = inputs.gameDay();
    if (oncePerDay.done(CUT, day) || gameDayRandom('blackout', day)() >= ODDS) return;
    this.cut(day);
  }

  /** The power goes now (a strike, or `?debug`'s `bibliothek.blackout()`). */
  cut(day = this.inputs.gameDay()): void {
    if (!mainsOn()) return;
    oncePerDay.mark(CUT, day);
    this.since = 0;
    setMains(false);
    refreshBoard();
  }

  /** Somebody resets the main fuse: back on, unless the storm trips it again at once. */
  resetFuse(): FuseOutcome {
    if (mainsOn()) return 'on';
    if (this.since < FUSE_HOLDS_S && !this.forced) return 'trips';
    this.restore();
    return 'restored';
  }

  /** For the debug hook: a cut the fuse brings back at once. */
  force(): void {
    this.forced = true;
    this.cut();
  }

  private restore(): void {
    this.forced = false;
    this.since = 0;
    setMains(true);
  }
}

/** Whether the building is in a power cut right now. */
export function blackoutNow(): boolean {
  return !mainsOn();
}

/** Hears the power go (`true`) and come back (`false`); returns the unsubscribe. */
export function onBlackout(cb: (cut: boolean) => void): () => void {
  return onMains((on) => cb(!on));
}

/** Resets the building's main fuse (a fuse box's click); 'on' when nothing was wrong. */
export function resetMainFuse(): FuseOutcome {
  return current?.resetFuse() ?? 'on';
}

/** `?debug`: cuts the building's power now (the next fuse reset brings it back at once). */
export function forceBlackout(): void {
  current?.force();
}
