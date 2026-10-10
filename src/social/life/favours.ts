import type { Game, GameStatus } from '@/catalog/types';
import type { NoticeActions } from '@/notices';
import { gameDayRandom } from '@/time/daily';
import { NEIGHBOUR_HOSTS } from '@/world/neighbourFlat/neighbourFlatPlan';
import { onInteraction } from '../conversation';
import { addExtras } from '../extras';
import { giftName } from '../gifts';
import { everyone, findPerson, personAtDoor, shortName } from '../people';
import { isMet, lastCounted, nudge, onSocial, standing } from '../standing';
import type { TalkExtra } from '../talk';
import { atLeast, tierOf, tierRank } from '../tiers';
import type { PersonCard, PersonId } from '../types';
import { AMENDS_LINES, FAVOUR_DAYS, FAVOUR_EXTRAS, FAVOUR_LINES, FAVOURS, FETCHABLE } from './favoursPlan';
import { life, saveLife, type Favour, type FavourKind } from './lifeStore';

/*
 * Favours (docs/social.md "Favours"): on a game day a few people the player knows have something to ask. It comes
 * up in conversation ("What can I do for you?"), the player takes it on or not; done, it is the surest way to their
 * trust (and sometimes a few coins); let lapse after a yes, it costs a little. Someone cross with the player offers
 * one way to make up, once. Completion is read from what the player does anyway: a gift given in the panel, a game
 * given, a knock on their door, the lodge's parcel carried up.
 */

/** What favours need of the game. */
export interface FavourDeps {
  day(): number;
  onNewDay(cb: (day: number) => void): void;
  /** The seed catalogue, for a game they hunt. */
  catalogue: readonly Game[];
  collection: { readonly games: readonly Game[]; owns(id: string): boolean; find(id: string): Game | undefined; setStatus(id: string, status: GameStatus): void };
  /** Whether a game may leave the shelf (not a keepsake). */
  lendable(game: Game): boolean;
  wallet: { earnCoins(coins: number): void };
  notices: Pick<NoticeActions, 'tip' | 'reward' | 'slip' | 'read'>;
  /** A line in the day's journal: a favour taken on is a small thing (`note`), its outcome an ordinary line. */
  note(text: string, weight?: 'line' | 'note'): void;
}

/** The person the lodge's parcels are collected from. */
const CONCIERGE = 'pereira';

let deps: FavourDeps | null = null;

/** Starts the favours: the day's offers, the extras in conversations, completion from what the player does. */
export function startFavours(d: FavourDeps): void {
  deps = d;
  settle(d.day());
  d.onNewDay((day) => settle(day));
  addExtras((ctx) => extrasOf(ctx.person, ctx.day));
  onInteraction((id, interaction, outcome, ctx, extra) => {
    if (interaction !== 'giveGift' && interaction !== 'giveGame') return;
    const f = open(id).find((x) => x.accepted !== null && ((x.kind === 'fetch' && interaction === 'giveGift' && extra.gift === x.thing) || (x.kind === 'findGame' && interaction === 'giveGame' && extra.game?.title === x.game?.title)));
    if (!f) return;
    outcome.line = fill(FAVOUR_LINES[f.kind].thanks, f);
    complete(f, ctx.day);
  });
  // A knock on their door (`neighbourFlat/visits` counts it for the asker) answers a check-in.
  onSocial((change) => {
    for (const f of open(change.id)) if (f.kind === 'checkIn' && f.accepted !== null && (lastCounted(f.person, 'knock') ?? -1) > f.accepted) complete(f, d.day());
  });
}

/** The favours with `id` still going (offered or accepted, not ended). */
function open(id: PersonId): Favour[] {
  return life().favours.filter((f) => f.person === id && f.done === undefined && f.failed === undefined && !f.declined);
}

/** Every accepted favour still to do (the People book, the debug table). */
export function favoursToDo(): readonly Favour[] {
  return life().favours.filter((f) => f.accepted !== null && f.done === undefined && f.failed === undefined && !f.declined);
}

