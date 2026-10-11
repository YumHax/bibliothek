import type { ErrandId } from '@/errands/errands';
import { KEYS, PersistedStore } from '@/persistence';
import { chance, integer, pick } from '@/random';
import { gameDayRandom } from '@/time/daily';

/*
 * PARK CORNER MANSIONS' BELLS (docs/economy.md "Small ads and the seller's flat", docs/social.md "Front Street and the
 * arcade"): twelve flats behind the brass plate on Front Street. Most days a ring gets a word over the intercom, or
 * nothing; some days one of them needs something from the shops (a favour: bring it, ring again, a few coins and
 * thanks), some days one of them is clearing out a cupboard and leaves a game or two on the step for whoever rang.
 * Drawn from the game day alone (a reload rings the same flats the same way); what was done is kept for the day.
 */

/** Who lives in the block, flat by flat (1 to 12), as the plate's cards say. */
export const MANSION_RESIDENTS = ['HALL', 'WARD', 'NOWAK', 'OKAFOR', 'PATEL', 'BELL', 'LINDQVIST', 'RUSSO', 'KOVAČ', 'MOREAU', 'DUBOIS', 'GREEN'] as const;

const ODDS = {
  /** Share of game days one flat asks a favour, and one has a find on the step. */
  favour: 0.4,
  find: 0.3,
  /** Share of the other rings answered at all. */
  answered: 0.55,
};
/** Coins a favour is thanked with, from .. to. */
const FAVOUR_COINS = [3, 7] as const;
/** Games left on the step on a find day, from .. to. */
const FIND_GAMES = [1, 2] as const;

/** What a favour asks for: something the street's counters sell (the pocket carries it over). */
const WANTS: readonly { item: ErrandId; asks: string; where: string }[] = [
  { item: 'croissant', asks: 'a croissant from the bakery', where: 'My knee won’t take the stairs today.' },
  { item: 'bunch', asks: 'a bunch of flowers from the florist’s', where: 'It’s my sister’s birthday and I forgot. Again.' },
  { item: 'coffee', asks: 'a coffee to take away from the café', where: 'The machine’s broken and I have a deadline.' },
  { item: 'cake', asks: 'a slice of cake from the café', where: 'Don’t tell my doctor.' },
];

/** What a ring gets at a flat with nothing on today. */
const PLAIN = [
  'A crackle, then: “Not today, thank you.”',
  '“Who? No, wrong bell, love. Try the one below.”',
  'A dog barks somewhere up there. Nobody answers.',
  '“If it’s about the bins, it wasn’t me.”',
  '“Hello? Hello? …These things never work.”',
  '“I’m in the bath. Whoever you are, no.”',
];
const NOBODY = ['Nobody home.', 'The bell rings somewhere up the stairs. Nothing.', 'No answer.'];

/** One day's doings at the Mansions: whose favour, whose find. */
interface MansionDay {
  favour: { flat: number; want: (typeof WANTS)[number]; coins: number } | null;
  find: { flat: number; games: number } | null;
}

/** Day `day`'s favour and find, the same on every reload. */
export function mansionDay(day: number): MansionDay {
  const rng = gameDayRandom('mansion-bells', day);
  const flats = MANSION_RESIDENTS.length;
  const favour = chance(rng, ODDS.favour) ? { flat: integer(rng, 0, flats - 1), want: pick(rng, WANTS), coins: integer(rng, FAVOUR_COINS[0], FAVOUR_COINS[1]) } : null;
  let find: MansionDay['find'] = null;
  if (chance(rng, ODDS.find)) {
    const flat = integer(rng, 0, flats - 1);
    if (flat !== favour?.flat) find = { flat, games: integer(rng, FIND_GAMES[0], FIND_GAMES[1]) };
  }
  return { favour, find };
}

/** What was done at the bells today. */
interface BellsState {
  day: number;
  /** The favour was asked over the intercom (the player knows what to bring). */
  asked: boolean;
  /** The favour was done (brought, thanked). */
  done: boolean;
  /** The find was put out on the step. */
  findOut: boolean;
  /** Games taken off the step today (their ids). */
  taken: string[];
}

const blank = (day: number): BellsState => ({ day, asked: false, done: false, findOut: false, taken: [] });

