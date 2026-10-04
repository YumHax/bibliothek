import { pinSource } from '@/building/boardNotes';
import { onInteraction } from '../conversation';
import { addExtras } from '../extras';
import { tiesOf } from '../gossip';
import { daysToBirthday, isBirthday } from '../mood';
import { everyone, findPerson, shortName } from '../people';
import { isMet, nudge } from '../standing';
import type { PersonId } from '../types';
import { life, saveLife } from './lifeStore';

/*
 * Birthdays (docs/social.md "Birthdays"): every card has one in the social year (`mood.isBirthday`). The player
 * learns one when a chat lands in the week before it (they mention it); the old friends' are known from the start.
 * The hall's board wishes the residents theirs, signed by those who like them; the journal lists the coming ones the
 * player knows; on the day, wishing them happy birthday warms them once (more when the player knew ahead).
 */

/** How many game days ahead a chat brings a birthday up, and the journal lists it. */
const AHEAD = 7;
/** What a wish moves: more for a birthday the player knew of. */
const WISH = { warmth: 6, known: 6, trust: 1 } as const;

/** Whether the player knows `id`'s birthday (the People book shows it then). */
export function knowsBirthday(id: PersonId): boolean {
  return findPerson(id)?.group === 'friends' || life().birthdays.includes(id);
}

function when(days: number): string {
  return days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
}

/** Starts the birthdays: learned in talk, the board's notes, the wish in conversation. */
export function startBirthdays(): void {
  onInteraction((id, interaction, outcome, ctx) => {
    if ((interaction !== 'chat' && interaction !== 'askDay') || !outcome.ok || outcome.tired || knowsBirthday(id)) return;
    const days = daysToBirthday(id, ctx.day);
    if (days > AHEAD) return;
    life().birthdays.push(id);
    saveLife();
    outcome.line = `${outcome.line} Oh, and it’s my birthday ${when(days)}, you know.`;
  });
  pinSource('birthdays', (day) =>
    everyone()
      .filter((p) => p.group === 'building' && isBirthday(p.id, day))
      .map((p) => {
        const friends = tiesOf(p.id).filter((t) => t.tie >= 0.3 && findPerson(t.id)?.group === 'building').map((t) => shortName(t.id));
        if (life().wished[p.id] === day) friends.push('the 5th floor');
        return { id: `birthday-${p.id}`, title: `Happy birthday, ${shortName(p.id)}!`, lines: ['From all of us on the stairs.'], paper: 0xfff1c8, signed: friends.length ? friends.join(', ') : undefined, weight: 2 };
      }),
  );
  addExtras((ctx) => {
    if (!isBirthday(ctx.person, ctx.day) || life().wished[ctx.person] === ctx.day || !isMet(ctx.person)) return [];
    return [{
      id: `birthday-wish-${ctx.person}`,
      group: 'talk',
      label: 'Wish them a happy birthday',
      run: () => {
        const ahead = knowsBirthday(ctx.person);
        life().wished[ctx.person] = ctx.day;
        if (!ahead) life().birthdays.push(ctx.person);
        saveLife();
        nudge(ctx.person, { warmth: WISH.warmth + (ahead ? WISH.known : 0), trust: WISH.trust, why: ahead ? 'touched you remembered their birthday' : 'pleased with the birthday wishes', day: ctx.day, memory: 'you wished me a happy birthday', memoryWeight: 10 });
        return { line: ahead ? 'You remembered! Oh, thank you. That’s made my day.' : 'How did you know? Thank you!' };
      },
    }];
  });
}

/** The coming birthdays the player knows, for the journal's to-do list. */
export function upcomingBirthdays(day: number): string[] {
  return everyone()
    .filter((p) => isMet(p.id) && knowsBirthday(p.id))
    .map((p) => ({ id: p.id, days: daysToBirthday(p.id, day) }))
    .filter((b) => b.days <= AHEAD)
    .sort((a, b) => a.days - b.days)
    .map((b) => `${shortName(b.id)}’s birthday ${when(b.days)}${b.days === 0 && life().wished[b.id] !== day ? ': wish them a happy one' : ''}.`);
}
