import { HOUSEHOLD } from '@/household';
import type { PhoneFriends } from '@/ui/household/PhonePanel';
import type { Visitors } from './Visitors';

/** What the invite rule asks of the household: whether someone was asked round today, and to note that someone was. */
interface InviteHousehold {
  doneToday(what: 'invite'): boolean;
  once(what: 'invite'): void;
}

/**
 * The bedroom's phone asking a friend round (docs/household.md "The phone"): once a market day, if nobody came yet,
 * not too late in the evening, `HOUSEHOLD.phone.inHours` from now. The rule lives with the visitors; the phone panel
 * only shows the list and reads the answer.
 */
export function phoneFriends(visitors: Visitors, household: InviteHousehold, hours: () => number): PhoneFriends {
  return {
    list: () => visitors.phoneBook(),
    invite: (id) => {
      const now = hours();
      if (household.doneToday('invite')) return 'You have asked someone round today already.';
      if (now >= HOUSEHOLD.phone.friendsUntil) return 'A bit late to ask anyone round. Tomorrow.';
      const answer = visitors.invite(id, now + HOUSEHOLD.phone.inHours);
      if (answer.ok) household.once('invite');
      return answer.line;
    },
  };
}
