import { gameDayRandom } from '@/time/daily';
import { pinSource, type BoardNote } from './boardNotes';

/*
 * The notes that are always on the hall's board, or come and go on their own: the house rules,
 * and the residents' small ads (a few a day, drawn per game day). The building's events pin their
 * own (`coproMeeting`, the estate sale, the party...).
 */

const RULES: BoardNote = {
  id: 'house-rules',
  title: 'House rules',
  lines: ['No bicycles on the landings.', 'Bins out on Monday and Thursday evenings.', 'The lift is limited to 3 persons.', 'Quiet after 10 pm.'],
  paper: 0xf0ead8,
  signed: 'The syndic',
  weight: 1,
};

/** The residents' small ads; a couple of them are up on any day. */
const ADS: readonly BoardNote[] = [
  { id: 'ad-piano', title: 'Piano lessons', lines: ['Beginners welcome.', 'Ask on the 4th floor, left.'], paper: 0xfff3a6 },
  { id: 'ad-glove', title: 'Found', lines: ['One grey glove, left hand.', 'At the lodge.'], paper: 0xcfe3ff },
  { id: 'ad-cat', title: 'Has anyone seen Pompon?', lines: ['Ginger, very fat, answers to nothing.', '2nd floor, the Nguyens.'], paper: 0xffd1dc },
  { id: 'ad-bike', title: 'For sale: child’s bicycle', lines: ['Red, stabilisers included.', 'R. Haddad, 2nd floor.'], paper: 0xc8f0d0 },
  { id: 'ad-noise', title: 'To whoever plays music at 2 am', lines: ['We can all hear it.', 'Thank you.'], paper: 0xfbf8f0 },
  { id: 'ad-books', title: 'Free books', lines: ['A box of paperbacks by the mailboxes.', 'Help yourselves.'], paper: 0xfff3a6 },
  { id: 'ad-games', title: 'Wanted: old cartridges', lines: ['Any console, any state.', 'J.-P. Martin, 1st floor.'], paper: 0xcfe3ff },
];

/** How many small ads are up on a day. */
const ADS_A_DAY = 2;

/** Pins the house rules and the day's small ads on the board, once at boot; returns the unregister. */
export function pinHouseNotes(): () => void {
  return pinSource('house', (day) => {
    const random = gameDayRandom('board.ads', day);
    const ads = [...ADS].map((ad) => ({ ad, key: random() })).sort((a, b) => a.key - b.key).slice(0, ADS_A_DAY).map((x) => x.ad);
    return [RULES, ...ads];
  });
}
