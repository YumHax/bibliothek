import { pinSource, refreshBoard } from '@/building/boardNotes';
import { tieBetween } from '../gossip';
import { findPerson, shortName } from '../people';
import { isMet } from '../standing';
import type { PersonId } from '../types';
import { life, pairKey, saveLife } from './lifeStore';

/*
 * Introductions (docs/social.md "Introductions"): two people the player knows who meet at the player's doings (a
 * games night, the neighbours' party, the stairs in a power cut) grow a little closer each time, once a day per
 * place: a tie offset over their cards' (`lifeStore.tieOffset`, read by the grapevine). Once they are close, it is
 * news: a note on the hall's board for a week and a line in the journal ("Haddad and Martin play cards in the hall on
 * Thursdays now").
 */

/** How much closer each meeting brings them, the most it can add, and when it is news. */
const GROW = { step: 0.08, max: 0.6, newsAt: 0.6, newsFrom: 0.15, boardDays: 7 } as const;

/** What a pair grown close does together, for some pairs; the others draw from `ACTIVITIES`. */
const PAIR_NEWS: Record<string, string> = {
  'haddad|martin': 'play cards in the hall on Thursdays now',
  'dubois|haddad': 'have coffee on the second-floor landing every Sunday',
  'girard|martin': 'go running together on Saturday mornings. Well, Mr Martin walks',
  'ines|sam': 'have started a Final Fantasy marathon, one evening a week',
  'marco|sam': 'drive out to car-boot sales together on Sundays',
};
const ACTIVITIES: readonly string[] = ['swap paperbacks on the landing now', 'share a pot of soup on Fridays', 'have become thick as thieves', 'water each other’s plants now'];

/** Where they met, for the once-a-day count. */
type Gathering = 'gamesNight' | 'party' | 'powerCut';

let note: ((text: string) => void) | null = null;

/** Starts the introductions: the board's news of pairs grown close; `journal` hears it too. */
export function startIntroductions(journal: (text: string) => void): void {
  note = journal;
  pinSource('introductions', (day) =>
    Object.entries(life().met)
      .filter(([key, at]) => key.startsWith('news:') && day - at >= 0 && day - at < GROW.boardDays)
      .map(([key]) => {
        const [a, b] = key.slice(5).split('|') as [PersonId, PersonId];
        return { id: `intro-${a}-${b}`, title: 'Neighbours', lines: [newsOf(a, b)], paper: 0xe8f4e0, weight: 1 };
      }),
  );
}

function newsOf(a: PersonId, b: PersonId): string {
  const key = pairKey(a, b);
  const what = PAIR_NEWS[key] ?? ACTIVITIES[[...key].reduce((h, c) => h + c.charCodeAt(0), 0) % ACTIVITIES.length]!;
  return `${shortName(a)} and ${shortName(b)} ${what}.`;
}

/** `ids` were together at `where` on `day`: each pair of them the player knows grows closer (once a day per place). */
export function together(ids: readonly PersonId[], day: number, where: Gathering): void {
  const known = ids.filter((id) => findPerson(id) && isMet(id));
  const state = life();
  let news = false;
  for (let i = 0; i < known.length; i++) {
    for (let j = i + 1; j < known.length; j++) {
      const a = known[i]!;
      const b = known[j]!;
      const pair = pairKey(a, b);
      const at = `${pair}@${where}`;
      if (state.met[at] === day) continue;
      state.met[at] = day;
      const offset = Math.min(GROW.max, (state.ties[pair] ?? 0) + GROW.step);
      state.ties[pair] = offset;
      if (!state.events.includes(pair) && offset >= GROW.newsFrom && tieBetween(a, b) >= GROW.newsAt) {
        state.events.push(pair);
        state.met[`news:${pair}`] = day;
        note?.(newsOf(a, b));
        news = true;
      }
    }
  }
  saveLife();
  if (news) refreshBoard();
}
