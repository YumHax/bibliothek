import { onBlackout } from '@/building/blackout';
import { isPartyDay, partyGuests } from '@/building/neighboursParty';
import type { Upcoming } from '@/journal';
import { personAtDoor, shortName } from '../people';
import { upcomingBirthdays, startBirthdays } from './birthdays';
import { favoursToDo, startFavours, todoText, type FavourDeps } from './favours';
import { startIntroductions, together } from './introductions';
import { startMediation } from './mediation';

/*
 * The social web's life, started once at boot (`bootstrap/social`): favours, birthdays, introductions, go-betweens,
 * and the building's gatherings that bring people together (the power cut's scene, the neighbours' party). The games
 * night tells `introductions.together` itself.
 */

/** Who the power cut's scene puts together (`stairwell/powerCut`): the two chatting on the 2nd, the card players in the hall. */
const POWER_CUT_PAIRS: readonly (readonly string[])[] = [
  ['haddad', 'dubois'],
  ['girard', 'martin'],
];

export function startSocialLife(deps: FavourDeps & { realDate(): Date }): void {
  startFavours(deps);
  startBirthdays();
  startIntroductions(deps.note);
  startMediation();
  onBlackout((cut) => {
    if (cut) for (const pair of POWER_CUT_PAIRS) together(pair, deps.day(), 'powerCut');
  });
  const party = (day: number): void => {
    if (!isPartyDay(day, deps.realDate())) return;
    const guests = partyGuests().map((g) => personAtDoor(`${g.k}:${g.i}`)).filter((id): id is string => id !== null);
    together(guests, day, 'party');
  };
  party(deps.day());
  deps.onNewDay(party);
}

/** The journal's to-do lines of the social web: the favours promised (due in so many days), the birthdays coming. */
export function upcomingSocial(day: number): Upcoming[] {
  const favours = favoursToDo().map((f): Upcoming => {
    if (f.kind === 'lend' && f.stage === 1) {
      const back = f.back !== undefined ? Math.max(0, f.back - day) : undefined;
      return { kind: 'social', text: `${shortName(f.person)} has your ${f.game?.title ?? 'game'}${back === undefined ? ', back in a few days' : ', back'}`, ...(back !== undefined ? { inDays: back } : {}) };
    }
    return { kind: 'social', text: todoText(f), inDays: Math.max(0, f.due - day) };
  });
  const birthdays = upcomingBirthdays(day).map((b): Upcoming => ({ kind: 'social', text: `${shortName(b.id)}’s birthday${b.wish ? ': wish them a happy one' : ''}`, inDays: b.days }));
  return [...favours, ...birthdays];
}
