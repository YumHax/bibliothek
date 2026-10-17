import { STAMP } from '../socialPlan';
import type { PersonId } from '../types';
import type { ConflictId } from './conflictStore';

/*
 * The building's three quarrels (docs/social.md "Conflicts"): two people at odds, each with their side of it, and
 * the player drawn in. Each side tells theirs when asked, then offers the player to take it; taking it wins one and
 * costs with the other, doing nothing lets it blow over (both cool a little). The winner later says how it went, the
 * loser says their piece, and some days on offers a way back. Data only: `conflicts.ts` reads it. Placeholders: {a},
 * {b} the two short names, {game} the game both are after (`hunt`).
 */

/** One side of a quarrel, in their words and the player's. */
export interface ConflictSide {
  person: PersonId;
  /** Their side as a need in the People book (their words). */
  need: string;
  /** What the player asks to hear it (the player's words), and their side told. */
  ask: string;
  tells: string;
  /** Taking their side (the player's words: a long press, for good), and their thanks. */
  take: string;
  took: string;
  /** The winner, a day on: the player asks how it went, and their answer. */
  howLabel: string;
  how: string;
  /** The loser, the next time: the player brings it up, and their piece. */
  soreLabel: string;
  sore: string;
  /** The loser's way back, days on: their word (the book's note), the player's line, their answer. */
  wayBackWord: string;
  wayBackLabel: string;
  wayBack: string;
}

/** A quarrel: its two sides, the first day it may start, a line for the journal when it starts and when it blows over. */
export interface ConflictPlan {
  id: ConflictId;
  a: ConflictSide;
  b: ConflictSide;
  /** Not before this game day (they come one after the other). */
  earliest: number;
  started: string;
  lapsed: string;
  /** `b`'s side can also be taken at `a`'s, to their face (standing up for someone): the player's words, `a`'s answer. */
  defend?: { label: string; answer: string };
}

/**
 * What a quarrel moves: the side taken (warmth and a stamp of trust: the player stood by them; not slowed), the other
 * side, both when it blows over, the loser's way back. A quarrel starts `startDays` after both are met, blows over
 * `lapseDays` after it started, and the loser offers a way back `wayBackDays` after the side was taken. While it is on,
 * the two grow further apart (`tieOffset`, read by the grapevine and the witnesses).
 */
export const CONFLICT = {
  won: { warmth: 8, trust: STAMP },
  lost: { warmth: -10 },
  lapse: { warmth: -3 },
  wayBack: { warmth: 8 },
  startDays: 3,
  lapseDays: 6,
  wayBackDays: 5,
  tieOffset: -0.3,
} as const;

