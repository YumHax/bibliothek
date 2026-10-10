import { KEYS, PersistedStore } from '@/persistence';
import { ESTATE_SALE } from '@/economy/pricing';
import { Negotiation } from '@/economy/haggle';
import type { StockItem } from '@/economy/StockItem';
import type { SaleDealer } from '@/game/SessionActions';
import { pinSource, refreshBoard, type BoardNote } from './boardNotes';
import { formatCoins } from '@/text/money';

/*
 * THE ESTATE SALE: Mr Henri Lambert, the third floor's courtyard flat, a collector nobody on the stairs ever saw
 * (a name on a mailbox, the best collection of the building, J.-P. Martin says), passed away. A notice of his death
 * goes up on the board (`ESTATE_SALE.mourning` game days before), then his family's notice of a sale (`notice` days
 * before), and for `days` days the family clears his flat in the entrance hall (`world/estateSale`): tables of
 * games to haggle over, a crate at the end with a grail at the bottom. Once only: when it is over, it is over. The
 * first day is fixed the first time a save reaches the mourning window (a save past it gets it shortly after), and
 * persists with what was bought.
 */

/** Where the sale stands on a game day. */
type EstatePhase = 'none' | 'mourning' | 'notice' | 'on' | 'over';

interface State {
  /** The sale's first game day, once decided. */
  start: number | null;
  /** The ids of the games the player bought off the tables. */
  sold: string[];
}

/** The late collector and his family, as the notices and the stall say them. */
export const ESTATE = {
  deceased: 'Mr Henri Lambert',
  surname: 'LAMBERT',
  flat: '3rd floor, courtyard side',
  family: 'Claire Lambert',
} as const;

const store = new PersistedStore<State>({ key: KEYS.estateSale, version: 1, defaults: () => ({ start: null, sold: [] }), read: readState });
let state: State = store.load();

function readState(data: unknown): State | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Partial<State>;
  return {
    start: typeof d.start === 'number' && Number.isFinite(d.start) ? d.start : null,
    sold: Array.isArray(d.sold) ? d.sold.filter((id): id is string => typeof id === 'string') : [],
  };
}

/** The sale's first game day, deciding it the first time `day` reaches the mourning window; null before that. */
export function estateStart(day: number): number | null {
  if (state.start !== null) return state.start;
  if (day < ESTATE_SALE.fromDay - ESTATE_SALE.mourning) return null;
  state = { ...state, start: Math.max(ESTATE_SALE.fromDay, day + ESTATE_SALE.mourning) };
  store.save(state);
  return state.start;
}

/** `?debug`: the sale opens on game day `day` (its notice and mourning taken as past). */
export function forceEstateSale(day: number): void {
  state = { ...state, start: day };
  store.save(state);
}

/** Where the sale stands on game day `day`. */
export function estatePhase(day: number): EstatePhase {
  const start = estateStart(day);
  if (start === null || day < start - ESTATE_SALE.mourning) return 'none';
  if (day < start - ESTATE_SALE.notice) return 'mourning';
  if (day < start) return 'notice';
  return day < start + ESTATE_SALE.days ? 'on' : 'over';
}

/** Whether the player bought `id` off the tables (it is not laid again). */
export function estateSold(id: string): boolean {
  return state.sold.includes(id);
}

/** The player bought `id` (handed back: `sold` false). */
function markEstateSold(id: string, sold = true): void {
  const has = state.sold.includes(id);
  if (sold === has) return;
  state = { ...state, sold: sold ? [...state.sold, id] : state.sold.filter((s) => s !== id) };
  store.save(state);
}

/** What the family says to a hold, a part exchange, a second haggle. */
const REFUSALS = {
  hold: 'We can’t keep anything back, sorry: it all has to go by Sunday.',
  swap: 'Oh, no more games, please. We’re trying to empty the flat.',
  again: 'We agreed on a price already.',
};

/**
 * The family's rules at the counter (`ForSaleLike.dealer`, as `classifieds/dealer`): a haggle is the market's
 * `Negotiation`, a family in no mood to argue long (a little patience, a little give), once per copy (remembered
 * for the sale, with the insults that sour them); no holds, no swaps; what is bought is not laid again.
 */
