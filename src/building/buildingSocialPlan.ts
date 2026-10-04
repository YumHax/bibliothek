import type { PersonId } from '@/social/types';

/*
 * What the building's standing changes, as data (docs/social.md "The building"): the feuds' notes on the hall's
 * board, the residents' asides in conversation, the party's poster and thanks by the building's opinion, Leclerc's
 * friendly visit, the weekly bad-mouthing. Read by `socialBuilding.ts`, `noiseComplaints.ts`, `coproMeeting.ts`.
 */
export const BUILDING_SOCIAL = {
  /**
   * A resident at war with the player (Hostile or worse) pins a note about them on the hall's board, on about half
   * the game days (`share`), each in their own voice; `fallback` for one without a note of their own.
   */
  feudNotes: {
    share: 0.5,
    weight: 1,
    paper: 0xfdfbf4,
    byPerson: {
      leclerc: { title: 'TO WHOM IT MAY CONCERN', lines: ['The 5th floor is not a discotheque.', 'Some of us have worked all our lives', 'and would like to sleep.'] },
      dubois: { title: 'A WORD TO THE WISE', lines: ['Not everyone in this building', 'is who they seem.', 'Ask me. I know things.'] },
      moreau: { title: 'PLEASE', lines: ['Whoever drags boxes about upstairs:', 'there are people underneath.', 'Thank you in advance.'] },
      haddad: { title: 'COLLECTORS BEWARE', lines: ['Some “collectors” in this building', 'buy to hoard and never play.', 'Shame.'] },
      pereira: { title: 'NOTICE FROM THE LODGE', lines: ['Parcels for the 5th floor', 'will be kept at the lodge', 'when convenient.'] },
    } as Partial<Record<PersonId, { title: string; lines: string[] }>>,
    fallback: { title: 'TO THE 5TH FLOOR', lines: ['We know it was you.', 'The whole building knows.'] },
  },
  /** Mrs Dubois, hostile, talks about the player to those she likes: once a game week, this much warmth × the tie. */
  badMouths: { everyDays: 7, warmth: -4, why: 'heard Mrs Dubois talk about you' },
  /**
   * Leclerc at Close: the flat loud after ten, he comes up once a night, not to complain but to listen a while
   * (`noiseComplaints`), with a warmth of his own for it.
   */
  leclercVisit: {
    lines: ['I heard the music through the ceiling. Is that the one with the trains? …No? Pity. I’ll listen from downstairs.', 'Don’t turn it down on my account. I don’t sleep anyway. What is it?', 'Mireille would have liked this one. Good night, neighbour.'],
    warmth: 3,
    memory: 'we listened to your game together, late',
  },
  /** What a noise complaint leaves in Leclerc's memory, and his mood the next day. */
  complaintMemory: 'you kept me up past ten',
  complaintMood: 'Kept awake by your noise last night',
  /** Mrs Dubois, Friendly: "Any news?" tells the building's news, sometimes a resident's secret (a fact of theirs learned). */
  duboisNews: {
    label: 'Any news in the building?',
    noNews: 'Nothing! Can you believe it? A whole day and nothing. I’m worried.',
    board: 'Have you seen the board? “{title}”. {line}',
    secret: 'Between us, about {name}… {says}',
  },
  /** Mme Pereira's own entries: the post, the building's opinion. */
  pereira: {
    postLabel: 'Anything in the post for me?',
    postNone: 'Nothing for you today. I would know.',
    postSome: '{n} for you on its way. The postman brings it on his {when} round. If you’re out, I take it in.',
    postDue: 'Your parcel is here already! Go on up, I gave it to the postman again.',
    opinionLabel: 'What does the building think of me?',
    opinion: 'What do they say? They call you {name}. I only repeat.',
    roofKey: { title: 'The roof key', detail: 'Mme Pereira trusts you: the roof, at night, is yours too.' },
  },
  /** The concierge's goodwill and the post (game hours added to a parcel's round): Cold a day late, Friend a round sooner. */
  parcels: { late: 24, sooner: -5 },
  /** M. Bertin, Friendly: the next agenda, early. */
  bertin: {
    label: 'What’s on the next agenda?',
    line: 'Between ourselves, day {day}: {items}. Not a word before it is pinned.',
  },
  /** The party's poster and thanks, by the building's opinion of the player (`reputation.buildingWarmth`). */
  party: {
    warm: 15,
    cold: -10,
    posterWarm: 'Yes, the 5th floor too: bring the games!',
    posterCold: 'Everyone welcome. Even the 5th floor.',
    toast: 'A toast to {name}!',
  },
  /** Mrs Moreau got out of the stuck lift with the player there: warmth, and a memory. */
  freedFromLift: { warmth: 8, why: 'got her out of the lift', memory: 'you stayed with me when the lift was stuck' },
  /** The power cut brings everyone out: the building's mood, that day. */
  powerCutMood: 'The power cut: candles on the landings',
  /** The meeting's outcome: whose side won. */
  meetingMood: { won: 'Pleased with the meeting', lost: 'Lost a vote at the meeting' },
} as const;
