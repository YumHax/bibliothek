import { GRAIL, NEGOTIATION, STICKER, hash01 } from './pricing';
import type { StockItem } from './StockItem';

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
  "We're done haggling. {price}, my last word.",
  "You've worn me out. {price}, not a coin less.",
];

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

  constructor(private readonly item: StockItem, private readonly mood: NegotiationMood) {
    this.tag = item.tagPrice;
    const kind = item.source === 'showpiece' || item.source === 'estate' || item.source === 'grail' ? 'showpiece' : item.condition === 'worn' ? 'worn' : 'ordinary';
    const [lo, hi] = NEGOTIATION.floor[kind];
    this.drawn = lo + hash01(`${mood.day}:floor:${item.game.id}`) * (hi - lo) + mood.soured * NEGOTIATION.moodPenalty;
    this.sway = mood.loyalty * NEGOTIATION.loyalty + (mood.coffee ? NEGOTIATION.coffee.floor : 0) + (mood.rain ? NEGOTIATION.rain : 0);
    this.share = this.swayed();
    this.floor = this.floorFor(this.share);
    this.patience = Negotiation.patienceFor(mood.soured, mood.coffee);
    this.counterPrice = this.tag;
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
    const share = this.drawn + Math.max(-NEGOTIATION.maxSway, this.sway);
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
    if (this.finished) return { kind: 'accept', price: this.finished.price, line: `We already shook on ${this.finished.price} coins.` };
    const offered = this.offerPrice(kind);
    this.turn++;
    if (offered >= this.counterPrice) return this.close(this.counterPrice, ACCEPT);
    if (offered >= this.floor) return this.close(offered, ACCEPT);
    const insulted = offered < this.floor - this.tag * NEGOTIATION.insult;
    this.patience -= insulted ? 2 : 1;
    if (this.patience <= 0) {
      // Take it or leave it: the last counter-offer stands, as when the player walks off (so walking off never beats this).
      this.finished = { price: this.counterPrice };
      return { kind: 'walk', price: this.counterPrice, line: this.say(WALK, this.counterPrice), insulted };
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
