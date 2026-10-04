import type { PlatformId } from '@/catalog/types';
import { AUCTION } from './pricing';
import { RIVAL_COLLECTOR } from './rivalCollector';

/*
 * THE SALEROOM'S BIDDING, as pure rules: who sits in the room, who wants which lot and how badly (drawn per lot and
 * day, so a reload tells the same story), and one lot's run from the opening ask to the hammer (`LotRun`), stepped
 * by the scene (`saleroom/Saleroom`). No three.js, no storage.
 */

/** How someone bids: at once on anything they like, only at the last moment, never letting go of their platform, to a dealer's margin, the rival. */
type BidderStyle = 'impulsive' | 'sniper' | 'stubborn' | 'dealer' | 'rival';

interface Bidder {
  id: string;
  name: string;
  style: BidderStyle;
  /** The platform the stubborn one collects (she bids on little else). */
  favourite?: PlatformId;
  /** Their look's seed (`randomLook`). */
  seed: number;
  /** What they say when clicked. */
  lines: readonly string[];
}

/** The player, in a run's bids and results. */
export const YOU = 'you';

/** The regulars of the saleroom (the rival's id is `RIVAL_BIDDER`). */
export const SALEROOM_BIDDERS: readonly Bidder[] = [
  { id: 'doris', name: 'Doris', style: 'impulsive', seed: 431, lines: ['Ooh, I do love a sale. My grandson says I get carried away.', 'If I like it, I bid. Life is short, dear.', 'I bought a Virtual Boy here once. Never again. Well, maybe.'] },
  { id: 'okafor', name: 'Mr Okafor', style: 'sniper', seed: 437, lines: ['Patience. The bargains are made on "going twice".', 'I never show my hand before the auctioneer has to.', 'Watch the clock, not the room.'] },
  { id: 'pettibone', name: 'Mrs Pettibone', style: 'stubborn', favourite: 'snes', seed: 443, lines: ['Super Nintendo, young one. Everything else is a fad.', 'I have every PAL Super Nintendo game but eleven. Ten, after today.', 'Outbid me on a Super Nintendo game and I will remember your face.'] },
  { id: 'lenny', name: 'Lenny', style: 'dealer', seed: 449, lines: ['Trade only, mate. I buy to sell, so I know my ceiling.', 'Whatever I pay here, I need double on my stall.', 'Bid me up if you like. I stop where the money stops.'] },
  { id: 'victor', name: RIVAL_COLLECTOR.short, style: 'rival', seed: RIVAL_COLLECTOR.seed, lines: [] },
];

export const RIVAL_BIDDER = 'victor';

export function bidderById(id: string): Bidder | undefined {
  return SALEROOM_BIDDERS.find((b) => b.id === id);
}

/** Who wants a lot, up to how much (coins). */
interface LotInterest {
  bidder: string;
  ceiling: number;
}

/** What the interest draw needs to know of a lot. */
interface LotSketch {
  estimate: number;
  reserve: number;
  /** The game's platform (none for a sealed carton). */
  platform?: PlatformId;
  /** The lot the sale was put together around (the rival is after it). */
  star: boolean;
}

/**
 * Who in the room wants `lot`, and their ceiling, drawn from `rng` (seeded by the lot and the day). `keenness` is the
 * rival's (`RivalCollector.keenness`). A ceiling under the opening ask is no interest.
 */
