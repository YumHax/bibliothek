import { KEYS, PersistedStore } from '@/persistence';
import type { HomeUpgrade } from '@/economy/homeGoods';
import type { MailPiece } from '@/world/props/MailDrop';
import { pinSource, refreshBoard, type BoardNote } from './boardNotes';

/*
 * MRS ROUX'S MOVE: our neighbour on the 5th floor (the other door on our landing) grows tired of the stairs, her
 * daughter wants her near her in Lyon, and her flat goes up for sale: two rooms on the street, behind the collection
 * room's right wall (they were one flat with ours once, the door between them condemned). The player buys it (the
 * 'annex' home good, the sign on her door); she moves out that day, the wall is knocked through the next, and from the
 * day after the two rooms are ours (`world/annex/`). Days are game days (`Today.gameDay`), so the arc is the same
 * whatever the real date. A module-level store, so the stairs, the living room and the annex read one state.
 */

/** When the arc starts (game day) and when the flat goes on sale; how long her thank-you stays on the board. */
const ROUX_MOVE = { thinkingFrom: 15, forSaleFrom: 19, thanksDays: 4, postcardAfter: 3 } as const;

/**
 * Where the arc stands: `settled` (as ever), `thinking` (the stairs are hard, Lyon), `forSale` (the agency's sign on
 * her door), `moving` (bought: the removal men on the landing; she leaves tonight), `works` (the wall coming down),
 * `joined` (the two rooms are the flat's).
 */
export type RouxPhase = 'settled' | 'thinking' | 'forSale' | 'moving' | 'works' | 'joined';

interface State {
  /** The game day the player bought the flat, null before (or bought by `?debug`'s furnished flat: joined). */
  boughtDay: number | null;
  /** Her farewell letter slipped under the door, the postcard from Lyon: once each. */
  farewell: boolean;
  postcard: boolean;
}

/** What the move needs of the game: the day, what was bought, the doorstep the notes go under. */
interface RouxMoveDeps {
  today: { readonly gameDay: number; onNewGameDay(cb: (day: number) => void): () => void };
  upgrades?: { has(upgrade: HomeUpgrade): boolean; subscribe(cb: () => void): () => void };
  doorstep?: { slipNote(piece: MailPiece): void };
}

/** Her door on our landing (`stairwell/building.doorKey(0, 0)`). */
const ROUX_DOOR = '0:0';

const LINES: Partial<Record<RouxPhase, string[]>> = {
  thinking: [
    'The stairs are getting harder, young man. Even with the lift.',
    'My daughter wants me near her, in Lyon. She is probably right, she usually is.',
    'Forty-one years in this building. Imagine. I came with my husband in 1985.',
  ],
  forSale: [
    'I am selling, you know. The agency put a sign on my door.',
    'Your wall and mine are the same wall. The two flats were one, before the war: there is a door in it, painted over.',
    'Would you want it? Two rooms on the street. With all those boxes of yours, you need the room.',
  ],
  moving: [
    'So it is you! I am so glad. Look after my parquet, it was waxed every spring.',
    'The removal men break everything. Mind the boxes on the landing.',
    'I leave tonight. Lyon! I will send you a postcard.',
  ],
};

let store: PersistedStore<State> | null = null;
let state: State | null = null;
let deps: RouxMoveDeps | null = null;
let shown: RouxPhase | null = null;
let nextLine = 0;
const listeners = new Set<(phase: RouxPhase) => void>();

function loaded(): State {
  if (state) return state;
  store = new PersistedStore<State>({ key: KEYS.rouxMove, version: 1, defaults: () => ({ boughtDay: null, farewell: false, postcard: false }), read: readState });
  state = store.load();
  return state;
}

function readState(data: unknown): State | null {
  if (!data || typeof data !== 'object') return null;
  const { boughtDay, farewell, postcard } = data as Partial<Record<keyof State, unknown>>;
  return { boughtDay: typeof boughtDay === 'number' && Number.isFinite(boughtDay) ? boughtDay : null, farewell: farewell === true, postcard: postcard === true };
}

/**
 * Hands the move what it needs (every builder that shows part of it calls this; the first wires it, a later one only
 * adds the doorstep if the first had none). Pins its notes on the hall's board.
 */
export function bindRouxMove(next: RouxMoveDeps): void {
  if (deps) {
    if (!deps.doorstep && next.doorstep) {
      deps = { ...deps, doorstep: next.doorstep };
      sendNotes();
    }
    return;
  }
  deps = next;
  shown = rouxPhase();
  next.today.onNewGameDay(changed);
  next.upgrades?.subscribe(changed);
  pinSource('rouxMove', boardNotes);
  sendNotes();
}

