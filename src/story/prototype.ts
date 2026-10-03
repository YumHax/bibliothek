import type { Game } from '@/catalog/types';
import type { Reviews } from '@/reviews/Reviews';

/*
 * THE LOST PROTOTYPE, the fiction: an NES game nobody ever sold. Halcyon Byte, four people in an office
 * over the launderette on Front Street (1990-1993), were finishing MOONPOST, a postman's rounds on the
 * moon, when their publisher folded in December 1993. The last build went home with Hana B., who wrote
 * its music. Everything here is invented: no real studio, no real game. The trail's words live here;
 * `PrototypeStory` decides when each is said.
 */

/** The cart's id in the collection: never one of the catalogue's (`gameIdFor` ids have a platform prefix and a name). */
export const PROTOTYPE_ID = 'proto:nes:moonpost';

export const STUDIO = 'Halcyon Byte';
export const COMPOSER = { name: 'Hana B.', initials: 'HAB' };
/** The friend the collector swapped the grey cart to (one of `world/visitors/friendsPlan`'s). */
export const KEEPER = { id: 'marco', name: 'Marco' };

/** The copy the player ends up with: the grey cart in a plain box, its design notes folded in for a manual. */
export function prototypeGame(day: number, where: string): Game {
  return {
    id: PROTOTYPE_ID,
    title: 'Moonpost',
    platform: 'nes',
    developer: STUDIO,
    publisher: 'Never published',
    genre: 'Action (unreleased prototype)',
    region: 'Europe',
    description:
      'Build 0.9 of Halcyon Byte’s last NES game, a postman’s rounds on the moon, shelved in December 1993 when its publisher folded. ' +
      'A grey development cart with a handwritten label, in a plain box. Never sold, never reviewed, never finished.',
    status: 'owned',
    condition: 'complete',
    acquired: { price: 0, where, day },
  };
}

/** Its "reviews": the one preview it ever had, in the paper of the time (fiction, said as such on the card). */
export const PROTOTYPE_REVIEWS: Reviews = {
  article: null,
  scores: [{ source: 'Preview', score: 'HOT!' }],
  quote: { text: 'The most charming thing we played at the autumn show. A postman, the moon, and the best music on the NES this year.', source: 'The Gaming Weekly, Oct. 1993' },
  fiction: { credit: 'A preview from the time: the game never came out, so nobody reviewed it.' },
};

/** A flyer or letter on the doormat (`hallway/mail.ts`'s piece, by shape). */
export interface StoryMail {
  title: string;
  lines: string[];
  accent?: number;
}

/** The trail's steps, in order: each is the clue found so far. */
export type StoryStage = 'waiting' | 'clipping' | 'stall' | 'radio' | 'arcade' | 'trader' | 'found' | 'ended';

/** What each clue says in the journal's file (the player's own notes). */
export const CLUE_NOTES: Record<Exclude<StoryStage, 'waiting'>, string> = {
  clipping: `MOONPOST, by ${STUDIO} (NES, 1993): previewed, never released. The paper says a dev cart survives round here.`,
  stall: `${STUDIO} had an office over the launderette on Front Street. Radio Brocante once had the team on the morning show.`,
  radio: `${COMPOSER.name} wrote the music and kept the last build. She signs ${COMPOSER.initials} on the arcade's tables.`,
  arcade: `${COMPOSER.name} moved away. Before going she sold her old carts to the collector outside RETRO GAMES.`,
  trader: `The collector swapped the grey cart to ${KEEPER.name}, of all people.`,
  found: `${KEEPER.name} had it all along: the grey cart, MOONPOST v0.9. It works in the NES.`,
  ended: `Delivered. ${COMPOSER.name}'s letter was in the box.`,
};

/** Where to look next, for the journal (vague on purpose: a lead, not a waypoint). */
export const NEXT_LEADS: Record<StoryStage, string> = {
  waiting: '',
  clipping: 'Ask at the flea market: the NES stall remembers everything.',
  stall: 'Have the kitchen radio on some morning: Radio Brocante’s chronicle.',
  radio: `Ask at the arcade's counter who ${COMPOSER.initials} is.`,
  arcade: 'Find the collector outside RETRO GAMES (he is not there every day), or watch the paper’s small ads: Hana left things behind.',
  trader: `See ${KEEPER.name}: next time a friend comes round, or ring them from the bedroom.`,
  found: 'Put the grey cart in the NES under the TV.',
  ended: '',
};

