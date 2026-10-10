import { KEYS, PersistedStore } from '@/persistence';
import type { Game, PlatformId } from '@/catalog/types';
import { SEED_GAMES } from '@/catalog';
import { gameDayRandom } from '@/time/daily';
import { weekdayOf } from '@/time/wakefulness';
import { inHours } from '@/time/clock';
import { between, chance, pick } from '@/random';
import { pointsPerTicket } from '@/economy/pricing';
import { effectValue } from '@/social/perks';
import { isPartyDay } from '../neighboursParty';
import { KIDS, KIDS_RULES, type KidId, type KidPlan } from './kidsPlan';

/*
 * The courtyard's kids (docs/building.md "The kids in the yard"): who is down when, what is in their pencil case this
 * week, how a kid weighs a swap (how famous a game is, never what it is worth: a rare cart goes for a big name), the
 * score to beat on their handheld, and what is kept of it all (the carts swapped away this week, the player's games
 * they got, how much they have practised since losing). The world's `courtyard/YardKids` puts them in the yard.
 */

const R = KIDS_RULES;

/** Whose pencil case a kid swaps from: their own, or the one they share (the twins'). */
function pouchOf(kid: KidPlan): KidId {
  return kid.shares ?? kid.id;
}

/** The game week a day falls in: a pencil case's carts change from one to the next. */
function weekOf(day: number): number {
  return Math.floor(day / 7);
}

/** A game day `?debug` sent every kid down, whatever the hour and the weather (this page only). */
let forcedDay: number | null = null;

/** `?debug`: every kid is down in the yard today, now (the yard sees it within a second). */
export function forceKidsOut(day: number): void {
  forcedDay = day;
}

/** The sky as the kids read it from the yard. */
interface YardSky {
  rain: number;
  daylight: number;
}

/** The windows the kids may be down in on `day` (game hours): after school, Wednesday afternoons, weekends. */
function windowsOf(day: number): readonly (readonly [number, number])[] {
  const weekday = weekdayOf(day);
  if (weekday >= 5) return R.hours.weekend;
  return weekday === 2 ? R.hours.wednesday : R.hours.school;
}

/**
 * The kids down in the yard at `hours` of `day`: never on the neighbours' party (the yard is the grown-ups'), never in
 * the rain nor after dark; each comes down most days (drawn per kid and day, the twins together), a little after the
 * window opens, and goes up a little before it shuts. Lina only on Wednesdays and weekends.
 */
export function kidsOut(day: number, hours: number, sky: YardSky, date: Date): KidPlan[] {
  if (day === forcedDay) return [...KIDS];
  if (isPartyDay(day, date) || sky.rain > R.rainOver || sky.daylight < R.daylightUnder) return [];
  const weekday = weekdayOf(day);
  const free = weekday === 2 || weekday >= 5;
  return KIDS.filter((kid) => {
    if (kid.days === 'free' && !free) return false;
    const random = gameDayRandom(`kids:${pouchOf(kid)}`, day);
    if (!chance(random, R.comesDown)) return false;
    const late = random() * R.late;
    const early = random() * R.early;
    return windowsOf(day).some(([from, to]) => inHours(hours, { from: from + late, to: to - early }));
  });
}

/** What is kept: the carts gone from each pencil case this week, the player's games they got, their practice, the carts handed over. */
interface State {
  week: number;
  /** `<pouch>:<game id>`: carts swapped away this game week (they come back next week, as new ones). */
  gone: string[];
  /** The player's games a kid swapped for this week: in their case now (they show them off, and would swap them back). */
  got: { pouch: KidId; game: Game }[];
  /** How many times the player beat each kid: they practise. */
  practice: Partial<Record<KidId, number>>;
  /** Who handed the player a cart this week. */
  bored: KidId[];
}

const store = new PersistedStore<State>({
  key: KEYS.yardKids,
  version: 1,
  defaults: () => ({ week: 0, gone: [], got: [], practice: {}, bored: [] }),
  read: (data) => {
    const d = data as Partial<State> | null;
    if (!d || typeof d.week !== 'number') return null;
    const strings = (list: unknown): string[] => (Array.isArray(list) ? list.filter((s): s is string => typeof s === 'string') : []);
    const got = Array.isArray(d.got) ? d.got.filter((g) => g && typeof g.pouch === 'string' && g.game && typeof g.game.id === 'string') : [];
    return { week: d.week, gone: strings(d.gone), got, practice: d.practice && typeof d.practice === 'object' ? d.practice : {}, bored: strings(d.bored) as KidId[] };
  },
});
let state: State = store.load();

/** The state for `day`'s week: a new week empties the pencil cases' memory (the practice stays). */
function weekState(day: number): State {
  const week = weekOf(day);
  if (state.week !== week) {
    state = { ...state, week, gone: [], got: [], bored: [] };
    store.save(state);
  }
  return state;
}

/** Draws `count` games of `platforms` from the market's index, the same for the same seed. */
export type CartDraw = (seed: string, count: number, platforms: readonly PlatformId[]) => Promise<Game[]>;

/**
 * What is in `kid`'s pencil case on `day`: drawn per game week from the market's index for their platforms (loose,
 * played to death), sometimes with a big hit of theirs among them, less what they swapped away this week, plus the
 * player's games they swapped for. The same carts all week.
 */
