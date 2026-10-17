import type { Game } from '@/catalog/types';
import { gameDayRandom } from '@/time/daily';
import { addExtras } from '../extras';
import { pairKey, life, saveLife } from '../life/lifeStore';
import { findPerson, shortName } from '../people';
import { isMet, nudge, standing } from '../standing';
import type { TalkExtra } from '../talk';
import { addThreadSource, type Thread } from '../threads';
import type { PersonId, SocialPlace } from '../types';
import { witnessed } from '../witnesses';
import { conflictOf, saveConflicts, type ConflictState } from './conflictStore';
import { CONFLICT, CONFLICTS, type ConflictPlan, type ConflictSide } from './conflictsPlan';

/*
 * The building's quarrels (docs/social.md "Conflicts"): `CONFLICTS` start once both sides are met (and the day has
 * come), each side tells theirs when asked and offers the player to take it; the side taken wins warmth and a stamp
 * (the player stood by them), the other cools; nothing taken in `CONFLICT.lapseDays`, it blows over and both cool a
 * little. After it, the winner says how it went, the loser says their piece and, days on, offers a way back. Their
 * sides show in the People book as their needs (`threads`); taken in public, the people around see it (`witnesses`).
 */

/** What the quarrels need of the game. */
interface ConflictDeps {
  day(): number;
  onNewDay(cb: (day: number) => void): void;
  /** The built-in games: the one both are after in `hunt`. */
  catalogue: readonly Game[];
  /** A line in the day's journal. */
  note(text: string, weight?: 'line' | 'note'): void;
}

let deps: ConflictDeps | null = null;

/** Starts the quarrels: their start and lapse each day, their entries in conversations, their needs in the book. */
export function startConflicts(d: ConflictDeps): void {
  deps = d;
  settle(d.day());
  d.onNewDay(settle);
  addExtras((ctx) => CONFLICTS.flatMap((plan) => extrasOf(plan, ctx.person, ctx.day, ctx.place)));
  addThreadSource((id, day) => CONFLICTS.flatMap((plan) => threadsOf(plan, id, day)));
}

function fill(text: string, plan: ConflictPlan, state: ConflictState): string {
  return text
    .replaceAll('{a}', shortName(plan.a.person))
    .replaceAll('{b}', shortName(plan.b.person))
    .replaceAll('{game}', state.game ?? 'that game');
}

/** The side of `plan` that `id` is, or null. */
function sideOf(plan: ConflictPlan, id: PersonId): 'a' | 'b' | null {
  return plan.a.person === id ? 'a' : plan.b.person === id ? 'b' : null;
}

function other(side: 'a' | 'b'): 'a' | 'b' {
  return side === 'a' ? 'b' : 'a';
}

/** A new game day: the quarrels whose day has come start, the ones nobody took a side in blow over. */
function settle(day: number): void {
  let changed = false;
  for (const plan of CONFLICTS) {
    const state = conflictOf(plan.id);
    if (state.started === null) {
      const a = standing(plan.a.person).met;
      const b = standing(plan.b.person).met;
      if (a === null || b === null || !findPerson(plan.a.person) || !findPerson(plan.b.person)) continue;
      if (day < Math.max(plan.earliest, a + CONFLICT.startDays, b + CONFLICT.startDays)) continue;
      start(plan, state, day);
      changed = true;
    } else if (state.side === null && state.lapsed === null && day - state.started > CONFLICT.lapseDays) {
      state.lapsed = day;
      easeTie(plan);
      for (const id of [plan.a.person, plan.b.person]) nudge(id, { warmth: CONFLICT.lapse.warmth, why: 'you kept out of it', day });
      deps?.note(fill(plan.lapsed, plan, state), 'note');
      changed = true;
    }
  }
  if (changed) saveConflicts();
}

function start(plan: ConflictPlan, state: ConflictState, day: number): void {
  state.started = day;
  if (plan.id === 'hunt') {
    const tastes = findPerson(plan.a.person)?.tastes?.platforms ?? [];
    const pool = (deps?.catalogue ?? []).filter((g) => tastes.includes(g.platform));
    const list = pool.length ? pool : (deps?.catalogue ?? []);
    const game = list[Math.floor(gameDayRandom('conflict:hunt', day)() * list.length)];
    state.game = game?.title;
  }
  // While it is on, the two grow further apart: the grapevine and the witnesses feel it.
  const key = pairKey(plan.a.person, plan.b.person);
  life().ties[key] = (life().ties[key] ?? 0) + CONFLICT.tieOffset;
  saveLife();
  deps?.note(fill(plan.started, plan, state), 'note');
}

/** The quarrel is over between the two (it blew over, or the loser made peace): the distance it put between them goes. */
function easeTie(plan: ConflictPlan): void {
  const key = pairKey(plan.a.person, plan.b.person);
  const ties = life().ties;
  const eased = (ties[key] ?? 0) - CONFLICT.tieOffset;
  if (Math.abs(eased) < 1e-6) delete ties[key];
  else ties[key] = eased;
  saveLife();
}

