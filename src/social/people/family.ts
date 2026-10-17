import type { PersonCard } from '../types';

/** Mémé's id in the social layer (her standing, her page in the book, her number in the phone). */
export const MEME_ID = 'meme';
/** Gaspard's, Félix's elder brother (docs/grandma.md "The end of the story"). */
export const GASPARD_ID = 'gaspard';

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
    depth: 'deep',
    topics: [
      { id: 'kitchen', say: 'Something smells good, Mémé!', again: 'What’s on the stove today?', name: 'Her cooking', icon: 'cooking', fit: 'loves', obvious: true, teaches: 'blanquette', memory: 'you came round hungry', answers: ['Blanquette, what else? Sit, there’s enough for an army.', 'It’s only a little something. Take some home, you’re too thin.', 'Taste. No, taste properly. More salt? Don’t answer, I know.'] },
      { id: 'bus', say: 'Still charming the bus drivers?', name: 'The 38', icon: 'car', fit: 'likes', teaches: 'busDriver', answers: ['The young driver waited for me to sit down. A gentleman.', 'Thirty-eight stops. I count them like a rosary.'] },
      { id: 'felix', say: 'What was Félix like as a boy?', name: 'Félix as a boy', icon: 'family', fit: 'loves', from: 'friend', teaches: 'felixBoy', memory: 'you asked me about Félix as a boy', answers: ['Dreamy. Always taking things apart. The clock, the radio, my patience.', 'He hid under the table with a torch and a comic. I pretended not to know.'] },
      { id: 'quiz', say: 'Seen any good quiz shows?', name: 'Her quiz shows', icon: 'film', fit: 'likes', from: 'friend', teaches: 'knitting', answers: ['I knew every answer last night. Every one. The man on the telly didn’t.', 'I knit through them. Purl, plain, “the Danube”. Purl, plain.'] },
      { id: 'dance', say: 'How did you meet Grandpa?', name: 'How she met Grandpa', icon: 'heart', fit: 'loves', from: 'close', teaches: 'dance', memory: 'you asked how I met your grandfather', answers: ['A dance, in fifty-two. He trod on my feet all evening. I married him anyway.', 'He asked me to dance four times. The fourth time I said yes, to stop him asking.'] },
      { id: 'home', say: 'You should rest more, Mémé.', name: 'Being told to rest', icon: 'health', fit: 'dislikes', answers: ['Rest? I’ll rest when I’m dead. Pass me the salt.', 'Gaspard says that too. I’m old, not made of glass.'] },
    ],
    moods: { good: ['a letter from an old friend', 'good leeks at the market', 'a chat with the driver'], low: ['her hip this morning', 'missing Félix', 'a quiet Sunday'] },
    whereabouts: 'At home on Linden Avenue, bus 38 from Front Street, from eight till nine; Sunday lunch at noon',
    intro: 'It’s your Mémé, who else? Come here and let me look at you.',
    traits: ['nostalgic', 'generous', 'earlyBird', 'chatty'],
    likes: ['flowers', 'cake', 'croissant'],
    birthday: 33,
    look: { seed: 1931, role: 'shopper', sex: 'woman', age: 'elder' },
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
      leaving: ['Off you go, my programme’s starting.', 'Go on, you’ve things to do. Come back Sunday!'],
      bye: ['Wrap up warm!', 'Kisses, darling.', 'Ring me when you’re home.'],
      repeat: ['You told me already, darling. I’m old, not deaf.'],
      hello: ['There you are! Sit, sit.', 'Oh, it’s you! The kettle’s on.', 'Did you eat? You never eat.'],
      chat: ['Oh, the usual. My hip, my plants, my programmes. I’m fine, darling.', 'Tell me everything. Slowly, my ears aren’t what they were.', 'You look tired. Are you sleeping? You’re not sleeping.'],
      joke: ['Oh, you! Félix was just the same.'],
    },
    startWarmth: 60,
    startTrust: 50,
    listed: 'always',
    family: true,
  },
  {
    // Félix's elder brother (docs/grandma.md "The end of the story"): at her Sunday table now and then once the row is
    // seen in her album. Not family as Mémé is: he can go cold, and stay there.
    id: GASPARD_ID,
    name: 'Gaspard Aubry',
    short: 'Gaspard',
    role: 'your uncle, Félix’s elder brother',
    group: 'friends',
    depth: 'deep',
    topics: [
      { id: 'cars', say: 'How’s the car business?', again: 'Sold many cars this week?', name: 'His garage', icon: 'car', fit: 'likes', obvious: true, teaches: 'garage', answers: ['Thirty-nine honest cars. Business is business.', 'People want big cars. I sell them big cars. I don’t have to like it.'] },
      { id: 'football', say: 'Did you catch the match?', name: 'The football', icon: 'sport', fit: 'loves', teaches: 'football', memory: 'you talked football with me', answers: ['Now you’re talking. Finally someone at this table with sense.', 'Three-one, at home. Robbery. Don’t get me started.'] },
      { id: 'maman', say: 'Mémé was glad you came.', name: 'Coming to see Maman', icon: 'family', fit: 'loves', from: 'friendly', memory: 'you told me Maman was glad I came', answers: ['…Was she? Good. Don’t tell her I asked.', 'I should come more. Don’t look at me like that, I know.'] },
      { id: 'hurry', say: 'Always in a hurry, aren’t you?', name: 'His hurry', icon: 'work', fit: 'meh', from: 'friendly', teaches: 'watch', answers: ['Time is money. Someone in this family had to understand that.', 'I’m not in a hurry. I’m organised. There’s a difference.'] },
      { id: 'games', say: 'Did Félix show you his games?', name: 'Félix’s games', icon: 'games', fit: 'dislikes', answers: ['Plastic and nostalgia. There’s a market for it, I’ll give you that.', 'Félix had a cupboard of those. You know how that ended.'] },
    ],
    moods: { good: ['a car sold before noon', 'his team won'], low: ['the ring road traffic', 'a sale fallen through'] },
    whereabouts: 'At Mémé’s Sunday table some weeks, from lunch until he remembers the traffic',
    intro: 'Gaspard. Your uncle, if anyone ever told you. Sit, you’re blocking Maman’s light.',
    traits: ['proud', 'competitive', 'grumpy'],
    likes: ['coffee'],
    dislikes: ['plush', 'scrap'],
    birthday: 41,
    look: { seed: 1958, role: 'shopper', sex: 'man' },
    facts: [
      { id: 'garage', text: 'Sells second-hand cars out by the ring road', says: 'Aubry Motors, by the ring road. Forty cars on the forecourt, thirty-nine of them honest.' },
      { id: 'watch', text: 'Checks his watch more than he looks at people', says: 'Time is money. Félix never understood that. He thought time was time.', from: 'friendly' },
      { id: 'football', text: 'Never misses a match on the radio', says: 'Saturday, three o’clock, the radio on in the showroom. Customers wait.' },
    ],
    lines: {
      leaving: ['Right. The traffic.', 'I have a buyer at four. Maman, I’m off.'],
      bye: ['Hm. Mind how you go.', 'See you, then.'],
      hello: ['Ah. You.', 'Still here? Good. Maman likes the company.'],
      cold: ['Hm.', 'I’m eating.'],
      joke: ['Ha. Félix’s sense of humour. It skipped me.'],
    },
    startWarmth: 0,
    startTrust: 10,
    listed: 'met',
  },
];
