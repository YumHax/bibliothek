import { GRAIL, NEGOTIATION, STICKER } from './pricing';
import type { StockItem } from './StockItem';
import { unit01 } from '@/random';
import { formatCoins } from '@/text/money';
import { capitalise } from '@/text/strings';
import { HAGGLE_LINES, type HaggleLineSet, type HaggleVoice } from './haggleLines';

export type { HaggleVoice };

/**
 * What the player can say besides an offer, once each per haggle: point out a flaw of the copy (`manual`: it has none;
 * `worn`: a worn box), or threaten to come back another day (`later`). See `NEGOTIATION.argument`.
 */
export type ArgumentKind = 'manual' | 'worn' | 'later';

/** The three offers the player can make, as shares of the tag (see `NEGOTIATION.offers`). */
export type OfferKind = keyof typeof NEGOTIATION.offers;
export const OFFER_KINDS: readonly OfferKind[] = ['cheeky', 'fair', 'polite'];

/** What sways the stallholder today, besides the copy itself. */
interface NegotiationMood {
  day: number;
  /** Insulting offers made at this stall today. */
  soured: number;
  /** 0 (a stranger) to 3 (best customer) at this stall. */
  loyalty: number;
  /** The player had a coffee today. */
  coffee: boolean;
  /** It is raining: few buyers about. */
  rain: boolean;
}

/** The stallholder's answer to an offer. */
export type Reply =
  /** Deal at `price`: the negotiation is over. */
  | { kind: 'accept'; price: number; line: string }
  /** Not that low, but `price` would do: the player may take it (or try again). */
  | { kind: 'counter'; price: number; line: string; insulted: boolean }
  /** Out of patience: their last counter-offer (the tag if none was made) stands for the rest of the day. */
  | { kind: 'walk'; price: number; line: string; insulted: boolean };

/**
 * A haggle over one copy, as a short exchange: the player makes offers (cheeky, fair, polite:
 * shares of the tag); the stallholder, who has a lowest price in mind (drawn per copy and day, so
 * it cannot be rerolled, nudged by loyalty, a coffee, the rain and the stall's mood) and a few
 * offers' patience, takes an offer at or over it, counters one under it (each counter closer to
 * that lowest price), and takes offence at one far under it. Out of patience, their last
 * counter-offer stands (the tag if none was made), as it does when the player walks off.
 * Pure: the caller records the outcome (`factor`) and any soured mood.
 */
export class Negotiation {
  readonly tag: number;
  /** The lowest price as a share of the tag (before `NEGOTIATION.lowest`), and in coins. */
  private share: number;
  /** The drawn share plus the soured mood, before anything that sways them down (`sway`, capped at `NEGOTIATION.maxSway`). */
  private readonly drawn: number;
  private sway = 0;
  private floor: number;
  private patience: number;
  private counterPrice: number;
  private finished: { price: number } | null = null;
  private turn = 0;
  /** What the player's arguments took off the lowest share (`argue`). */
  private argued = 0;
  private readonly used = new Set<ArgumentKind>();
  /** Set on their price: a showpiece's seller, or a lowest share drawn in the top half (they bristle at "till Sunday"). */
  private readonly stubborn: boolean;
  private lines: HaggleLineSet = HAGGLE_LINES.plain;

  constructor(private readonly item: StockItem, private readonly mood: NegotiationMood) {
    this.tag = item.tagPrice;
    const kind = item.source === 'showpiece' || item.source === 'estate' || item.source === 'grail' ? 'showpiece' : item.condition === 'worn' ? 'worn' : 'ordinary';
    const [lo, hi] = NEGOTIATION.floor[kind];
    const u = unit01(`${mood.day}:floor:${item.game.id}`);
    this.drawn = lo + u * (hi - lo) + mood.soured * NEGOTIATION.moodPenalty;
    this.stubborn = kind === 'showpiece' || u > 0.5;
    this.sway = mood.loyalty * NEGOTIATION.loyalty + (mood.coffee ? NEGOTIATION.coffee.floor : 0) + (mood.rain ? NEGOTIATION.rain : 0);
    this.share = this.swayed();
    this.floor = this.floorFor(this.share);
    this.patience = Negotiation.patienceFor(mood.soured, mood.coffee);
    this.counterPrice = this.tag;
  }