/** Where the arc stands on game day `day` (today by default); `settled` until the move is bound. */
export function rouxPhase(day: number | undefined = deps?.today.gameDay): RouxPhase {
  if (!deps || day === undefined) return 'settled';
  if (deps.upgrades?.has('annex')) {
    const bought = loaded().boughtDay;
    if (bought === null) return 'joined';
    if (day <= bought) return 'moving';
    return day === bought + 1 ? 'works' : 'joined';
  }
  if (day < ROUX_MOVE.thinkingFrom) return 'settled';
  return day < ROUX_MOVE.forSaleFrom ? 'thinking' : 'forSale';
}

/** Whether the two rooms are the flat's now (the wall knocked through). */
export function annexJoined(): boolean {
  return rouxPhase() === 'joined';
}

/** Whether Mrs Roux has left the building (never met on the stairs again, nobody behind her door). */
export function rouxGone(): boolean {
  const phase = rouxPhase();
  return phase === 'works' || phase === 'joined';
}

/** For the stairs' residents (`Neighbours.gone`): whether whoever lived behind door `key` has left the building. */
export function movedOut(key: string): boolean {
  return key === ROUX_DOOR && rouxGone();
}

/** For the stairs' residents (`Neighbours.says`): what the resident behind `key` says of her move, in turn, or null. */
export function movingLine(key: string): string | null {
  return key === ROUX_DOOR ? rouxSays() : null;
}

/** Calls `cb` with the new phase whenever it changes (a new day, the purchase); returns the unsubscribe. */
export function onRouxPhase(cb: (phase: RouxPhase) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** The purchase, in the same save as the coins going (`Transactions.buyHomeGood`'s `bought`): the move starts today. */
export function markRouxBought(): void {
  if (!deps) return;
  const s = loaded();
  s.boughtDay = deps.today.gameDay;
  store!.save(s);
}

/** What Mrs Roux says of her move when chatted to on the stairs, in turn (null: her own lines). */
function rouxSays(): string | null {
  const lines = LINES[rouxPhase()];
  if (!lines) return null;
  return lines[nextLine++ % lines.length]!;
}

function changed(): void {
  const phase = rouxPhase();
  sendNotes();
  if (phase === shown) return;
  shown = phase;
  refreshBoard();
  for (const cb of [...listeners]) cb(phase);
}

/** Her letters under the door: the farewell on moving day, the postcard from Lyon a few days after. */
function sendNotes(): void {
  const doorstep = deps?.doorstep;
  if (!doorstep || !deps) return;
  const s = loaded();
  const phase = rouxPhase();
  if (!s.farewell && (phase === 'moving' || phase === 'works')) {
    s.farewell = true;
    store!.save(s);
    doorstep.slipNote({ title: 'MME ROUX, 5TH FLOOR', lines: ['Thank you, young man.', 'The keys are with the agency.', 'Look after my flat, it was ours.'], accent: 0x7a4a5a, seed: 31 });
  }
  const bought = s.boughtDay;
  if (!s.postcard && phase === 'joined' && bought !== null && deps.today.gameDay >= bought + 1 + ROUX_MOVE.postcardAfter) {
    s.postcard = true;
    store!.save(s);
    doorstep.slipNote({ title: 'GREETINGS FROM LYON', lines: ['The flat here is on the ground floor!', 'My daughter sends her regards.', 'Have you filled my two rooms yet? H. Roux'], accent: 0x3a6a8a, seed: 32 });
  }
}

/** The board: the agency's notice while it is for sale, the removal and the works, then her thank-you for a few days. */
function boardNotes(day: number): BoardNote[] {
  const phase = rouxPhase(day);
  switch (phase) {
    case 'forSale':
      return [{ id: 'roux-sale', title: 'FOR SALE · 5TH FLOOR, RIGHT', lines: ['Two rooms on the street, 31 m²', 'Parquet, mouldings, marble fireplace', 'Duval & Fils, estate agents', 'Ask at the door: the sign is on it'], paper: 0xf2e6a8, signed: 'Duval & Fils', weight: 2 }];
    case 'moving':
      return [{ id: 'roux-removal', title: 'REMOVAL TODAY · 5TH FLOOR', lines: ['The lift may be busy all day.', 'Sorry for the boxes on the landing.'], paper: 0xe8eef2, signed: 'Duval Removals', weight: 3 }];
    case 'works':
      return [{ id: 'roux-works', title: 'WORKS · 5TH FLOOR', lines: ['Knocking through between two flats', 'Noise from 8:00 to 18:00', 'Thank you for your patience'], paper: 0xf4d9c0, signed: 'The syndic', weight: 3 }];
    case 'joined': {
      const bought = loaded().boughtDay;
      if (bought === null || day > bought + 1 + ROUX_MOVE.thanksDays) return [];
      return [{ id: 'roux-thanks', title: 'THANK YOU, ALL', lines: ['Forty-one years in this house.', 'Look after the old lift for me.'], paper: 0xf6eef2, signed: 'Hélène Roux, now in Lyon', weight: 1 }];
    }
    default:
      return [];
  }
}
