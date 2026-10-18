import type { Updatable } from '@/core/Engine';
import type { Game } from '@/catalog/types';
import type { NoticeActions } from '@/notices';
import { KEYS, PersistedStore, safeStorage } from '@/persistence';
import { BARGAIN_PRICE } from '@/economy/pricing';
import { STARTER_GAMES } from '@/catalog';
import { FIRST_DAY_DONE, FIRST_DAY_SKIPPED, FIRST_DAY_STEPS, placeOf, tipText, type FirstDayStepId } from './firstDaySteps';

/** The steps done along the way or not needed: the list read, Félix's lid (going out further ticks both). */
const OPTIONAL: ReadonlySet<FirstDayStepId> = new Set(['note', 'lid']);

/** What the first day watches: the stores by their counts, the player's zone, and where its tips are pinned. */
interface FirstDaySources {
  wallet: { readonly coins: number; readonly tickets: number; subscribe(cb: () => void): () => void };
  collection: { readonly games: readonly Game[]; subscribe(cb: () => void): () => void };
  deliveries: { readonly count: number; subscribe(cb: () => void): () => void };
  prizes?: { readonly owned: readonly unknown[]; subscribe(cb: () => void): () => void };
  /** The zone the player stands in (`ZoneManager.current.id`). */
  zone: () => string;
  /**
   * The tips, the banner at the end, the card when the list is put away; `tipsShown` false (Settings > Game) holds the
   * chain back, `readyToTell` false (a film, a menu, a conversation) stops its clocks.
   */
  notices: Pick<NoticeActions, 'tip' | 'reward' | 'read'> & { readonly tipsShown?: boolean; readonly readyToTell?: boolean };
}

interface FirstDayOptions {
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
  /** `step:place` tips already shown (`placeOf`: rooms sharing a tip are one place). */
  shown: string[];
  finished: boolean;
  /** Arcade machines whose controls the HUD has spelled out once (game ids); kept after the first day ends. */
  hinted: string[];
}

const STEP_IDS = new Set<string>(FIRST_DAY_STEPS.map((s) => s.id));
/** A tip waits this long after the player enters a zone (s), so it is not lost in the travel fade. */
const SETTLE_S = 1.2;
/** A to-do tip stays pinned while the player is in its place and the step is not done, this long at most. */
const TIP_MS = 120_000;
/** A to-do tip comes back on each visit to its place while its step is not done, this many times at most. */
const TIP_SHOWS = 3;

/**
 * THE GUIDED FIRST DAY: the to-do list on the hall console and the sticky note on the front door,
 * and a chain of tips for the first step not done yet in the place the player is in (once a visit,
 * `TIP_SHOWS` visits at most; the flat's rooms sharing the first tip are one place, so walking room
 * to room does not ring it again). Steps are ticked off by what the stores say (tickets won, tickets
 * spent, a game bought, the parcel unpacked) and by where the player goes, never by a timer: the
 * last one by a longplay coming on (`screenPlayed`) or, its pointer read, by going out again. The
 * clocks run only while the player is free to read (`readyToTell`). The list ends by itself or
 * from the note's "no more tips". A player whose save predates it never sees it. An `Updatable`.
 */
export class FirstDay implements Updatable {
  private state: FirstDayState;
  private readonly store: PersistedStore<FirstDayState>;
  private readonly listeners = new Set<() => void>();
  private readonly enabled: boolean;
  private sources: FirstDaySources | null = null;
  private zone = '';
  private inZoneFor = 0;
  /** The `step:place` of this visit: the same place across rooms is one visit. */
  private visit = '';
  /** This visit's tip was shown already. */
  private shownThisVisit = false;