export const LINES = {
  /** THE GAMING WEEKLY's clipping on the mat: the start. */
  clipping: {
    title: 'LOST & FOUND',
    lines: [
      'THE GAMING WEEKLY, a clipping:',
      `“Whatever happened to MOONPOST? ${STUDIO}’s NES game, previewed in October ’93, vanished with the studio.`,
      'Word is a development cart survives, right here in the neighbourhood.',
      'The flea market’s NES stall remembers everything: ask them.”',
    ],
    accent: 0x2b4a7a,
  } satisfies StoryMail,
  /** The NES stallholder (any stallholder once the player has been slow to ask that one). */
  stall: `${STUDIO}! Their office was over the launderette, right here on Front Street. I sold their games new. MOONPOST? Never came out. Radio Brocante had the old team on one morning; they still talk about them. Listen in.`,
  /** Another stallholder, before the NES one has been asked. */
  otherStall: `${STUDIO}? Before my time. Ask the NES stall, they've been here since the eighties.`,
  /** Radio Brocante's line in the morning chronicle. */
  radio: `“A caller this morning about MOONPOST, the game that never was: ${COMPOSER.name}, who wrote its music, says the last build went home with her in ’93. She still plays at the arcade, we hear: look for ${COMPOSER.initials} on the tables.”`,
  radioLetter: {
    title: 'RADIO BROCANTE',
    lines: [
      'A note from the morning show:',
      `“You asked about MOONPOST: ${COMPOSER.name} wrote its music and kept the last build in ’93.`,
      `She plays at the arcade, signs ${COMPOSER.initials}. Ask at the counter. Good luck! — the producer”`,
    ],
    accent: 0x8a3b2f,
  } satisfies StoryMail,
  /** The arcade's attendant. */
  arcade: `${COMPOSER.initials}? Hana. Top of the old tables since before I worked here. She moved to the coast last year. Before she went she sold a box of carts to the collector who sets up outside RETRO GAMES. He wouldn't know a prototype from a doorstop.`,
  arcadeNote: {
    title: 'FROM THE ARCADE',
    lines: [
      'A note on the arcade’s paper:',
      `“Someone said you were asking about ${COMPOSER.initials}. That’s Hana: she moved away,`,
      'and sold her old carts to the collector outside RETRO GAMES first. — the attendant”',
    ],
    accent: 0x7a2e8f,
  } satisfies StoryMail,
  /** The collector outside RETRO GAMES. */
  trader: `A grey cart with a handwritten label? From the Hana box, yes. I swapped it: the label put buyers off. To ${KEEPER.name}, your friend. Pays cash, never haggles. Shame.`,
  traderCard: {
    title: 'THE COLLECTOR',
    lines: [
      'A business card, a line on the back:',
      `“Heard you’re after a grey cart, the Hana box. Swapped it to ${KEEPER.name}, your friend, months back.`,
      'If it’s worth something, I don’t want to know.”',
    ],
    accent: 0x55565a,
  } satisfies StoryMail,
  /** A friend who is not the keeper, asked about it. */
  otherFriend: `${KEEPER.name}? He's been showing everyone a grey cart with a handwritten label. Ring him, he'll bring it.`,
  /** The keeper hands it over. */
  keeper: `The grey cart? I thought it was a bootleg! I've had it in my bag for weeks. Here, it's yours: you'll know what to do with it. Just let me watch the first time it runs.`,
  keeperPostcard: {
    title: `A POSTCARD FROM ${KEEPER.name.toUpperCase()}`,
    lines: [
      '“Got your message about the grey cart!',
      'Thought it was a bootleg. It’s in the post: look in the parcel in the hall.',
      `Let me know if it actually runs. — ${KEEPER.name}”`,
    ],
    accent: 0x3b6b4a,
  } satisfies StoryMail,
  /** Hana's letter, folded in the box, read once the demo has played to its end. */
  letter: [
    'Whoever you are,',
    '',
    'If you are reading this, MOONPOST found its way to someone who plugged it in. That is all we ever wanted.',
    'There were four of us over the launderette. We had three months of work left and no publisher. I kept this build because the music was finished, and it was the best thing I ever wrote.',
    'Thank you for the round trip.',
    '',
    `— Hana, ${STUDIO}, December 1993`,
  ].join('\n'),
};

/**
 * Hana's old landlady's small ad (`Classifieds.inject`), in the paper from the day after the arcade's clue: what Hana
 * left behind in flat 7, and on the sideboard the collector's letter that came for her after she moved. Ringing and
 * going round is one more way to the collector's clue (the post still brings it if the player never goes).
 */
export const LANDLADY_AD = {
  id: 'story:moonpost:landlady',
  kind: 'clearOut',
  name: 'Mrs Delacroix',
  flat: 'flat 7',
  platform: 'nes',
  text: 'A former tenant left a box of NES games behind when she moved to the coast. They must go, cheap. Ring after 5.',
  hours: [17, 21],
  days: 4,
  games: ['nes-metroid', 'nes-castlevania', 'nes-contra', 'nes-kirbys-adventure'],
  greeting: 'You’re the one asking after Hana? She left these when she went. And a letter came for her after, from that collector: it’s on the sideboard, take it.',
  clue: {
    title: 'A letter for Hana, never sent on',
    text: [
      'Hana,',
      '',
      'Thanks for the box of carts. The grey one with your handwriting on it I couldn’t shift: the label put buyers off.',
      `I swapped it to ${KEEPER.name}, the lad who comes round the market on Saturdays. Hope that’s all right.`,
      '',
      '— the collector, outside RETRO GAMES',
    ].join('\n'),
  },
} as const;

/** The trail's pace, in game days (`Today.gameDay`): when it starts, and when a channel gives up and the post brings the clue. */
export const STORY_RULES = {
  start: { day: 3, games: 3 },
  /** Days after the clipping before any stallholder answers (not only the NES one). */
  anyStallAfter: 2,
  /** Days before the post brings what the radio, the arcade, the collector or the friend would have said. */
  fallbackAfter: { stall: 3, radio: 4, arcade: 3, trader: 4 } satisfies Partial<Record<StoryStage, number>>,
} as const;