/** The player takes `side` of `plan` at `place` on `day`: one wins warmth and a stamp, the other cools. */
function take(plan: ConflictPlan, side: 'a' | 'b', place: SocialPlace, day: number): void {
  const state = conflictOf(plan.id);
  if (state.side !== null) return;
  state.side = side;
  state.decided = day;
  saveConflicts();
  const winner = plan[side];
  const loser = plan[other(side)];
  nudge(winner.person, { warmth: CONFLICT.won.warmth, trust: CONFLICT.won.trust, raw: true, why: 'you stood by them', day, memory: 'you stood by me', memoryWeight: 12 });
  nudge(loser.person, { warmth: CONFLICT.lost.warmth, why: `you took ${shortName(winner.person)}’s side`, day, memory: `you took ${shortName(winner.person)}’s side`, memoryWeight: -12 });
  witnessed(winner.person, 'defend', place, day);
  witnessed(loser.person, 'attack', place, day);
  deps?.note(`Took ${shortName(winner.person)}’s side against ${shortName(loser.person)}`);
}

/** What `plan` adds to the conversation with `id` now. */
function extrasOf(plan: ConflictPlan, id: PersonId, day: number, place: SocialPlace): TalkExtra[] {
  const side = sideOf(plan, id);
  if (!side || !isMet(id)) return [];
  const state = conflictOf(plan.id);
  if (state.started === null || state.lapsed !== null) return [];
  const mine: ConflictSide = plan[side];
  const key = `conflict-${plan.id}-${side}`;
  const out: TalkExtra[] = [];
  if (state.side === null) {
    if (!state.told[side]) {
      out.push({ id: `${key}-ask`, group: 'talk', label: fill(mine.ask, plan, state), tag: 'news', fit: 'loves', run: () => {
        state.told[side] = true;
        saveConflicts();
        return { line: fill(mine.tells, plan, state) };
      } });
      return out;
    }
    out.push({ id: `${key}-take`, group: 'promise', label: fill(mine.take, plan, state), once: true, fit: 'loves', run: () => {
      take(plan, side, place, day);
      return { line: fill(mine.took, plan, state) };
    } });
    // Standing up for the other side to this one's face.
    if (side === 'a' && plan.defend) {
      const defend = plan.defend;
      out.push({ id: `${key}-defend`, group: 'talk', label: fill(defend.label, plan, state), once: true, fit: 'dislikes', run: () => {
        take(plan, 'b', place, day);
        return { line: fill(defend.answer, plan, state) };
      } });
    }
    return out;
  }
  if (state.decided === null || day <= state.decided) return out;
  if (state.side === side) {
    if (!state.concluded) {
      out.push({ id: `${key}-how`, group: 'talk', label: fill(mine.howLabel, plan, state), tag: 'news', fit: 'loves', run: () => {
        state.concluded = true;
        saveConflicts();
        return { line: fill(mine.how, plan, state) };
      } });
    }
    return out;
  }
  if (!state.lostSaid) {
    out.push({ id: `${key}-sore`, group: 'talk', label: fill(mine.soreLabel, plan, state), fit: 'dislikes', run: () => {
      state.lostSaid = true;
      saveConflicts();
      return { line: fill(mine.sore, plan, state) };
    } });
  } else if (!state.wayBack && day - state.decided >= CONFLICT.wayBackDays) {
    out.push({ id: `${key}-wayback`, group: 'talk', label: fill(mine.wayBackLabel, plan, state), fit: 'loves', run: () => {
      state.wayBack = true;
      saveConflicts();
      easeTie(plan);
      nudge(id, { warmth: CONFLICT.wayBack.warmth, raw: true, why: 'you made peace', day, memory: 'we made peace', memoryWeight: 8 });
      return { line: fill(mine.wayBack, plan, state) };
    } });
  }
  return out;
}

/** `id`'s threads from `plan`: their side while it brews (a need), the winner's news, the loser's way back (words). */
function threadsOf(plan: ConflictPlan, id: PersonId, day: number): Thread[] {
  const side = sideOf(plan, id);
  const state = conflictOf(plan.id);
  if (!side || state.started === null || state.lapsed !== null || !isMet(id)) return [];
  const mine = plan[side];
  if (state.side === null) return [{ person: id, kind: 'need', text: fill(mine.need, plan, state), day: state.started }];
  if (state.decided === null || day <= state.decided) return [];
  if (state.side === side) return state.concluded ? [] : [{ person: id, kind: 'word', text: 'I have news about that business.', day: state.decided }];
  if (!state.wayBack && state.lostSaid && day - state.decided >= CONFLICT.wayBackDays) return [{ person: id, kind: 'word', text: fill(mine.wayBackWord, plan, state), day: state.decided + CONFLICT.wayBackDays }];
  return [];
}
