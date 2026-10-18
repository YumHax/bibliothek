/*
 * THE END OF THE FAMILY'S STORY, IN WORDS (docs/grandma.md "The end of the story"): the Game Boy of Christmas 95 (lot
 * one of the sale, in Victor Crane's hands), told by Mémé, bought back from Crane, put back in her hands; then her
 * visit to the flat: the stairs, the shelves, the kitchen, the armchair, the photo for her album.
 */

export const EPILOGUE_TALK = {
  /** Mémé, once the sale has been seen: the Game Boy's trail, once. */
  trail: [
    'There’s something I didn’t tell you. Your Game Boy, the grey one from that Christmas.',
    'It was in the sale, love. Lot one. He’d kept it all those years, in its box.',
    'That man in the camel coat bought it. Of course he did.',
  ],
  /** The journal, when she has told it. */
  trailNote: 'Mémé says Victor Crane has the Game Boy from Christmas 95',

  /** Victor Crane, asked about it. */
  crane: {
    ask: 'The Game Boy from lot one?',
    /** He names his price (`{price}` coins), by how he takes to the player. */
    price: [
      'Lot one. Grey, a Tetris, felt pen inside the lid. I wondered when someone would ask. {price}.',
      'Ah, the Christmas one. Sentiment is expensive. {price}, and I’m being kind.',
    ],
    /** Close: he gives it. */
    gift: 'Lot one. I never put it on a shelf, you know. It didn’t feel like mine. Take it.',
    buy: 'Buy back Félix’s Game Boy',
    short: 'Come back with the coins. It has waited thirty years, it can wait a week.',
    sold: 'There. Tell Odette… no. Tell her nothing from me.',
  },
  /** The reward banner, and the journal. */
  home: { title: 'Félix’s Game Boy', detail: 'Lot one, back from Victor Crane: the Game Boy and its Tetris. In the parcel in the hall.' },
  homeNote: 'Bought Félix’s Christmas Game Boy back from Victor Crane',
  /** What is written inside the lid (the copy's past, found when its box is opened). */
  lid: 'In felt pen inside the lid: “For the kid. Christmas 95. Blow on it if it sulks. F.”',
  /** Where it came from, on its receipt. */
  where: 'lot one of Félix’s sale, back from Victor Crane',

  /** Given back to her: the entry, then what she says holding it. */
  give: 'Give her the Game Boy',
  holding: [
    'Oh. Oh, it’s the one. Look, his writing, inside the lid.',
    'He wrapped it in the sports pages. You tore them like a puppy.',
    'Keep it. It was always yours.',
  ],
  givenNote: 'Put the Christmas Game Boy back in Mémé’s hands',

  /** She announces her visit to the flat (after the Game Boy, or once the keys are given in the album). */
  announce: ['And I’ve decided something. My knees and I.', 'I’m coming to see the flat. Saturday afternoon. No, don’t argue, I’ve looked at the bus times.'],
  upcoming: 'Mémé comes to see the flat',

  /** Her visit, at the player's. */
  visit: {
    /** On the landing / just inside (the first time, then later visits). */
    enter: ['Five floors! Félix did these every day? No wonder he had calves like a postman.', 'Hello, love. Don’t mind me, I’ll get my breath back in a minute. Or ten.'],
    enterAgain: 'It’s me! I was passing. On the 38, which goes nowhere near here, but still.',
    /** At a shelf, a game of Félix's notebook looked at (`{title}`). */
    his: ['{title}. That was his. I’d know that box anywhere.', 'Oh, {title}. He talked about that one at Sunday lunch for a month.'],
    /** At a shelf, another game (`{title}`). */
    shelf: ['All these boxes… he’d have been so jealous. And proud. Mostly jealous.', '{title}. I’ve no idea, love, but it’s very neatly put.', 'You’ve dusted. Félix never dusted.'],
    window: ['He could see the bakery from here. He bought far too many croissants.', 'Look at that, the whole street. I only get the plane trees.'],
    kitchen: 'And the kitchen! He’d have hated what you did with it. I love it.',
    /** The same, the kitchen still as bare as the day the flat was emptied. */
    kitchenBare: 'And the kitchen… bare as a church. Félix ate standing up too. You two!',
    /** A later visit: the cake she promised, out on the kitchen table (or one there already). */
    cake: 'I said I’d bring a cake, so I did. Lemon. It’s on your kitchen table, mind the cat.',
    cakeThere: 'I brought a cake, and you’ve got one already. Greedy. I’ll take mine home for the canary.',
    /** Sat down, once a visit, how things went (the first that applies, then the next on later visits). */
    reflect: {
      apologised: 'Gaspard rang me on Wednesday. Just to ring. And he says he said sorry to you too. Forty years, it took.',
      gone: 'Gaspard hasn’t rung. I don’t miss him. I miss who he was at six.',
      silent: 'Gaspard sends nothing. You said nothing that day, and it said everything.',
      prototype: 'And Félix’s grey cartridge, the moon one! You found it. He’d have danced on this rug.',
      gameBoy: 'I keep the Game Boy by my bed. I don’t play it. I just like it there, with its sports pages.',
    },
    cat: 'And who’s this? Félix sneezed at cats. He’d have kept it anyway.',
    tv: 'So that’s where the television goes. He had it there too, you know.',
    sit: 'There. I’ll just sit a minute. Félix’s armchair was by the window, but this will do.',
    /** Seated: she asks for the photo. */
    photoAsk: 'Now. Take a photo of me here, for the album. Go on. The last page is waiting.',
    photoLabel: 'Take her photo for the album',
    photoTaken: 'There. Now Félix’s flat is in my album too. With you in it. Well, behind it.',
    caption: 'Mémé at the flat',
    chat: ['Your bed’s made. Well. Nearly.', 'Is that the radiator that knocks? His knocked too.', 'I could live here. I won’t, mind. Too many stairs.'],
    leave: ['I’ll take the 38 home. No, don’t come down, my knees know the way.', 'Thank you, love. Same time next month? I’ll bring a cake.'],
    gaveUp: 'Nobody answered: Mémé took the 38 home. She’ll try next Saturday.',
    note: 'Mémé came to see the flat',
    reward: { title: 'Mémé came round', detail: 'Her photo is on the last page of her album.' },
  },
} as const;