  constructor(options: FirstDayOptions) {
    this.enabled = options.enabled ?? true;
    this.store = new PersistedStore<FirstDayState>({
      key: options.key ?? KEYS.firstDay,
      version: 1,
      storage: options.storage === undefined ? safeStorage() : options.storage,
      defaults: () => ({ done: [], shown: [], finished: false, hinted: [] }),
      read: readState,
    });
    const saved = this.store.tryLoad();
    this.state = saved ?? { done: [], shown: [], finished: options.returningPlayer, hinted: [] };
    // A list from before the lid step: past going out, it is not needed.
    if (this.state.done.some((s) => !OPTIONAL.has(s)) && !this.state.done.includes('lid')) this.state = { ...this.state, done: [...this.state.done, 'lid'] };
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

  /** A longplay came on: with only the last step left (the game bought, found, brought to the TV), the day is done. */
  screenPlayed(): void {
    if (!this.active || FIRST_DAY_STEPS.find((s) => !this.state.done.includes(s.id))?.id !== 'shelf') return;
    this.complete('shelf');
  }

  /** The list put away from the note: the tips stop, and a card says what the round was, once. */
  skip(): void {
    if (!this.active) return;
    this.state = { ...this.state, finished: true };
    this.commit();
    this.sources?.notices.read({ title: 'The list goes in the drawer', text: FIRST_DAY_SKIPPED, look: 'note' });
  }

  /** The last step's pointer was read on an earlier visit (or before a reload). */
  private get pointerShown(): boolean {
    return this.state.shown.some((s) => s.startsWith('shelf:'));
  }

  /** Whether the controls of the arcade machine running `gameId` were spelled out once already. */
  seen(gameId: string): boolean {
    return this.state.hinted.includes(gameId);
  }

  /** The controls of `gameId`'s machine were spelled out: the card on the machine does it from now on. */
  mark(gameId: string): void {
    if (this.seen(gameId)) return;
    this.state = { ...this.state, hinted: [...this.state.hinted, gameId] };
    if (this.enabled) this.store.save(this.state);
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
    let coins = wallet.coins;
    const ownedCount = () => collection.games.filter((g) => g.status !== 'wishlist').length;
    let owned = ownedCount();
    let parcel = deliveries.count;
    // Swapping tickets counts once the pocket holds a first game's price (the bin's), so the list's next step is reachable.
    let swapped = false;
    wallet.subscribe(() => {
      if (wallet.tickets > tickets) this.complete('play');
      // Tickets swapped for coins at the counter (fewer tickets, more coins at once), not for a prize.
      else if (wallet.tickets < tickets && wallet.coins > coins && this.isDone('play')) swapped = true;
      if (swapped && wallet.coins >= BARGAIN_PRICE) this.complete('redeem');
      tickets = wallet.tickets;
      coins = wallet.coins;
    });
    prizes?.subscribe(() => this.complete('play'));
    // Félix's note in the lid of the starter game read (`CopyOpening` marks its past found).
    const lidRead = (): boolean => STARTER_GAMES.some((s) => collection.games.find((g) => g.id === s.id)?.past?.found);
    if (lidRead()) this.complete('lid');
    collection.subscribe(() => {
      if (lidRead()) this.complete('lid');
      const now = ownedCount();
      // A first game in hand (bought with lucky coins, taken from the cast-offs) makes the swap step moot: the list can still finish.
      if (now > owned) this.complete('buy', 'redeem');
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
      if (!this.active) return;
    }
    // A film, a menu or a conversation has the player: no clock runs, no tip comes (it would ring unseen).
    if (sources.notices.readyToTell === false) return;
    this.inZoneFor += dt;
    if (this.inZoneFor < SETTLE_S) return;
    const step = FIRST_DAY_STEPS.find((s) => !this.state.done.includes(s.id));
    if (!step) {
      this.finish();
      return;
    }
    const tip = tipText(step, zone);
    if (!tip) {
      // A place with nothing to say for this step (a shop off the street) ends the visit: back out, it is a new one.
      this.visit = '';
      return;
    }
    const place = placeOf(step, zone);
    const id = `${step.id}:${place}`;
    // A new visit when the step or the place changes: the flat's rooms sharing one tip are one place.
    if (id !== this.visit) {
      this.visit = id;
      this.shownThisVisit = false;
    }
    // Once a visit; back on the next visits while the step is not done (`TIP_SHOWS` in all). The last step's pointer shows once.
    const pointer = step.id === 'shelf';
    const shows = this.state.shown.filter((s) => s === id).length;
    if (this.shownThisVisit || shows >= (pointer ? 1 : TIP_SHOWS)) return;
    // Tips off (Settings > Game): nothing is marked shown, so each shows once they are back on.
    if (sources.notices.tipsShown === false) return;
    this.shownThisVisit = true;
    this.state = { ...this.state, shown: [...this.state.shown, id] };
    this.commit();
    sources.notices.tip(tip, { id: 'first-day', head: 'To do', ms: pointer ? undefined : TIP_MS, until: pointer ? undefined : () => this.isDone(step.id) || placeOf(step, this.zone) !== place || !this.active });
  }

  /** Where the player went ticks what going there meant. */
  private onZone(zone: string): void {
    // Out again with the last pointer read (or tips off): the round is done, whether or not the TV came on.
    const lastLeft = FIRST_DAY_STEPS.find((s) => !this.state.done.includes(s.id))?.id === 'shelf';
    if ((zone === 'stairwell' || zone === 'street') && lastLeft && (this.pointerShown || this.sources?.notices.tipsShown === false)) {
      this.complete('shelf');
      this.finish();
      return;
    }
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
    // Going out (or further) means Félix's game can wait: its lid is no step in the way.
    if (fresh.some((s) => !OPTIONAL.has(s)) && !done.includes('lid')) done.push('lid');
    this.state = { ...this.state, done };
    this.commit();
  }

  private finish(): void {
    this.state = { ...this.state, finished: true };
    this.commit();
    this.sources?.notices.reward({ title: 'First day done!', detail: FIRST_DAY_DONE, big: true });
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
  const hinted = Array.isArray(d.hinted) ? d.hinted.filter((s): s is string => typeof s === 'string') : [];
  return { done, shown, finished: d.finished === true, hinted };
}