export function drawInterest(lot: LotSketch, rng: () => number, keenness = 1): LotInterest[] {
  const between = (lo: number, hi: number) => lo + rng() * (hi - lo);
  const out: LotInterest[] = [];
  for (const bidder of SALEROOM_BIDDERS) {
    // Always draw both numbers: one bidder's luck never shifts another's.
    const want = rng();
    const share = rng();
    let ceiling = 0;
    switch (bidder.style) {
      case 'impulsive': if (want < 0.55) ceiling = 0.75 + share * 0.45; break;
      case 'sniper': if (want < 0.35) ceiling = 0.9 + share * 0.35; break;
      case 'stubborn': {
        const hers = lot.platform !== undefined && lot.platform === bidder.favourite;
        if (want < (hers ? 0.9 : 0.15)) ceiling = hers ? 1.0 + share * 0.35 : 0.7 + share * 0.25;
        break;
      }
      case 'dealer': if (want < 0.7) ceiling = 0.6 + share * 0.2; break;
      case 'rival': if (lot.star || want < 0.25) ceiling = (lot.star ? between(1.0, 1.3) : 0.7 + share * 0.25) * keenness; break;
    }
    const coins = Math.floor(lot.estimate * ceiling);
    if (coins >= lot.reserve) out.push({ bidder: bidder.id, ceiling: coins });
  }
  return out;
}

/** The step the auctioneer asks for over `amount` (coins). */
function increment(amount: number): number {
  if (amount < 20) return 2;
  if (amount < 60) return 5;
  if (amount < 150) return 10;
  if (amount < 400) return 20;
  return 50;
}

/** Where a lot stands: asked for, bid on, going once, twice, sold, passed (nobody opened it). */
type LotPhase = 'opening' | 'bidding' | 'once' | 'twice' | 'sold' | 'passed';

/** What happened in a step of a run, for the scene to show and say. `by` and `to` are a bidder's id or `YOU`. */
export type LotEvent =
  | { kind: 'open'; ask: number }
  | { kind: 'bid'; by: string; amount: number; ask: number }
  | { kind: 'once'; amount: number }
  | { kind: 'twice'; amount: number }
  | { kind: 'sold'; to: string; price: number }
  | { kind: 'passed' }
  /** A bidder lets it go (the ask is over their ceiling): a shake of the head. */
  | { kind: 'out'; by: string };

/** The run's clock (seconds), `AUCTION`'s by default. */
interface LotTiming {
  call: number;
  openSilence: number;
}

/** How soon after a change a bidder of each style bids (seconds), by phase. */
function delayFor(style: BidderStyle, phase: LotPhase, rand: () => number): number | null {
  const r = rand();
  switch (style) {
    case 'impulsive': return 0.5 + r * 0.8;
    case 'dealer': return 0.9 + r * 0.9;
    case 'stubborn': return 1.2 + r * 1.2;
    case 'rival': return phase === 'once' || phase === 'twice' ? 0.5 + r * 0.7 : 1.3 + r * 1.3;
    // The sniper waits for "going twice" (now and then "going once").
    case 'sniper': return phase === 'twice' ? 0.6 + r * 0.9 : phase === 'once' && r < 0.3 ? 0.8 + r : null;
  }
}

/**
 * One lot under the hammer: the opening ask is the reserve; every bid raises the ask by `increment`; silence after
 * a bid calls "going once", "twice", then sold to the highest bidder; nobody opening it within `openSilence` passes
 * it. The room's bidders bid on their own clock (`delayFor`), one at a time, while the ask is within their ceiling;
 * the player's bid is `bid(YOU)`. `tick` returns what happened, in order.
 */
export class LotRun {
  private phaseNow: LotPhase = 'opening';
  private high = 0;
  private leading: string | null = null;
  /** The bid before the leading one: whoever gets it if the leader cannot pay. */
  private under: { by: string; amount: number } | null = null;
  private quiet = 0;
  /** The next bid from the room: who and in how many seconds. */
  private next: { by: string; in: number } | null = null;
  /** Bidders who have let it go (said once). */
  private readonly out = new Set<string>();
  private readonly ceilings: Map<string, number>;

  constructor(
    readonly reserve: number,
    interest: readonly LotInterest[],
    private readonly timing: LotTiming = AUCTION,
    private readonly rand: () => number = Math.random,
  ) {
    this.ceilings = new Map(interest.map((i) => [i.bidder, i.ceiling]));
  }

