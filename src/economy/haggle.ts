import { NEGOTIATION, hash01 } from './pricing';
import type { StockItem } from './StockItem';

/** The three offers the player can make, as shares of the tag (see `NEGOTIATION.offers`). */
export type OfferKind = keyof typeof NEGOTIATION.offers;
export const OFFER_KINDS: readonly OfferKind[] = ['cheeky', 'fair', 'polite'];

/** What sways the stallholder today, besides the copy itself. */
export interface NegotiationMood {
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
  /** Out of patience: the tag stands for the rest of the day. */
  | { kind: 'walk'; price: number; line: string; insulted: boolean };

const ACCEPT = [
  'Go on then, {price}. You drive a hard bargain.',
  "{price}? Done. Don't tell the others.",
  'Fair enough. {price} it is.',
  'You know your stuff. {price}, shake on it.',
];
const COUNTER = [
  'Not a chance. {price}, and I’m being generous.',
  "I can't go that low. {price}?",
  'Meet me at {price}.',
  'Hmm. {price}, final offer. Well, nearly.',
];
const INSULT = [
  'Are you having a laugh? {price}.',
  "That's an insult to the cartridge. {price}.",
  'I paid more than that for it myself! {price}.',
];
const WALK = [
  "Enough. It's {price}, take it or leave it.",
  "We're done haggling. {price}, like the tag says.",
  "You've worn me out. {price}, not a coin less.",
];

/**
 * A haggle over one copy, as a short exchange: the player makes offers (cheeky, fair, polite:
 * shares of the tag); the stallholder, who has a lowest price in mind (drawn per copy and day, so
 * it cannot be rerolled, nudged by loyalty, a coffee, the rain and the stall's mood) and a few
 * offers' patience, takes an offer at or over it, counters one under it (each counter closer to
 * that lowest price), and takes offence at one far under it. Out of patience, the tag stands.
 * Pure: the caller records the outcome (`factor`) and any soured mood.
 */
export class Negotiation {
  readonly tag: number;
  private readonly floor: number;
  private patience: number;
  private counterPrice: number;
  private finished: { price: number } | null = null;
  private turn = 0;

  constructor(private readonly item: StockItem, private readonly mood: NegotiationMood) {
    this.tag = item.tagPrice;
    const kind = item.source === 'showpiece' || item.source === 'estate' ? 'showpiece' : item.condition === 'worn' ? 'worn' : 'ordinary';
    const [lo, hi] = NEGOTIATION.floor[kind];
    let share = lo + hash01(`${mood.day}:floor:${item.game.id}`) * (hi - lo);
    share += mood.soured * NEGOTIATION.moodPenalty + mood.loyalty * NEGOTIATION.loyalty;
    if (mood.coffee) share += NEGOTIATION.coffee.floor;
    if (mood.rain) share += NEGOTIATION.rain;
    this.floor = Math.max(1, Math.round(this.tag * Math.min(1, Math.max(NEGOTIATION.lowest, share))));
    this.patience = NEGOTIATION.patience - mood.soured + (mood.coffee ? NEGOTIATION.coffee.patience : 0);
    this.counterPrice = this.tag;
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

  /** The agreed price as a share of the tag, once done (1 when the stallholder walked). */
  get factor(): number {
    return this.finished ? this.finished.price / this.tag : 1;
  }

  /** The player offers `kind`. */
  offer(kind: OfferKind): Reply {
    if (this.finished) return { kind: 'accept', price: this.finished.price, line: `We already shook on ${this.finished.price} coins.` };
    const offered = this.offerPrice(kind);
    this.turn++;
    if (offered >= this.counterPrice) return this.close(this.counterPrice, ACCEPT);
    if (offered >= this.floor) return this.close(offered, ACCEPT);
    const insulted = offered < this.floor - this.tag * NEGOTIATION.insult;
    this.patience -= insulted ? 2 : 1;
    if (this.patience <= 0) {
      this.finished = { price: this.tag };
      return { kind: 'walk', price: this.tag, line: this.say(WALK, this.tag), insulted };
    }
    // Each counter halves the way down to the lowest price (never under it, never over the last one).
    const next = Math.max(this.floor, Math.round(this.floor + (this.counterPrice - this.floor) * (insulted ? 0.8 : 0.5)));
    this.counterPrice = Math.min(this.counterPrice, next);
    return { kind: 'counter', price: this.counterPrice, line: this.say(insulted ? INSULT : COUNTER, this.counterPrice), insulted };
  }

  /** The player takes the standing counter-offer. */
  acceptCounter(): Reply {
    if (this.finished) return { kind: 'accept', price: this.finished.price, line: `We already shook on ${this.finished.price} coins.` };
    return this.close(this.counterPrice, ACCEPT);
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
    const i = Math.floor(hash01(`${this.mood.day}:line:${this.item.game.id}:${this.turn}`) * lines.length);
    return lines[i]!.replace('{price}', `${price} coins`);
  }
}
