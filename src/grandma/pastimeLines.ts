/*
 * WHAT MÉMÉ SAYS while the player does things with her (docs/grandma.md "Things to do with her"): the quiz on her set,
 * the crossword, the cards, the wool. `{answer}`, `{card}`, `{suit}` are filled in (`{Card}`: a capital first).
 */

export const PASTIME_LINES = {
  quiz: {
    /** The entry, and her words as the show starts. */
    entry: 'Watch the quiz with her',
    start: ['Oh, it’s starting! Sit, sit. That man with the teeth is back.', 'Quick, it’s the quiz. I’m on a winning streak, you know. Since Tuesday.'],
    /** She blurts an answer: right, or not. */
    blurtRight: ['{answer}! It’s {answer}, everybody knows that.', '{answer}. Next!', 'Oh, {answer}, obviously.'],
    blurtWrong: ['{answer}! No… yes. {answer}.', 'It’s {answer}, I’d put my teeth on it.', 'Is it {answer}? It’s always {answer}.'],
    /** The video games: she has no idea and guesses anyway. */
    blurtGames: ['{answer}? I’m guessing. Félix would know.', 'I’ll say {answer}. It sounds like a game.', 'Don’t look at me. {answer}?'],
    /** The player's answer, right or wrong. */
    youRight: ['Clever thing! You get that from me.', 'See? All that reading.', 'Bravo. He’d have said that too.'],
    youWrong: ['Ooh, no. Never mind, love.', 'That’s what I would have said. Before.', 'They make them hard on purpose.'],
    /** The round over: the player ahead, level, or her ahead. */
    endYou: ['You beat me! Don’t tell the woman downstairs.', 'Well! You should go on it. You’d win a caravan.'],
    endLevel: ['Neck and neck. Like your uncles at Monopoly.', 'A draw. We’re a clever family.'],
    endHer: ['I win! I watch it every day, it’s not fair.', 'Ha! Mémé’s still got it.'],
    /** The coin for being clever (a round won). */
    coin: { title: 'For being clever', detail: '“Here, buy yourself something. Don’t argue.”' },
  },
  crossword: {
    entry: 'Help her with the crossword',
    start: ['I’m stuck on one. Seven across. Have a look, your eyes are better.', 'This one’s been bothering me since breakfast.'],
    wrong: ['No, that won’t fit with the one going down.', 'Hm. The letters don’t match, love.', 'Not that. Try again, there’s no hurry.'],
    /** After two misses, she sees one more letter. */
    hint: 'Wait, I’ve got another letter from the one below. There.',
    solved: ['That’s it! In ink, then.', 'Of course! It was on the tip of my tongue.', 'Lovely. Now I can do the rest myself.'],
    /** Left to her. */
    leave: 'Never mind, it’ll come to me in the bath.',
  },
  cards: {
    entry: 'A game of cards?',
    /** On her way to the table. */
    fetch: ['Cards! Fetch the pack from the top drawer, love. The good one.', 'Oh, go on then. One game. Two.'],
    /** Her turn. */
    play: ['{Card}. Your go.', 'There. {Card}.', 'I’ll put down {card}, and I’ll say no more.'],
    eight: ['An eight! And I want {suit}.', 'Eight. {Suit}, please.'],
    draw: ['I’ll take one.', 'Nothing. I’ll draw.', 'Hm. Give me one off the top.'],
    /** A card of the player's that will not go. */
    refuse: ['Not that one, love. It has to be {suit}, or the same number.', 'That won’t go on there. {Suit}, or the same number. Félix cheated too, you know.'],
    /** She slips a card that does not match, then owns up. */
    cheat: ['{Card}… oh, that’s not the right suit, is it. My eyes. I’ll draw.', 'There. What? No, you’re right. I was testing you.'],
    /** The game over. */
    youWin: ['You! Well. I let you win, obviously.', 'Out already? You’re as bad as Félix.'],
    herWin: ['Mémé wins! Write it down. On the back of the envelope.', 'Out! Never play cards with an old lady, love.'],
  },
  wool: {
    entry: 'Hold the wool for her',
    start: ['Hold your hands up. Like this. Don’t move them, I’ll do the rest.', 'Good, I need someone with hands. Up, apart, still.'],
    /** While the yarn runs, a line at a time. */
    talk: [
      'I knitted Félix a jumper once. Green. He wore it for a photo and never again.',
      'My mother knitted in the dark, during the war. She said her hands could see.',
      'Purl, plain, purl. It’s like a song, after a while.',
      'You’re steadier than Gaspard. He gave up after a minute. He always gave up after a minute.',
      'Your mother hated holding the wool. She’d read over my shoulder instead.',
      'There, look. That’s a whole row already.',
    ],
    /** Too tight, the yarn snaps: she ties a knot, no harm. */
    snap: 'Oops! Butterfingers. There, a knot. Nobody will see it.',
    done: ['That’s a good length. Thank you, love.', 'Lovely. Same time tomorrow?'],
    /** The last session: the scarf is done. */
    scarf: { title: 'Mémé’s scarf', detail: '“There. It’s for you, it was always for you. Wear it, and don’t tell me if it itches.”' },
    /** The scarf is done already: what the wool goes to now. */
    after: ['Socks, this time. For you, but don’t tell anyone.', 'A tea cosy. The old one has a hole the size of a fist.'],
  },
} as const;
