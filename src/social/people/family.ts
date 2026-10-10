import type { PersonCard } from '../types';

/** Mémé's id in the social layer (her standing, her page in the book, her number in the phone). */
export const MEME_ID = 'meme';

/*
 * The family (docs/story.md "Mémé", docs/social.md "Mémé"): Odette Aubry, Félix's mother, across town at the end of
 * bus line 38. In the book and the phone from the start; family, so her warmth never drifts nor falls under where it
 * starts, and nothing of hers is ever a penalty. Her portrait is her look in her flat (`world/grandma/familyLooks`,
 * remembered at start-up by `bootstrap/social`).
 */
export const FAMILY_PEOPLE: readonly PersonCard[] = [
  {
    id: MEME_ID,
    name: 'Odette Aubry',
    short: 'Mémé',
    role: 'your grandmother',
    group: 'friends',
    whereabouts: 'At home on Linden Avenue, bus 38 from Front Street, from eight till nine; Sunday lunch at noon',
    intro: 'It’s your Mémé, who else? Come here and let me look at you.',
    traits: ['nostalgic', 'generous', 'earlyBird', 'chatty'],
    likes: ['flowers', 'cake', 'croissant'],
    birthday: 33,
    look: { seed: 1931, role: 'shopper' },
    phone: true,
    facts: [
      { id: 'blanquette', text: 'Makes a blanquette every Sunday', says: 'Blanquette on Sundays, for forty years. Félix never missed one. Not one.' },
      { id: 'busDriver', text: 'Knows every driver on line 38 by name', says: 'The drivers on the 38 all know me. The young one waits until I’ve sat down before he pulls away.' },
      { id: 'knitting', text: 'Knits in front of the quiz shows', says: 'I knit through the quiz shows. I know all the answers, I just don’t say them.', from: 'friend' },
      { id: 'felixBoy', text: 'Kept Félix’s school reports in a biscuit tin', says: 'His reports are in the biscuit tin. “Dreamy, but gifted with his hands.” Every year the same.', from: 'friend' },
      { id: 'dance', text: 'Met her husband at a dance in 1952', says: 'I met your grandfather at a dance in fifty-two. He trod on my feet all evening. I married him anyway.', from: 'close' },
    ],
    effects: [{ key: 'knitsScarf', at: 'close', text: 'Has knitted you a scarf (the drivers on the 38 know her stitches)' }],
    lines: {
      hello: ['There you are! Sit, sit.', 'Oh, it’s you! The kettle’s on.', 'Did you eat? You never eat.'],
      chat: ['Tell me everything. Slowly, my ears aren’t what they were.', 'You look tired. Are you sleeping? You’re not sleeping.'],
      talkGames: ['I don’t understand the games. I understood that he loved them.', 'Félix tried to teach me Tetris once. I was very good, actually.'],
      compliment: ['Flatterer. You get that from your grandfather.'],
      joke: ['Oh, you! Félix was just the same.'],
    },
    startWarmth: 60,
    startTrust: 50,
    listed: 'always',
    family: true,
  },
];