export async function kidCarts(kid: KidPlan, day: number, draw: CartDraw): Promise<Game[]> {
  const pouch = pouchOf(kid);
  const week = weekOf(day);
  const random = gameDayRandom(`kid-carts:${pouch}`, week);
  const drawn = await draw(`kids:${week}:${pouch}`, R.carts + 3, kid.carts).catch(() => [] as Game[]);
  const hits = SEED_GAMES.filter((g) => kid.carts.includes(g.platform) && !g.bootleg);
  const hit = hits.length && chance(random, R.hitChance) ? [pick(random, hits)] : [];
  const { gone, got } = weekState(day);
  const unique = [...new Map([...hit, ...drawn].map((g) => [g.id, g])).values()];
  const fresh = unique
    .filter((g) => !gone.includes(`${pouch}:${g.id}`))
    .slice(0, R.carts)
    .map((g): Game => ({ ...g, status: 'owned', condition: 'worn' }));
  return [...fresh, ...got.filter((g) => g.pouch === pouch && !gone.includes(`${pouch}:${g.game.id}`) && !fresh.some((f) => f.id === g.game.id)).map((g) => g.game)];
}

/** How many people read about a game a month (`economy/Fame`): null for no article, undefined while unknown. */
type Views = number | null | undefined;

/** What `game` is worth to `kid`: how famous it is (`R.weigh`), a big name hyped, a cart for another machine less, their own more. */
function weigh(kid: KidPlan, game: Pick<Game, 'title' | 'platform'>, views: Views, own: boolean): number {
  let worth = views === undefined ? R.weigh.unknown : views === null ? R.weigh.unheard : Math.max(R.weigh.unheard, views);
  if (R.hyped.test(game.title)) worth *= R.weigh.hype;
  if (!kid.carts.includes(game.platform)) worth *= R.weigh.otherMachine;
  if (own) worth *= R.weigh.own;
  return worth;
}

/** A kid's answer to an offer: a deal, a deal with tickets thrown in, or no (and what put them off). */
export type KidVerdict = { kind: 'yes' } | { kind: 'more'; tickets: number } | { kind: 'no'; why: 'unheard' | 'otherMachine' | 'plain' };

/** `kid` weighs the player's `mine` against their `theirs` (each with its views); a friend of theirs swaps more easily. */
export function judgeSwap(kid: KidPlan, mine: { game: Game; views: Views }, theirs: { game: Game; views: Views }): KidVerdict {
  const ratio = weigh(kid, mine.game, mine.views, false) / weigh(kid, theirs.game, theirs.views, true) / effectValue(kid.id, 'easySwaps', 1);
  if (ratio >= R.yes) return { kind: 'yes' };
  if (ratio >= R.more) {
    const short = (R.yes - ratio) / (R.yes - R.more);
    return { kind: 'more', tickets: R.tickets[Math.min(R.tickets.length - 1, Math.floor(short * R.tickets.length))]! };
  }
  if (mine.views === null) return { kind: 'no', why: 'unheard' };
  return { kind: 'no', why: kid.carts.includes(mine.game.platform) ? 'plain' : 'otherMachine' };
}

/** The swap was made on `day`: `theirs` leaves the pencil case for the week, the player's `mine` goes in it. */
export function swappedWithKid(kid: KidPlan, theirs: Game, mine: Game, day: number): void {
  const s = weekState(day);
  const pouch = pouchOf(kid);
  state = { ...s, gone: [...s.gone, `${pouch}:${theirs.id}`], got: [...s.got.filter((g) => g.game.id !== theirs.id && g.game.id !== mine.id), { pouch, game: mine }] };
  store.save(state);
}

/** The score `kid` holds on their handheld today: their skill drawn for the day, grown by the practice of every loss to the player. */
export function kidScore(kid: KidPlan, day: number): number {
  const tickets = between(gameDayRandom(`kid-score:${kid.id}`, day), kid.skill[0], kid.skill[1]);
  const grown = Math.min(R.practiceCap, 1 + (state.practice[kid.id] ?? 0) * R.practice);
  return Math.round(tickets * grown * pointsPerTicket(kid.game));
}

/** The player beat `kid` on `day`: they will practise; the week's first loss, sometimes they hand over a cart they are bored of. */
export function beatKid(kid: KidPlan, day: number): { bored: boolean } {
  const s = weekState(day);
  const pouch = pouchOf(kid);
  const first = !s.bored.includes(pouch);
  const bored = first && chance(gameDayRandom(`kid-bored:${kid.id}`, day), R.boredCart);
  state = { ...s, practice: { ...s.practice, [kid.id]: (s.practice[kid.id] ?? 0) + 1 }, bored: bored ? [...s.bored, pouch] : s.bored };
  store.save(state);
  return { bored };
}

/** `kid` handed the player `cart` on `day` (bored of it): out of the pencil case for the week. */
export function cartHandedOver(kid: KidPlan, cart: Game, day: number): void {
  const s = weekState(day);
  state = { ...s, gone: [...s.gone, `${pouchOf(kid)}:${cart.id}`] };
  store.save(state);
}