/** What a favour asks, as the To-do says it. */
export function todoText(f: Favour): string {
  return fill(FAVOUR_LINES[f.kind].todo, f);
}

function fill(text: string, f: Favour): string {
  return text
    .replaceAll('{thing}', f.thing ? giftName(f.thing) : 'something')
    .replaceAll('{game}', f.game?.title ?? 'a game')
    .replaceAll('{name}', shortName(f.person));
}

/** A new game day: lapsed offers go, missed favours cost, lent games come back, new offers are drawn. */
function settle(day: number): void {
  const state = life();
  for (const f of state.favours) {
    if (f.done !== undefined || f.failed !== undefined || f.declined) continue;
    if (f.accepted === null) {
      if (day > f.day + FAVOURS.offerDays) f.declined = true;
      continue;
    }
    if (f.kind === 'lend' && f.stage === 1 && f.back !== undefined && day >= f.back) {
      bringBack(f, day);
      continue;
    }
    if (day > f.due && !(f.kind === 'lend' && f.stage === 1)) fail(f, day);
  }
  // Keep the last few dozen ended.
  if (state.favours.length > 60) state.favours = state.favours.filter((f, i) => i >= state.favours.length - 40 || (f.done === undefined && f.failed === undefined && !f.declined));
  draw(day);
  saveLife();
}

/** The day's new offers: someone met and warm enough, without a favour going, now and then. */
function draw(day: number): void {
  const state = life();
  if (state.favours.some((f) => f.day === day && !f.amends)) return;
  let made = 0;
  for (const card of everyone()) {
    if (made >= FAVOURS.perDay) break;
    if (!isMet(card.id) || open(card.id).length) continue;
    const s = standing(card.id);
    if (!atLeast(tierOf(s.warmth, s.trust), 'acquaintance')) continue;
    const last = Math.max(-Infinity, ...state.favours.filter((f) => f.person === card.id).map((f) => f.done ?? f.failed ?? f.day));
    if (day - last < FAVOURS.gapDays) continue;
    const rand = gameDayRandom(`favour:${card.id}`, day);
    const odds = Math.min(FAVOURS.odds.max, FAVOURS.odds.base + s.warmth * FAVOURS.odds.perWarmth);
    if (rand() >= odds) continue;
    const f = makeFavour(card, day, rand, false);
    if (!f) continue;
    state.favours.push(f);
    made++;
  }
}

/** The kinds `card` could ask: by who they are (a door to knock on, a parcel at the lodge) and their tastes. */
function kindsFor(card: PersonCard): FavourKind[] {
  const kinds: FavourKind[] = ['fetch'];
  if (card.tastes) kinds.push('findGame', 'lend');
  const door = card.door;
  if (door && NEIGHBOUR_HOSTS.some((h) => personAtDoor(`${h.k}:${h.i}`) === card.id)) kinds.push('checkIn');
  if (card.group === 'building' && card.id !== CONCIERGE && door) kinds.push('parcel');
  return kinds;
}

function fits(card: PersonCard, game: Game): boolean {
  const t = card.tastes;
  if (!t) return false;
  const genre = game.genre?.toLowerCase() ?? '';
  return !!t.platforms?.includes(game.platform) || !!t.genres?.some((g) => genre.includes(g));
}

