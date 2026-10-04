import { onBlackout } from '@/building/blackout';
import { isPartyDay, partyGuests } from '@/building/neighboursParty';
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

/** The journal's to-do lines of the social web: the favours promised (days left), the birthdays coming. */
export function upcomingSocial(day: number): string[] {
  const favours = favoursToDo().map((f) => {
    const left = f.due - day;
    const todo = todoText(f);
    return f.kind === 'lend' && f.stage === 1 ? `${shortName(f.person)} has your ${f.game?.title ?? 'game'}: back ${f.back !== undefined && f.back - day <= 1 ? 'tomorrow' : 'in a few days'}.` : `${todo} ${left <= 0 ? 'Today, last day.' : left === 1 ? 'By tomorrow.' : `${left} days left.`}`;
  });
  return [...favours, ...upcomingBirthdays(day)];
}