  get phase(): LotPhase {
    return this.phaseNow;
  }

  /** The highest bid so far (0 before the first). */
  get amount(): number {
    return this.high;
  }

  get leader(): string | null {
    return this.leading;
  }

  get underbidder(): { by: string; amount: number } | null {
    return this.under;
  }

  /** What the next bid must be. */
  get ask(): number {
    return this.leading ? this.high + increment(this.high) : this.reserve;
  }

  get open(): boolean {
    return this.phaseNow !== 'sold' && this.phaseNow !== 'passed';
  }

  /** Whether `id` (a bidder) still wants it at the current ask. */
  wants(id: string): boolean {
    return (this.ceilings.get(id) ?? 0) >= this.ask;
  }

  start(): LotEvent[] {
    this.plan();
    return [{ kind: 'open', ask: this.ask }];
  }

  /** A bid at the current ask by `by` (the player: `YOU`); refused (no events) when the lot is shut or they lead already. */
  bid(by: string): LotEvent[] {
    if (!this.open || this.leading === by) return [];
    const amount = this.ask;
    if (this.leading) this.under = { by: this.leading, amount: this.high };
    this.high = amount;
    this.leading = by;
    this.quiet = 0;
    this.phaseNow = 'bidding';
    const events: LotEvent[] = [{ kind: 'bid', by, amount, ask: this.ask }];
    // Those it has priced out shake their heads, once each.
    for (const [id, ceiling] of this.ceilings) {
      if (id !== by && !this.out.has(id) && ceiling < this.ask && ceiling >= this.reserve) {
        this.out.add(id);
        events.push({ kind: 'out', by: id });
      }
    }
    this.plan();
    return events;
  }

  tick(dt: number): LotEvent[] {
    if (!this.open) return [];
    const events: LotEvent[] = [];
    if (this.next) {
      this.next.in -= dt;
      if (this.next.in <= 0) {
        const by = this.next.by;
        this.next = null;
        if (this.wants(by) && this.leading !== by) return this.bid(by);
      }
    }
    this.quiet += dt;
    const { call, openSilence } = this.timing;
    if (this.phaseNow === 'opening') {
      if (this.quiet >= openSilence) {
        this.phaseNow = 'passed';
        events.push({ kind: 'passed' });
      }
      return events;
    }
    const due: LotPhase = this.quiet >= 3 * call ? 'sold' : this.quiet >= 2 * call ? 'twice' : this.quiet >= call ? 'once' : 'bidding';
    if (due !== this.phaseNow) {
      this.phaseNow = due;
      if (due === 'once') events.push({ kind: 'once', amount: this.high });
      else if (due === 'twice') events.push({ kind: 'twice', amount: this.high });
      else if (due === 'sold') events.push({ kind: 'sold', to: this.leading!, price: this.high });
      if (due !== 'sold') this.plan();
    }
    return events;
  }

  /** The leader could not pay: the lot goes to the underbidder at their bid, or is passed. */
  fallBack(): Extract<LotEvent, { kind: 'sold' | 'passed' }> {
    this.phaseNow = this.under ? 'sold' : 'passed';
    if (!this.under) return { kind: 'passed' };
    this.leading = this.under.by;
    this.high = this.under.amount;
    return { kind: 'sold', to: this.under.by, price: this.under.amount };
  }

  /** The room's next bid: the soonest of those who still want it and do not lead. */
  private plan(): void {
    this.next = null;
    for (const [id] of this.ceilings) {
      if (id === this.leading || !this.wants(id)) continue;
      const style = bidderById(id)?.style ?? 'impulsive';
      let delay = delayFor(style, this.phaseNow, this.rand);
      if (delay === null) continue;
      // Nobody jumps in before the room has heard the opening ask.
      if (this.phaseNow === 'opening') delay += 1.2;
      if (!this.next || delay < this.next.in) this.next = { by: id, in: delay };
    }
  }
}
