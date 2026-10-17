import type { TierId } from '../types';

/*
 * What people say in their tier's scene at the flat's door (docs/social.md "Tier scenes"), before their keepsake's own
 * words (`KeepsakeDef.giving`), and the notes they slip under the door instead: a friendly one, a keepsake posted, a
 * cooled friendship. Shared by everyone; a line is picked per person so each says the same one every time.
 */

/** Their first words at the door, by the tier just reached. */
export const DOOR_OPENERS: Record<'friend' | 'close', readonly string[]> = {
  friend: [
    'Sorry to knock so late. I won’t keep you, I just had something for you.',
    'I was passing, and I thought: no, go up and say it. I’m glad you moved in.',
    'Hello! Don’t worry, nothing’s wrong. Quite the opposite.',
  ],
  close: [
    'You know, it feels like I’ve known you for years.',
    'I said to myself: tonight I go up and tell them. So. Here I am.',
    'I don’t say this to many people. You’re a real friend.',
  ],
};

/** Mme Pereira at the door the evening the first day's parcel reached Mrs Roux (`tierScenes.welcomeKept`). */
export const WELCOME_THANKS: readonly string[] = [
  'Mrs Roux telephoned the lodge. She’s had her parcel, and from you. Thank you.',
  'Most people who move in, I don’t see them for a month. You, the first day. That’s good.',
  'If you need anything, the lodge is open from eight. Goodnight, neighbour.',
];

/** What a close friend adds once the keepsake is given: an invitation. */
export const CLOSE_INVITES: readonly string[] = [
  'And come round one evening. I mean it. The door’s open.',
  'Come and eat with us one night. No need to ring first.',
  'Drop in whenever. Really. Any time.',
];

/** Their goodbye from the landing as they go back down. */
export const DOOR_GOODBYES: readonly string[] = ['Right. Goodnight!', 'See you on the stairs!', 'Sleep well, neighbour.'];

/** A friendly note slipped under the door: their words, signed. */
export const FRIENDLY_NOTES: readonly string[] = [
  'Thank you for the chat the other day. It did me good.',
  'Just a word to say it’s nice having you in the building.',
  'You made my week, you know. Thank you.',
];

/** Under a keepsake posted rather than handed over (someone who does not come to the door). */
export const POSTED_LINES: readonly string[] = ['I’ve put it in with this note. For your fridge.', 'It’s in the envelope. Stick it somewhere you’ll see it.'];

/** When they came to the door and nobody answered: the keepsake left on the mat, and a word. */
export const MISSED_LINES: readonly string[] = ['I knocked, but you were out. I’ve left it for you.', 'Came up, nobody home. It’s under the door. Next time!'];

/** A cooled friendship's note under the door, in their hand, by how far it fell. */
export const COOLING_NOTES: Partial<Record<TierId, readonly string[]>> = {
  cold: ['I thought we got on. Evidently not.', 'I’d rather you kept your distance for a while.', 'I’m disappointed, I won’t pretend otherwise.'],
  hostile: ['Don’t bother knocking.', 'I know what you are now.', 'Stay away from my door.'],
  nemesis: ['You’ll regret this.', 'This building isn’t big enough for the two of us.'],
};

/** A line of `lines` for `person`, the same one every time (their name picks it). */
export function lineFor(person: string, lines: readonly string[], salt = 0): string {
  let h = salt;
  for (let i = 0; i < person.length; i++) h = (h * 31 + person.charCodeAt(i)) >>> 0;
  return lines[h % lines.length]!;
}