/** A favour `card` asks on `day`, or null when the kind drawn has nothing to ask (no game to hunt). */
function makeFavour(card: PersonCard, day: number, rand: () => number, amends: boolean): Favour | null {
  const d = deps;
  if (!d) return null;
  const kinds = kindsFor(card).filter((k) => !amends || k !== 'findGame');
  const kind = kinds[Math.floor(rand() * kinds.length)]!;
  const state = life();
  const f: Favour = { id: `f${++state.serial}`, person: card.id, kind, day, accepted: null, asked: amends, due: day + FAVOUR_DAYS[kind], stage: 0, amends: amends || undefined };
  if (kind === 'fetch') {
    const liked = (card.likes ?? []).filter((g) => FETCHABLE.includes(g));
    const pool = liked.length ? liked : FETCHABLE;
    f.thing = pool[Math.floor(rand() * pool.length)]!;
  } else if (kind === 'findGame') {
    const wanted = d.catalogue.filter((g) => fits(card, g) && !d.collection.owns(g.id));
    const game = wanted[Math.floor(rand() * wanted.length)];
    if (!game) return null;
    f.game = { id: game.id, title: game.title, platform: game.platform };
  } else if (kind === 'lend') {
    const mine = d.collection.games.filter((g) => (g.status ?? 'owned') === 'owned' && d.lendable(g) && fits(card, g));
    const game = mine[Math.floor(rand() * mine.length)];
    if (!game) return null;
    f.game = { id: game.id, title: game.title, platform: game.platform };
  }
  return f;
}

/** What a favour adds to the conversation with `id` (and, at the lodge, the parcels to collect). */
function extrasOf(id: PersonId, day: number): TalkExtra[] {
  const out: TalkExtra[] = [];
  for (const f of open(id)) out.push(...extrasFor(f, day));
  if (id === CONCIERGE) {
    for (const f of life().favours) {
      if (f.kind !== 'parcel' || f.accepted === null || f.stage !== 0 || f.done !== undefined || f.failed !== undefined) continue;
      out.push({
        id: `favour-collect-${f.id}`,
        group: 'ask',
        label: fill(FAVOUR_EXTRAS.collect, f),
        run: () => {
          f.stage = 1;
          saveLife();
          return { line: fill(FAVOUR_EXTRAS.collected, f) };
        },
      });
    }
  }
  const amends = amendsExtra(id, day);
  if (amends) out.push(amends);
  return out;
}

function extrasFor(f: Favour, day: number): TalkExtra[] {
  if (f.accepted === null) {
    if (!f.asked) {
      return [{ id: `favour-ask-${f.id}`, group: 'ask', label: FAVOUR_EXTRAS.ask, run: () => {
        f.asked = true;
        saveLife();
        return { line: fill(FAVOUR_LINES[f.kind].ask, f) };
      } }];
    }
    return [
      { id: `favour-yes-${f.id}`, group: 'ask', label: FAVOUR_EXTRAS.accept, run: () => accept(f, day) },
      { id: `favour-no-${f.id}`, group: 'ask', label: FAVOUR_EXTRAS.decline, run: () => {
        f.declined = true;
        saveLife();
        return { line: FAVOUR_EXTRAS.declined };
      } },
    ];
  }
  if (f.kind === 'lend' && f.stage === 0 && f.game) {
    const game = f.game;
    return [{
      id: `favour-lend-${f.id}`,
      group: 'give',
      label: fill(FAVOUR_EXTRAS.lendIt, f),
      disabled: () => (deps?.collection.find(game.id)?.status ?? 'owned') === 'owned' && deps?.collection.owns(game.id) ? null : FAVOUR_EXTRAS.lendGone,
      run: () => {
        deps?.collection.setStatus(game.id, 'lent');
        f.stage = 1;
        f.back = day + FAVOURS.lendDays;
        nudge(f.person, { trust: 4, warmth: 3, why: `trusted with ${game.title}`, day });
        saveLife();
        return { line: fill(FAVOUR_LINES.lend.thanks, f) };
      },
    }];
  }
  if (f.kind === 'parcel' && f.stage === 1) {
    return [{ id: `favour-deliver-${f.id}`, group: 'give', label: FAVOUR_EXTRAS.deliver, run: () => {
      complete(f, day);
      return { line: fill(FAVOUR_LINES.parcel.thanks, f) };
    } }];
  }
  return [];
}

