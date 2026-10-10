/*
 * MÉMÉ (docs/story.md "Mémé"): Odette Aubry, Félix's mother and the player's grandmother, across town at the end of
 * bus line 38 (Linden Avenue). Most days a visit is a cup of tea and two words; on a Sunday she slips an envelope
 * into the player's hand; and when the player has come far enough she gets the photo album out, and a memory of
 * the player's childhood with Félix plays (`memories.ts`). Her words are here; what she knows of the sale grows with
 * the memories seen (`GrandmaTalk`); when the bus runs is the street's (`STREET_PLAN.busRide`).
 */

/** Who she is, as the words name her. */
export const GRANDMA = {
  name: 'Mémé',
  fullName: 'Odette Aubry',
  /** Félix's elder brother, who had her sign the sale (docs/story.md). */
  son: 'Gaspard',
  /** The Sunday envelope (coins), once a Sunday. */
  sundayCoins: 10,
} as const;

/** Her day by the hour (game hours): coffee at the table until `table`, the set until `knit`, then knitting, sleepy after `late`. */
export const GRANDMA_DAY = { table: 11.5, knit: 18, late: 20.25 } as const;

/** What she says, by moment. */
export const GRANDMA_TALK = {
  /** The very first visit: the album is already out. */
  first: 'There you are! Look at you. Sit, sit. I got the album out, I knew you’d come.',
  /** On the way in, by the hour. */
  hello: {
    morning: [
      'Good morning, love. There’s coffee in the pot, it’s still hot.',
      'You’re up early! I’m only on the crossword.',
      'Oh, it’s you! Sit down, I’ll find you a biscuit.',
      'Morning! I heard the bus and I thought: that’s for me.',
    ],
    day: [
      'Oh, it’s you! The kettle’s on.',
      'Come in, come in. Mind the rug, it slides.',
      'Did you eat? You never eat.',
      'You came all this way on the bus? Sit down.',
      'I was only watching the quiz. They’re all idiots this week.',
    ],
    evening: [
      'Evening, love. I was about to draw the curtains.',
      'At this hour? Come in, you’ll catch your death.',
      'Oh, company! I was only counting stitches.',
    ],
    late: [
      'It’s late, you know. The last bus is at nine.',
      'You’ll miss your bus, love. I’m half asleep anyway.',
    ],
  },
  /** A Sunday: lunch, and the envelope. */
  sunday: 'Sunday lunch! There’s blanquette. And this is for you, don’t argue.',
  /** The first visit falls on a Sunday: the envelope after the first hello. */
  firstSunday: 'And it’s Sunday, so this is for you. Don’t argue.',
  /** The album has a memory the player has not seen yet. */
  albumReady: 'I found more photos. Come and look, on the table.',
  /** The time: past `GRANDMA_DAY.late`, clicked, before her chat. */
  lastBus: 'Don’t let me keep you. The last bus is at nine, and the driver won’t wait for you like he waits for me.',
  /** Clicked, a line at a time: always, then once the memory named has been seen (what she can bring herself to say). */
  chat: {
    always: [
      'Félix used to sit exactly where you’re standing. Every Sunday, forty years.',
      'Félix kept every box. Even the plastic from the boxes. I used to tease him.',
      'You have his hands, you know. Always fiddling with something.',
      'The bus driver is a nice boy. He waits for me on the step.',
      'I don’t understand the games. I understood that he loved them.',
      'Your mother rings on Thursdays. She sends her love, she says. She could send a postcard.',
      'The woman downstairs has a new dog. It barks at the radiator.',
      'I made jam in September. Take a jar, I can’t eat it all.',
      'He used to explain the games to me. Something about a plumber. I nodded.',
    ],
    /** Once the row at her table has been seen (memory `row`): Gaspard's pressure. */
    row: [
      'Your uncle Gaspard rang. He always rings when he wants something.',
      'Gaspard never forgave Félix for being happy with so little.',
      'Gaspard says I should move somewhere smaller. Smaller than this!',
      'Those two fought over everything. The last potato. The window seat.',
    ],
    /** Once the sale has been seen (memory `sale`): the papers, Crane. */
    sale: [
      'The papers, the sale… I didn’t read them properly. Gaspard said it was simpler.',
      'That Crane man sent flowers after the sale. I put them in the bin.',
      'Gaspard bought himself a new car that spring. I didn’t say anything. I should have.',
      'If you ever see that man in the camel coat, you tell him Odette remembers.',
    ],
    /** Once the keys have been handed over (memory `keys`): peace. */
    keys: [
      'I sleep better since you have the flat. Silly, isn’t it.',
      'Félix would have liked you there. He’d have hated what you did with the kitchen.',
    ],
  },
  /** On the way in now and then, and in her chat: what she has heard of the player's doings. */
  news: {
    fewGames: 'Félix started with one game too. One box, on a kitchen chair.',
    games: 'You’ve got ten games already? Félix would have made you write a list.',
    manyGames: 'Fifty games, your mother says! Where do you put them all?',
    roomFull: 'They say the flat looks like his again. I’d like to see it one day. When my knees allow.',
    medal: 'Somebody told me you beat one of those machines at the arcade. Félix was hopeless at them.',
    notebook: 'You found his notebook? His handwriting was terrible. Mine’s worse.',
    crane: 'You beat some collector to a game, I heard. Good. Don’t gloat, mind. Félix always gloated.',
    trail: 'Félix talked about a grey cartridge, at the end. I thought it was the medicine talking.',
    prototype: 'You found his grey cartridge? Oh, love. He looked for that for twenty years.',
  },
  /** She yawns, late in the evening, as the hello goes. */
  yawn: 'Excuse me. It’s past my bedtime, nearly.',
  /** Given something: her thanks, by what. */
  gift: {
    flowers: ['Flowers! For me? Fetch the blue vase, love, on the sideboard.', 'Dahlias, tulips, whatever they are: you shouldn’t have. You should, actually.'],
    cake: ['You baked? You! Félix burnt water. Let me get a plate.', 'Mm. A bit dry. No, it’s lovely. Have you got the recipe?'],
    /** A game shown to her: `{title}` is its name. */
    game: ['{title}? I’ve no idea what that is, but you look happy, so it’s good.', '{title}. Félix had that one, I think. Or one with the same box.', 'Show me how it works, one day. Not today, I’ve the wrong glasses on.'],
  },
  /** The envelope, as the reward banner words it. */
  envelope: { title: 'Mémé’s envelope', detail: '“For your games. Don’t tell Gaspard.”' },
  /** The envelope on a day the saleroom has a sale (`economy/AuctionHouse.isAuctionDay`): her nod to it. */
  envelopeSale: { title: 'Mémé’s envelope', detail: '“For the sale this afternoon. Find something Félix would have liked. Don’t tell Gaspard.”' },
} as const;