  /** Who is talking: the seller's voice (`haggleLines`), set before the first line is said. */
  useVoice(voice: HaggleVoice): void {
    this.lines = HAGGLE_LINES[voice];
  }

  /** The seller's first words, the tag in their voice. */
  get opening(): string {
    return this.say(this.lines.open, this.tag);
  }

  /** The offers a stallholder hears before losing patience, soured `soured` times today, with or without the player's coffee. */
  static patienceFor(soured: number, coffee: boolean): number {
    return NEGOTIATION.patience - soured + (coffee ? NEGOTIATION.coffee.patience : 0);
  }

  /**
   * What the player brings along besides a coffee (`household/perks`: a bath's calm, the day's first
   * sale, a platform's know-how, a jacket): `floor` moves the lowest share (never under
   * `NEGOTIATION.lowest`, nor a grail's `GRAIL.floor`), `patience` adds offers. Before the first offer only.
   */
  ease(change: { floor?: number; patience?: number }): void {
    if (this.turn > 0 || this.finished) return;
    this.sway += change.floor ?? 0;
    this.share = this.swayed();
    this.floor = this.floorFor(this.share);
    this.patience += change.patience ?? 0;
  }

  /**
   * The lowest share with what sways them: loyalty, a coffee, the rain and the player's perks add up, but only to
   * `NEGOTIATION.maxSway` together (past it they would all end on `lowest` and count for nothing). A grail's seller
   * knows what they have: moved a little, never under `GRAIL.floor`.
   */
  private swayed(): number {
    const share = this.drawn - this.argued + Math.max(-NEGOTIATION.maxSway, this.sway);
    return this.item.source === 'grail' ? Math.max(GRAIL.floor, share) : share;
  }

  /** How far what sways them moves the lowest share today, as a positive share of the tag (capped: `NEGOTIATION.maxSway`). */
  get swayShare(): number {
    return Math.min(NEGOTIATION.maxSway, Math.max(0, -this.sway));
  }

  private floorFor(share: number): number {
    return Math.max(1, Math.round(this.tag * Math.min(1, Math.max(this.lowestShare, share))));
  }

  /**
   * No stallholder goes under this share of the tag: `NEGOTIATION.lowest` (`lowestWorn` for a worn
   * copy), divided by the sticker's discount on a stickered one (its tag is already lower: the
   * haggle stops where an unstickered copy's would, so peeling it at home and selling back never pays).
   */
  private get lowestShare(): number {
    const lowest = this.item.condition === 'worn' ? NEGOTIATION.lowestWorn : NEGOTIATION.lowest;
    return this.item.sticker ? Math.min(1, lowest / STICKER.factor) : lowest;
  }

  /** What each offer would be, in coins. */
  offerPrice(kind: OfferKind): number {
    return Math.max(1, Math.round(this.tag * NEGOTIATION.offers[kind]));
  }

  /** The stallholder's current asking price (the tag, then each counter-offer). */
  get asking(): number {
    return this.counterPrice;
  }

  /** Offers left before the stallholder loses patience. */
  get patienceLeft(): number {
    return Math.max(0, this.patience);
  }

  get done(): boolean {
    return this.finished !== null;
  }

  /** The agreed price as a share of the tag, once done (their last counter's when they ran out of patience; 1 with none made). */
  get factor(): number {
    return this.finished ? this.finished.price / this.tag : 1;
  }