const store = new PersistedStore<BellsState>({
  key: KEYS.mansionBells,
  version: 1,
  defaults: () => blank(-1),
  read: (data) => {
    const d = data as Partial<BellsState> | null;
    if (!d || typeof d.day !== 'number') return null;
    return { day: d.day, asked: d.asked === true, done: d.done === true, findOut: d.findOut === true, taken: Array.isArray(d.taken) ? d.taken.filter((t): t is string => typeof t === 'string') : [] };
  },
});
let state: BellsState = store.load();

function today(day: number): BellsState {
  if (state.day !== day) state = blank(day);
  return state;
}

function save(next: BellsState): void {
  state = next;
  store.save(state);
}

/** The flat's caption on the plate: "4 OKAFOR". */
export function flatName(flat: number): string {
  return `${flat + 1} ${MANSION_RESIDENTS[flat] ?? ''}`.trim();
}

/** How a ring at `flat` on `day` goes: a line, and what it asks of the street (`carrying` says what the pocket holds). */
type BellAnswer =
  | { kind: 'line'; text: string }
  | { kind: 'asks'; text: string }
  | { kind: 'thanks'; text: string; coins: number; item: ErrandId }
  | { kind: 'find'; text: string; games: number };

/** The answer at `flat` on `day` (and what it changes for the day: a favour asked, the find put out). */
export function ringFlat(flat: number, day: number, carrying: (item: ErrandId) => boolean): BellAnswer {
  const s = today(day);
  const { favour, find } = mansionDay(day);
  const name = MANSION_RESIDENTS[flat] ?? '';
  if (favour && favour.flat === flat) {
    if (s.done) return { kind: 'line', text: `“Thank you again, dear. You’re a treasure.” (${name})` };
    if (s.asked && carrying(favour.want.item)) {
      save({ ...s, done: true });
      return { kind: 'thanks', text: `The door buzzes; ${name} comes down in slippers, takes it, and presses some coins into your hand. “You didn’t have to. But you did!”`, coins: favour.coins, item: favour.want.item };
    }
    if (!s.asked) save({ ...s, asked: true });
    return { kind: 'asks', text: `“Oh, a voice! Would you be a love and fetch me ${favour.want.asks}? ${favour.want.where} Ring again when you have it.” (${name})` };
  }
  if (find && find.flat === flat) {
    if (s.findOut) return { kind: 'line', text: `“Help yourself to what’s on the step, the rest goes to the charity shop.” (${name})` };
    save({ ...s, findOut: true });
    return { kind: 'find', text: `“Games? You’re the second one today… no, the first. My son’s, from when he was small. I’ll put them on the step: take what you like.” (${name})`, games: find.games };
  }
  const rng = gameDayRandom(`mansion-ring:${flat}`, day);
  return { kind: 'line', text: chance(rng, ODDS.answered) ? `${pick(rng, PLAIN)} (${name})` : pick(rng, NOBODY) };
}

/** Whether today's find was put out on the step (rung for), and the games taken off it. */
export function findOnStep(day: number): { out: boolean; taken: readonly string[] } {
  const s = today(day);
  return { out: s.findOut, taken: s.taken };
}

/** A game was taken off the step today. */
export function takeFromStep(day: number, id: string): void {
  const s = today(day);
  if (!s.taken.includes(id)) save({ ...s, taken: [...s.taken, id] });
}

/** A word on the street about the Mansions today (a passer-by's lead), or null: who is clearing out, or who needs a hand. */
export function mansionGossip(day: number): { id: string; says: string; note: string } | null {
  const { favour, find } = mansionDay(day);
  if (find) {
    const name = MANSION_RESIDENTS[find.flat] ?? '';
    return { id: `mansion-find:${day}`, says: `Mrs ${capital(name)} at Park Corner Mansions is clearing out her son’s room. Games and all. Ring her bell, number ${find.flat + 1}.`, note: `A passer-by: ${capital(name)}, bell ${find.flat + 1} at Park Corner Mansions, is clearing out a room, games and all.` };
  }
  if (favour) {
    const name = MANSION_RESIDENTS[favour.flat] ?? '';
    return { id: `mansion-favour:${day}`, says: `Old ${capital(name)} at the Mansions can’t get down the stairs today. Somebody should ring, number ${favour.flat + 1}.`, note: `A passer-by: ${capital(name)}, bell ${favour.flat + 1} at Park Corner Mansions, could use a hand today.` };
  }
  return null;
}

function capital(name: string): string {
  return name.charAt(0) + name.slice(1).toLowerCase();
}