/** The make-amends offer of someone cross with the player, once each. */
function amendsExtra(id: PersonId, day: number): TalkExtra | null {
  const s = standing(id);
  if (tierRank(tierOf(s.warmth, s.trust)) > tierRank('hostile') || life().amends.includes(id) || open(id).length) return null;
  const card = findPerson(id);
  if (!card) return null;
  return {
    id: `favour-amends-${id}`,
    group: 'talk',
    label: AMENDS_LINES.extra,
    run: () => {
      const state = life();
      state.amends.push(id);
      const f = makeFavour(card, day, gameDayRandom(`amends:${id}`, day), true);
      if (!f) {
        saveLife();
        return { line: 'Not now.' };
      }
      state.favours.push(f);
      saveLife();
      return { line: `${AMENDS_LINES.ask} ${fill(FAVOUR_LINES[f.kind].ask, f)}` };
    },
  };
}

function accept(f: Favour, day: number): { line: string } {
  f.accepted = day;
  f.due = day + FAVOUR_DAYS[f.kind];
  saveLife();
  const todo = fill(FAVOUR_LINES[f.kind].todo, f);
  deps?.notices.tip(todo, { id: `favour-${f.id}`, head: 'To do', until: () => f.done !== undefined || f.failed !== undefined, ms: 10 * 60_000 });
  const said = `Said yes to ${shortName(f.person)}: ${todo}`;
  deps?.note(said.length <= 60 ? said : `Said yes to ${shortName(f.person)}’s favour`, 'note');
  return { line: f.kind === 'lend' ? 'Oh, thank you! Whenever suits.' : 'Thank you! I knew I could count on you.' };
}

/** Done: their trust (much), warmth, sometimes coins; a make-amends favour lifts them out of the cold. */
function complete(f: Favour, day: number): void {
  if (f.done !== undefined) return;
  f.done = day;
  saveLife();
  const s = standing(f.person);
  const warmth = f.amends ? Math.max(FAVOURS.done.warmth, FAVOURS.amendsTo - s.warmth) : FAVOURS.done.warmth;
  nudge(f.person, { warmth, trust: FAVOURS.done.trust, why: f.amends ? 'you made it up to them' : 'grateful for the favour', day, memory: f.amends ? 'you made it up to me' : 'you did me a favour', memoryWeight: 12, gossip: !f.amends });
  const rand = gameDayRandom(`favour-pay:${f.id}`, day);
  const coins = !f.amends && rand() < FAVOURS.coins.odds ? Math.round(FAVOURS.coins.min + rand() * (FAVOURS.coins.max - FAVOURS.coins.min)) : 0;
  if (coins) deps?.wallet.earnCoins(coins);
  const name = shortName(f.person);
  const done = { title: f.amends ? `Made up with ${name}` : `Favour for ${name}`, detail: f.amends ? AMENDS_LINES.done : `${name} won’t forget it.` };
  if (coins) deps?.notices.reward({ ...done, coins });
  else deps?.notices.slip(done);
  deps?.note(f.amends ? `Made it up to ${name}` : `Did ${name} a favour`);
}

/** Missed after a yes: a little trust and warmth lost, and they remember. */
function fail(f: Favour, day: number): void {
  f.failed = day;
  nudge(f.person, { warmth: FAVOURS.failed.warmth, trust: FAVOURS.failed.trust, why: 'you forgot their favour', day, memory: 'you forgot my favour', memoryWeight: -8 });
  deps?.note(`Forgot ${shortName(f.person)}’s favour`);
}

/** A lent game back on its shelf, and the favour done. */
function bringBack(f: Favour, day: number): void {
  const d = deps;
  if (d && f.game && d.collection.find(f.game.id)?.status === 'lent') d.collection.setStatus(f.game.id, 'owned');
  d?.notices.read({ title: `${shortName(f.person)} brought it back`, text: `${f.game?.title ?? 'Your game'} is back on its shelf, in one piece. “Thank you, I loved it.”`, look: 'note' });
  complete(f, day);
}