  /** The player offers `kind`. */
  offer(kind: OfferKind): Reply {
    if (this.finished) return { kind: 'accept', price: this.finished.price, line: `We already shook on ${formatCoins(this.finished.price)}.` };
    const offered = this.offerPrice(kind);
    this.turn++;
    if (offered >= this.counterPrice) return this.close(this.counterPrice, this.lines.accept);
    if (offered >= this.floor) return this.close(offered, this.lines.accept);
    const insulted = offered < this.floor - this.tag * NEGOTIATION.insult;
    this.patience -= insulted ? 2 : 1;
    if (this.patience <= 0) {
      // Take it or leave it: the last counter-offer stands, as when the player walks off (so walking off never beats this).
      this.finished = { price: this.counterPrice };
      return { kind: 'walk', price: this.counterPrice, line: this.say(this.lines.walk, this.counterPrice), insulted };
    }
    // Each counter halves the way down to the lowest price (never under it, never over the last one).
    const next = Math.max(this.floor, Math.round(this.floor + (this.counterPrice - this.floor) * (insulted ? 0.8 : 0.5)));
    this.counterPrice = Math.min(this.counterPrice, next);
    return { kind: 'counter', price: this.counterPrice, line: this.say(insulted ? this.lines.insult : this.lines.counter, this.counterPrice), insulted };
  }

  /** The arguments the player may still make: the copy's flaw (once), and "till Sunday" (once). None once the deal is done. */
  get arguments(): ArgumentKind[] {
    if (this.finished) return [];
    const flaw: ArgumentKind | null = this.item.condition === 'noManual' ? 'manual' : this.item.condition === 'worn' ? 'worn' : null;
    return ([flaw, 'later'] as (ArgumentKind | null)[]).filter((a): a is ArgumentKind => a !== null && !this.used.has(a));
  }

  /**
   * The player argues `kind` (`NEGOTIATION.argument`): a flaw lowers the lowest price and brings the asking one down a
   * little; "till Sunday" brings the asking price halfway down, or, to a seller set on their price, costs a point of
   * patience (out of patience, their price stands as after an offer).
   */
  argue(kind: ArgumentKind): Reply {
    if (this.finished || this.used.has(kind)) return { kind: 'counter', price: this.counterPrice, line: this.say(this.lines.counter, this.counterPrice), insulted: false };
    this.used.add(kind);
    this.turn++;
    if (kind === 'later' && this.stubborn) {
      this.patience--;
      if (this.patience <= 0) {
        this.finished = { price: this.counterPrice };
        return { kind: 'walk', price: this.counterPrice, line: this.say(this.lines.walk, this.counterPrice), insulted: false };
      }
      return { kind: 'counter', price: this.counterPrice, line: this.say(this.lines.laterNo, this.counterPrice), insulted: false };
    }
    if (kind !== 'later') {
      this.argued += NEGOTIATION.argument.flaw;
      this.share = this.swayed();
      this.floor = this.floorFor(this.share);
    }
    const way = kind === 'later' ? NEGOTIATION.argument.later : 0.3;
    this.counterPrice = Math.min(this.counterPrice, Math.max(this.floor, Math.round(this.counterPrice - (this.counterPrice - this.floor) * way)));
    const flaw = kind === 'manual' ? 'the missing manual' : 'the worn box';
    const lines = kind === 'later' ? this.lines.laterYes : this.lines.flaw;
    // The flaw opens a sentence in some lines: capitalised there.
    const line = this.say(lines, this.counterPrice).replace(/(^|[.!?…]\s+)\{flaw\}/g, (_, lead: string) => `${lead}${capitalise(flaw)}`).replace('{flaw}', flaw);
    return { kind: 'counter', price: this.counterPrice, line, insulted: false };
  }

  /** The player takes the standing counter-offer. */
  acceptCounter(): Reply {
    if (this.finished) return { kind: 'accept', price: this.finished.price, line: `We already shook on ${formatCoins(this.finished.price)}.` };
    return this.close(this.counterPrice, this.lines.accept);
  }

  /** The player walks off mid-haggle: the last counter-offer stands for the day (the tag if none was made). */
  abandon(): number {
    if (!this.finished) this.finished = { price: this.counterPrice };
    return this.factor;
  }

  private close(price: number, lines: readonly string[]): Reply {
    this.finished = { price };
    return { kind: 'accept', price, line: this.say(lines, price) };
  }

  private say(lines: readonly string[], price: number): string {
    const i = Math.floor(unit01(`${this.mood.day}:line:${this.item.game.id}:${this.turn}`) * lines.length);
    return lines[i]!.replace('{price}', `${formatCoins(price)}`).replace('{game}', this.item.game.title);
  }
}
