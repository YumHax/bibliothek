import { raffle } from '@/fair/raffle';
import { findPerson } from '@/social/people';
import { fnv1a } from '@/random';
import { postCards } from './cards';

/*
 * What Front Street's post brings back through the flat's door (docs/zones.md "The street", the post box): now and
 * then a friend answers a card posted in the pillar box, a few days on, in their own words; and a raffle prize the
 * player won at the Fair and never collected is written about by the stall (`fair/raffle` `unclaimedCard`). The
 * hallway's mail asks once a day (`world/hallway/mail`); the same day always brings the same.
 */

/** A piece through the door, as the hallway's mail takes it (`MailPiece`). */
interface StreetPiece {
  title: string;
  lines: string[];
  look: 'postcard' | 'note';
  from: string;
  place?: string;
  hand: 'pen';
}

/** How many days a reply takes (the first of them, and how many more it may take), and how often a friend writes back (of ten). */
const REPLY = { after: 2, spread: 2, outOfTen: 6 };

/** Each friend's own answer, by their id (`social/people/friends`); anyone else's is `ANYONE`. */
const REPLIES: Readonly<Record<string, { place: string; lines: readonly (readonly string[])[] }>> = {
  sam: {
    place: 'The night shift',
    lines: [
      ['Your card’s on the fridge at work. A patient asked who sent it. I said a famous collector.', 'Pickle tried to eat the corner. That means she likes you.', 'Sam'],
      ['A card! In the post! Like it’s 1995!', 'Got to 5:39 on Mario. Okay, 5:42. Come round and watch me fail.', 'Sam'],
    ],
  },
  ines: {
    place: 'Greetings from somewhere',
    lines: [
      ['Your card found me between two flights. I read it in the queue and laughed out loud.', 'Found a game shop by the station here. Bought you nothing. Lying. Bought you something.', 'Inès x'],
      ['Thank you for the card. The hotel has a CRT in the lobby. I may never leave.', 'Back soon. Keep the kettle on and the shelves dusted.', 'Inès x'],
    ],
  },
  marco: {
    place: 'Marco’s desk',
    lines: [
      ['Card received, pinned above the Duel high score I still hold, by the way.', 'Next games night I’m bringing my own pad. Yours has a sticky A.', 'Marco'],
      ['Got your card. Who even sends cards? You do, apparently. Nice.', 'Tell the arcade I’m coming for PADDLE WARS.', 'Marco'],
    ],
  },
};
const ANYONE: readonly (readonly string[])[] = [['Thank you for the card! It made my week.', 'Come and see us soon.']];

/** Whether the card to `id` posted on `posted` is answered, and the game day the answer comes. */
function replyDay(id: string, posted: number): number | null {
  const hash = fnv1a(`reply:${id}:${posted}`);
  if (hash % 10 >= REPLY.outOfTen) return null;
  return posted + REPLY.after + (Math.floor(hash / 10) % (REPLY.spread + 1));
}

/** The pieces the street's post brings on game day `day`: a friend's answer to a card, the raffle's stall's note. */
export function streetLetters(day: number): StreetPiece[] {
  const out: StreetPiece[] = [];
  const prize = raffle.unclaimedCard(day);
  if (prize) out.push(prize);
  for (const [id, posted] of Object.entries(postCards.lastPosted())) {
    if (replyDay(id, posted) !== day) continue;
    const person = findPerson(id);
    if (!person) continue;
    const own = REPLIES[id];
    const lines = own?.lines ?? ANYONE;
    const words = lines[fnv1a(`words:${id}:${posted}`) % lines.length]!;
    const from = person.short ?? person.name;
    out.push({ title: `From ${from}`, lines: own ? [...words] : [...words, from], look: 'postcard', from, place: own?.place ?? 'A card back', hand: 'pen' });
  }
  return out;
}
