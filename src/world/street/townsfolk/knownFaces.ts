import { personAtDoor } from '@/social/people';
import { rememberLook } from '@/social/lookBook';
import { has } from '@/social/perks';
import { mansionGossip } from '@/social/street/mansionDoors';
import type { SocialServices, TalkExtra } from '@/social/talk';
import type { PersonId } from '@/social/types';
import { inHours } from '@/time/clock';
import { bodyOf, talkHook, type SocialHook } from '../../people/socialHook';
import type { Walker } from '../../people/Walker';
import type { CastMember } from '../life/crowdCast';
import { REGULARS } from './regularsPlan';
import { leadToday } from './streetLeads';

/*
 * The faces in Front Street's crowd the player can know (docs/social.md "Front Street and the arcade"): the
 * building's residents out at their hours (`personAtDoor`, the same people as on the stairs) and the regulars who
 * keep hours (`regularsPlan`: Bastien the commuter, Mrs Hall and Biscuit). A click opens the conversation in the street
 * (place `street`); met, they greet the player passing by how they stand with them (`greets`).
 */

/** Who `member` is to the social layer: a resident's person, a regular's, or null (a stranger). */
export function personOf(member: CastMember): PersonId | null {
  if (member.resident) return personAtDoor(member.resident.key);
  return REGULARS.find((r) => r.seed === member.seed)?.person ?? null;
}

/** A regular's hours out (`regularsPlan`), or null: out whenever the street is. */
function hoursOf(member: CastMember): readonly (readonly [number, number])[] | null {
  if (member.resident) return null;
  return REGULARS.find((r) => r.seed === member.seed)?.hours ?? null;
}

/** Whether `member` keeps no hours, or `hours` is within theirs. */
export function outNow(member: CastMember, hours: number): boolean {
  const own = hoursOf(member);
  return !own || own.some((span) => inHours(hours, span));
}

/** What `person` adds to a talk in the street: Bastien's word from the platform, Mrs Hall's on the Mansions. */
function extrasOf(person: PersonId, day: number, owns: (id: string) => boolean): TalkExtra[] {
  if (person === 'theo') {
    return [{
      id: 'theo:lead',
      group: 'ask',
      label: 'Heard anything on the platform?',
      disabled: () => (!has(person, 'passesLeads') ? 'Only for a friendly face' : null),
      run: () => {
        const lead = leadToday(day, owns);
        return { line: lead ? lead.says : 'Nothing worth the 8:10. Ask me tomorrow.' };
      },
    }];
  }
  if (person === 'mrs-hall') {
    return [{
      id: 'hall:mansions',
      group: 'ask',
      label: 'Anything going on at the Mansions?',
      disabled: () => (!has(person, 'mansionWord') ? 'Only for a friendly face' : null),
      run: () => ({ line: mansionGossip(day)?.says ?? 'Quiet as a mouse today. Even Russo’s parrot.' }),
    }];
  }
  return [];
}

/**
 * The conversation hook for `member` once their walker exists (`walker()`), or undefined for a stranger (their line)
 * or with no social layer. Their face is the book's portrait.
 */
export function knownFaceHook(member: CastMember, walker: () => Walker, social: SocialServices | undefined, owns: (id: string) => boolean): SocialHook | undefined {
  const person = personOf(member);
  if (!person || !social) return undefined;
  rememberLook(person, member.look);
  return talkHook(social, person, () => ({ person, place: 'street', body: bodyOf(walker()), extras: extrasOf(person, social.day(), owns) }), 'say hello');
}

/**
 * A known face passing the player: they greet them by how they stand (`Walker.greetIfNear`, `socialSelf`: a look away
 * from the hostile, a nod, a wave, a close friend calling out). Returns whether they greeted (once a trip: the caller
 * remembers).
 */
export function greets(walker: Walker): boolean {
  return walker.drawn && walker.greetIfNear();
}