export const CONFLICTS: readonly ConflictPlan[] = [
  {
    id: 'noise',
    earliest: 4,
    started: '{a} and {b} are at odds over the music from the attic.',
    lapsed: 'The row over the attic’s music blew over without you.',
    a: {
      person: 'leclerc',
      need: 'That racket from the attic again last night. Someone has to do something.',
      ask: 'You look tired. Bad night?',
      tells: 'Bad night? Bad month. {b} plays that music of his until two. I’m writing to the syndic. Will you sign? Two names count more than one.',
      take: 'I’ll sign your letter to the syndic.',
      took: 'Thank you. Somebody in this building has some sense.',
      howLabel: 'Any word from the syndic?',
      how: 'A letter went up to the attic, two names on it. It has been as quiet as a church since. Thank you.',
      soreLabel: 'About {b}’s party…',
      sore: 'I heard every bass note through my ceiling. With your speakers, I’m told. Well.',
      wayBackWord: 'Look, about that business with the music…',
      wayBackLabel: 'Let’s put the music business behind us.',
      wayBack: '…Yes. Let’s. I was tired, that’s all. Tired and cross.',
    },
    b: {
      person: 'student',
      need: '{a}’s on the warpath about my music again. One party, that’s all I want.',
      ask: 'How’s the music going?',
      tells: 'Badly. {a} bangs on the pipes if I so much as hum. I’m having a few friends up on Saturday, quiet-ish. I need speakers that don’t sound like a tin can. You wouldn’t…?',
      take: 'Borrow my speakers for your party.',
      took: 'You’re a legend. I’ll keep it down. Mostly.',
      howLabel: 'How was the party?',
      how: 'Best night in months. Your speakers did us proud. They’re back by your door, not a scratch.',
      soreLabel: 'About the letter to the syndic…',
      sore: 'So you signed his letter. Right. Good to know where you stand.',
      wayBackWord: 'I’ve turned it down a notch, you know.',
      wayBackLabel: 'No hard feelings about the letter?',
      wayBack: 'Nah. Maybe he had a point. Don’t tell him I said that.',
    },
  },
  {
    id: 'rumour',
    earliest: 9,
    started: '{a} has a story going round about {b}.',
    lapsed: 'The talk about {b} died down on its own.',
    defend: { label: 'That’s not true. Leave {b} alone.', answer: 'Well! I only said what I heard. No need to bite my head off.' },
    a: {
      person: 'dubois',
      need: 'Have you heard what they’re saying about {b}? Come here, I’ll tell you.',
      ask: 'You look like you’ve got a secret.',
      tells: 'Me? Well… {b}. They say the parcels that go missing from the lodge end up on his landing. I’m only saying what I heard. People should know.',
      take: 'I’ll pass it on.',
      took: 'I knew you’d see it. People should know who they live with.',
      howLabel: 'So, did people listen?',
      how: 'Everyone’s talking about it. {b} keeps to his flat now. Well, he would.',
      soreLabel: 'About {b}…',
      sore: 'So you take his side, in front of me. I’ll remember that.',
      wayBackWord: 'I may have been hasty about {b}.',
      wayBackLabel: 'Let’s leave the rumours alone.',
      wayBack: 'Yes, well. Perhaps I listened to the wrong people. Coffee on Sunday?',
    },
    b: {
      person: 'girard',
      need: 'Somebody’s been saying things about me. I can tell by the way they look at me on the stairs.',
      ask: 'Everything all right? You seem down.',
      tells: '{a} is telling everyone I steal parcels. Me! I carry half of them up for people. I don’t know what to do.',
      take: 'I don’t believe a word of it. I’ll say so.',
      took: 'Thank you. Really. It helps to hear it.',
      howLabel: 'Has it calmed down?',
      how: 'It has. Even {a} said good morning yesterday. That was you, I think.',
      soreLabel: 'About those rumours…',
      sore: 'You passed it on. I heard. I thought you were different.',
      wayBackWord: 'I’ve been thinking about what happened.',
      wayBackLabel: 'I’m sorry about the rumour.',
      wayBack: 'Water under the bridge. People talk. It’s good of you to say it.',
    },
  },
  {
    id: 'hunt',
    earliest: 14,
    started: '{a} and {b} are racing each other for {game}.',
    lapsed: 'The race between {a} and {b} for {game} went on without you.',
    a: {
      person: 'haddad',
      need: '{game}. I’ve been after it for years, and so has that {b}.',
      ask: 'Still hunting for anything?',
      tells: '{game}. Always {game}. And {b} wants it too: he outbids me every time. If you hear of a copy, tell me first?',
      take: 'I’ll tell you first if I find one.',
      took: 'You’re a dear. First, mind. Not him.',
      howLabel: 'Any luck with {game}?',
      how: 'Not yet, but I sleep better knowing you’re looking out for me.',
      soreLabel: 'About {game}…',
      sore: 'You’re helping {b}. Of all people.',
      wayBackWord: 'I’ve been unfair. It’s only a game, after all.',
      wayBackLabel: 'No hard feelings about {game}?',
      wayBack: 'None. It’s only a game. Well. It’s only a game.',
    },
    b: {
      person: 'victor',
      need: 'Someone in your building is after {game}. I intend to get there first.',
      ask: 'What are you hunting this week?',
      tells: '{game}. And a certain {a} is sniffing round the same stalls. If you hear where a copy is, tell me. I’ll make it worth your while.',
      take: 'I’ll tip you off if I see one.',
      took: 'Splendid. I do like a reliable informant.',
      howLabel: 'Found {game} yet?',
      how: 'Not yet. But with you on my side, {a} hasn’t a hope.',
      soreLabel: 'About {game}…',
      sore: '{a}’s informant now, are we? I’m disappointed. Genuinely.',
      wayBackWord: 'A truce, perhaps?',
      wayBackLabel: 'Truce, {b}?',
      wayBack: 'Truce. For now. Don’t get sentimental.',
    },
  },
];
