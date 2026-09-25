import { KEYS, PersistedStore } from '@/persistence';
import { DailyTally } from '../DailyTally';

/*
 * The tabac's scratch card, GRATTE-PIXEL: six silver cells, three matching symbols win that
 * symbol's prize. The outcome is drawn first (odds below, a little under the card's price on
 * average: the house wins), then the symbols are laid to show it.
 */

/** What a card costs, and how many the tabac sells one player in a (real) day. */
export const SCRATCH_PRICE = 2;
export const SCRATCH_PER_DAY = 5;

/** A symbol and the coins three of them pay. */
export interface ScratchSymbol {
  glyph: string;
  name: string;
  prize: number;
}

export const SYMBOLS: readonly ScratchSymbol[] = [
  { glyph: '🍒', name: 'cherries', prize: 2 },
  { glyph: '🎮', name: 'pads', prize: 3 },
  { glyph: '💾', name: 'cartridges', prize: 5 },
  { glyph: '⭐', name: 'stars', prize: 10 },
  { glyph: '7', name: 'sevens', prize: 25 },
];

/** Chance of each outcome: a loss, then three of `SYMBOLS[i]` (expected payout 1.35 coins a card). */
const ODDS = { lose: 0.62, win: [0.2, 0.09, 0.06, 0.025, 0.005] } as const;

export interface ScratchCard {
  /** The six cells, left to right, top to bottom. */
  cells: ScratchSymbol[];
  /** The winning symbol, or null. */
  win: ScratchSymbol | null;
}

/** Draws a card with `random` (0..1). */
export function drawCard(random: () => number): ScratchCard {
  let r = random();
  let win: ScratchSymbol | null = null;
  if (r >= ODDS.lose) {
    r -= ODDS.lose;
    for (let i = 0; i < ODDS.win.length; i++) {
      if (r < ODDS.win[i]!) {
        win = SYMBOLS[i]!;
        break;
      }
      r -= ODDS.win[i]!;
    }
    win ??= SYMBOLS[0]!;
  }
  const cells: ScratchSymbol[] = [];
  const counts = new Map<ScratchSymbol, number>();
  const put = (symbol: ScratchSymbol): void => {
    cells.push(symbol);
    counts.set(symbol, (counts.get(symbol) ?? 0) + 1);
  };
  if (win) for (let i = 0; i < 3; i++) put(win);
  // The rest: never a third of anything (a loss shows pairs at most, a win only its own three).
  while (cells.length < 6) {
    const symbol = SYMBOLS[Math.floor(random() * SYMBOLS.length)]!;
    if (symbol === win || (counts.get(symbol) ?? 0) >= 2) continue;
    put(symbol);
  }
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [cells[i], cells[j]] = [cells[j]!, cells[i]!];
  }
  return { cells, win };
}

/** `{ day, cards }` under `KEYS.scratch` (without storage, private mode, the limit does not hold). */
const bought = new DailyTally(KEYS.scratch, 'cards');

/** Cards bought today (remembered across reloads). */
export function cardsToday(): number {
  return bought.today();
}

export function recordCard(): void {
  bought.add();
}

/** A card paid for and not yet all scratched: its seed (`drawCard(seededRandom(seed))`) and the cells cleared so far. */
export interface CardInProgress {
  seed: number;
  revealed: boolean[];
}

/** The card in hand, kept across reloads so a card paid for is never lost (the tabac hands it back). */
const inProgress = new PersistedStore<CardInProgress | null>({
  key: KEYS.scratchCard,
  version: 1,
  defaults: () => null,
  read: (data) => {
    if (data === null) return null;
    if (typeof data !== 'object') return null;
    const { seed, revealed } = data as Partial<CardInProgress>;
    if (typeof seed !== 'number' || !Number.isFinite(seed) || !Array.isArray(revealed)) return null;
    return { seed, revealed: revealed.map((r) => r === true) };
  },
});

/** The card paid for and not finished, if any. */
export function cardInProgress(): CardInProgress | null {
  return inProgress.load();
}

export function keepCardInProgress(card: CardInProgress | null): void {
  if (card) inProgress.save(card);
  else inProgress.remove();
}
