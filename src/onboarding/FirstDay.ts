import type { Updatable } from '@/core/Engine';
import type { Game } from '@/catalog/types';
import { KEYS, PersistedStore, safeStorage } from '@/persistence';
import { FIRST_DAY_DONE, FIRST_DAY_STEPS, type FirstDayStepId } from './firstDaySteps';

/** What the first day watches: the stores by their counts, the player's zone, and a way to say a tip. */
export interface FirstDaySources {
  wallet: { readonly coins: number; readonly tickets: number; subscribe(cb: () => void): () => void };
  collection: { readonly games: readonly Game[]; subscribe(cb: () => void): () => void };
  deliveries: { readonly count: number; subscribe(cb: () => void): () => void };
  prizes?: { readonly owned: readonly unknown[]; subscribe(cb: () => void): () => void };
  /** The zone the player stands in (`ZoneManager.current.id`). */
  zone: () => string;
  /** Shows a tip for `ms` (the Toast). */
  say: (text: string, ms: number) => void;
}

export interface FirstDayOptions {
  /** A save existed before this build knew about the first day: no tips, no notes. */
  returningPlayer: boolean;
  /** False plays without it altogether (`?debug`'s seed collection). Default true. */
  enabled?: boolean;
  storage?: Storage | null;
  key?: string;
}

/** What the flat's notes read (`ToDoNote`, the front door's sticky note): `FirstDay` fits. */
export interface FirstDayLike {
  /** Tips and notes are still out (not finished, not skipped). */
  readonly active: boolean;
  isDone(step: FirstDayStepId): boolean;
  /** The to-do list was read. */
  noteRead(): void;
  /** "I know my way around": no more tips, the notes go. */
  skip(): void;
  subscribe(cb: () => void): () => void;
}

interface FirstDayState {
  done: FirstDayStepId[];
  /** `step:zone` tips already shown. */
  shown: string[];
  finished: boolean;
}

const STEP_IDS = new Set<string>(FIRST_DAY_STEPS.map((s) => s.id));
/** A tip waits this long after the player enters a zone (s), so it is not lost in the travel fade. */
const SETTLE_S = 1.2;
const TIP_MS = 6000;

/**
 * THE GUIDED FIRST DAY: the to-do list on the hall console and the sticky note on the front door,
 * and a chain of tips, each shown once, for the first step not done yet in the zone the player is
 * in. Steps are ticked off by what the stores say (tickets won, tickets spent, a game bought, the
 * parcel unpacked) and by where the player goes; the list ends by itself or from the note's "no
 * more tips". A player whose save predates it never sees it. An `Updatable` (it follows the zone).
 */
export class FirstDay implements Updatable {
  private state: FirstDayState;
  private readonly store: PersistedStore<FirstDayState>;
  private readonly listeners = new Set<() => void>();
  private readonly enabled: boolean;
  private sources: FirstDaySources | null = null;
  private zone = '';
  private inZoneFor = 0;

  constructor(options: FirstDayOptions) {
    this.enabled = options.enabled ?? true;
    this.store = new PersistedStore<FirstDayState>({
      key: options.key ?? KEYS.firstDay,
      version: 1,
      storage: options.storage === undefined ? safeStorage() : options.storage,
      defaults: () => ({ done: [], shown: [], finished: false }),
      read: readState,
    });
    const saved = this.store.tryLoad();
    this.state = saved ?? { done: [], shown: [], finished: options.returningPlayer };
    if (!saved && this.enabled) this.store.save(this.state);
  }

  get active(): boolean {
    return this.enabled && !this.state.finished;
  }

  isDone(step: FirstDayStepId): boolean {
    return this.state.finished || this.state.done.includes(step);
  }

  noteRead(): void {
    this.complete('note');
  }

  skip(): void {
    if (!this.active) return;
    this.state = { ...this.state, finished: true };
    this.commit();
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** Starts watching (call once, when the stores and the zones exist). */
  connect(sources: FirstDaySources): void {
    if (!this.active || this.sources) return;
    this.sources = sources;
    const { wallet, collection, deliveries, prizes } = sources;
    let tickets = wallet.tickets;
    const ownedCount = () => collection.games.filter((g) => g.status !== 'wishlist').length;
    let owned = ownedCount();
    let parcel = deliveries.count;
    wallet.subscribe(() => {
      if (wallet.tickets > tickets) this.complete('play');
      else if (wallet.tickets < tickets && this.isDone('play')) this.complete('redeem');
      tickets = wallet.tickets;
    });
    prizes?.subscribe(() => this.complete('play'));
    collection.subscribe(() => {
      const now = ownedCount();
      if (now > owned) this.complete('buy');
      owned = now;
    });
    deliveries.subscribe(() => {
      // The parcel emptied with the game still owned: unpacked (a game sold back leaves it too, and the collection shrinks).
      if (deliveries.count < parcel && ownedCount() >= owned && this.isDone('buy')) this.complete('unpack');
      parcel = deliveries.count;
    });
  }

  update(dt: number): void {
    const sources = this.sources;
    if (!sources || !this.active) return;
    const zone = sources.zone();
    if (zone !== this.zone) {
      this.zone = zone;
      this.inZoneFor = 0;
      this.onZone(zone);
    }
    this.inZoneFor += dt;
    if (this.inZoneFor < SETTLE_S) return;
    const step = FIRST_DAY_STEPS.find((s) => !this.state.done.includes(s.id));
    if (!step) {
      this.finish();
      return;
    }
    const tip = step.tips[zone];
    const id = `${step.id}:${zone}`;
    if (!tip || this.state.shown.includes(id)) return;
    this.state = { ...this.state, shown: [...this.state.shown, id] };
    this.commit();
    sources.say(tip, TIP_MS);
    // The last step is a pointer, not a chore: showing it is doing it.
    if (step.id === 'shelf') this.complete('shelf');
  }

  /** Where the player went ticks what going there meant. */
  private onZone(zone: string): void {
    if (zone === 'stairwell' || zone === 'street') this.complete('out');
    if (zone === 'arcade') this.complete('out', 'arcade');
    if (zone === 'market') this.complete('out', 'arcade', 'market');
  }

  private complete(...steps: FirstDayStepId[]): void {
    if (!this.active) return;
    const fresh = steps.filter((s) => !this.state.done.includes(s));
    if (!fresh.length) return;
    // Going out means the list was read (or not needed).
    const done = [...this.state.done, ...fresh];
    if (fresh.some((s) => s !== 'note') && !done.includes('note')) done.push('note');
    this.state = { ...this.state, done };
    this.commit();
  }

  private finish(): void {
    this.state = { ...this.state, finished: true };
    this.commit();
    this.sources?.say(FIRST_DAY_DONE, TIP_MS);
  }

  private commit(): void {
    if (this.enabled) this.store.save(this.state);
    for (const cb of [...this.listeners]) cb();
  }
}

function readState(data: unknown): FirstDayState | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Partial<Record<keyof FirstDayState, unknown>>;
  const done = Array.isArray(d.done) ? d.done.filter((s): s is FirstDayStepId => typeof s === 'string' && STEP_IDS.has(s)) : [];
  const shown = Array.isArray(d.shown) ? d.shown.filter((s): s is string => typeof s === 'string') : [];
  return { done, shown, finished: d.finished === true };
}