export class EstateDealer implements SaleDealer {
  private readonly haggles = new Map<string, number>();
  private soured = 0;

  constructor(private readonly today: () => number) {}

  get day(): number {
    return this.today();
  }

  readonly noHold = REFUSALS.hold;
  readonly noSwap = REFUSALS.swap;

  canNegotiate(item: StockItem): boolean {
    return item.priced && !this.haggles.has(item.game.id) && Negotiation.patienceFor(this.soured, false) + ESTATE_HAGGLE.patience > 0;
  }

  negotiate(item: StockItem): Negotiation | { line: string } {
    if (!item.priced) return { line: 'Let me look it up, my uncle kept a list somewhere…' };
    if (this.haggles.has(item.game.id)) return { line: `${REFUSALS.again} ${formatCoins(item.price)}.` };
    if (Negotiation.patienceFor(this.soured, false) + ESTATE_HAGGLE.patience <= 0) return { line: `I think we’ve haggled enough today. ${formatCoins(item.price)}.` };
    const negotiation = new Negotiation(item, { day: this.day, soured: this.soured, loyalty: 0, coffee: false, rain: false });
    negotiation.ease(ESTATE_HAGGLE);
    return negotiation;
  }

  settle(item: StockItem, negotiation: Negotiation, insults: number): void {
    this.haggles.set(item.game.id, negotiation.factor);
    this.soured += insults;
    item.setHaggle(negotiation.factor);
  }

  sold(item: StockItem): void {
    markEstateSold(item.game.id);
  }

  unsold(item: StockItem): void {
    markEstateSold(item.game.id, false);
  }
}

/** How a grieving family haggles: they give a little more and listen a little longer than a stallholder. */
const ESTATE_HAGGLE = { floor: -0.05, patience: 1 };

/** The day's notes on the hall's board: his death, then the sale's notice, the sale on, the family's thanks. */
function notes(day: number): BoardNote[] {
  const phase = estatePhase(day);
  const start = state.start;
  if (phase === 'none' || start === null) return [];
  const out: BoardNote[] = [];
  const dayName = (d: number) => (d === day ? 'today' : d === day + 1 ? 'tomorrow' : `in ${d - day} days`);
  if (phase === 'mourning' || phase === 'notice') {
    out.push({
      id: 'estate-mourning',
      title: 'In memoriam',
      lines: [`${ESTATE.deceased}, ${ESTATE.flat},`, 'passed away peacefully at the age of 88.', 'His family thanks the neighbours for their kind words.'],
      paper: 0xf4f1ea,
      signed: 'The family',
      weight: 2,
    });
  }
  if (phase === 'notice' || phase === 'on') {
    const last = start + ESTATE_SALE.days - 1;
    out.push({
      id: 'estate-sale',
      title: 'Estate sale · entrance hall',
      lines: phase === 'on'
        ? [`On now, until ${last === day ? 'tonight' : last === day + 1 ? 'tomorrow night' : 'the day after tomorrow'}.`,'His games, all of them: forty years of collecting.', 'Make us an offer. Everything must go.']
        : [`From ${dayName(start)}, for ${ESTATE_SALE.days} days, in the hall.`, `My uncle’s collection: video games, cartridges, boxes.`, 'Everything must go. Prices to discuss.'],
      paper: 0xfff3c8,
      signed: ESTATE.family,
      weight: 3,
    });
  }
  if (phase === 'over' && day < start + ESTATE_SALE.days + 3) {
    out.push({ id: 'estate-thanks', title: 'Thank you', lines: ['To everyone who came by the hall:', 'his games found good homes. He would have liked that.'], signed: ESTATE.family, weight: 1 });
  }
  return out;
}

/** Pins the sale's notes on the hall's board (once; the stairwell does it as it is built). Returns the unpin. */
export function pinEstateNotes(): () => void {
  const unpin = pinSource('estateSale', notes);
  refreshBoard();
  return unpin;
}
