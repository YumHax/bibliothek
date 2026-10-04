/*
 * The building's perks that give the player something (docs/social.md "The building's perks"), as data: what each
 * resident gives, says and asks, and the numbers of the race, the cards, the meals, the cat sitting. Read by the
 * modules of `social/building/`.
 */

export const BUILDING_PERKS = {
  /** Mrs Roux's old stories: one a game day, in turn; the last ones point at what the hunt and the prototype need next. */
  roux: {
    stories: [
      'In 1971 the lift had a boy to work it. Albert Vasseur, the one upstairs, tipped him a coin every ride to go up past the fifth. Nobody else ever went up there.',
      'The courtyard’s chestnut was planted the year the building went up. Lovers carved their names in it. So did other people.',
      'Mr Lambert on the third, courtyard side, kept every letter he ever got. He said one day someone would need one of them.',
      'There used to be a radio shop on Front Street, my Lucien’s. Then the video game people took the floor over the launderette. Music all night!',
      'The concierge before Mme Pereira kept the cellar keys on a string round her neck. Mme Pereira keeps them in a biscuit tin. Progress.',
    ],
    /** Her word on the hunt's next step, by what it needs (the hunt's own lead after it). */
    huntIntro: 'Albert Vasseur? Oh, I remember. ',
    protoIntro: 'Video games, on Front Street? I remember those young people. ',
    /** Lucien's box: how many games, from which years (her grandson's), and the line. */
    lucien: { games: 4, years: [1986, 1994] as [number, number], where: 'Mrs Roux’s late husband', line: 'Lucien’s box. For the grandson, he said. The grandson plays on his telephone now. Take them: they should be played.' },
    /** What she leaves when she moves, by her tier: coins, and a game at close. */
    parting: { close: { coins: 120, game: true }, friend: { coins: 60, game: false }, friendly: { coins: 20, game: false } },
  },
  /** Mr Martin's late brother's cartridges: asked about (from Friend), then opened together (Close, trust). */
  martin: {
    carts: { games: 5, platform: 'nes', where: 'Gilles Martin’s cartridges' },
    ask: 'Gilles’s box… It is in my cellar, still taped. Every time I go down I look at it and come back up. Maybe one day, with someone.',
    open: 'There. Every one of them, in order, like he left them. He would want them played, not kept in a box. Keep them together, will you?',
    /** The cards in the power cut: the stake, the odds of winning, the winnings. */
    cards: { stake: 2, odds: 0.45, win: 6, warmth: 2, lines: { win: 'Belote! You have a feel for it.', lose: 'Ha! The cards like me tonight.' } },
  },
  /** Théo, the attic's student. */
  student: {
    repairFind: 'Théo’s trick: on these it is almost always the {part}. Look there first.',
    repairTool: 'Théo would reach for the {tool}.',
    homebrew: 'I burned you a cart. Real cartridge, real ROM, my own label. Put it in the NES and tell me what you think. Honestly. No, lie.',
    homebrewNone: 'You have all my carts already? Respect.',
  },
  /** Mrs Haddad. */
  haddad: {
    /** Her swaps' fair value ask, multiplied: she gives more for what she asks of you. */
    swapGenerosity: 1.2,
    loreIntro: 'Vasseur was a strange one. ',
    loreDone: 'You went up there? Then you know more than me now.',
    /** Her Sega find, kept aside: the friend's price (× the shop price). */
    finds: { share: 0.7, platforms: ['megadrive', 'mastersystem', 'gamegear', 'saturn'], line: 'I found two of this one at a car boot. One is yours, at what I paid.' },
  },
  /** Claire's return after the estate sale: from this many game days after it ends. */
  claire: {
    afterDays: 2,
    note: { title: 'FOR THE 5TH FLOOR', lines: ['I kept one of uncle Henri’s games back', 'from the sale. He would want you to have it.', 'It is in your parcel. Claire Lambert'], accent: 0x5a5a6a },
    years: [1983, 1991] as [number, number],
  },
  /** The Moreaus' Sunday lunch and the Nguyens' dinner: when they are offered, how long they last, what they give. */
  meals: {
    sundayLunch: { who: 'moreau', label: 'Accept Sunday lunch', hours: [11, 14] as [number, number], minutes: 150, warmth: 6, trust: 3, line: 'Paul made his gratin. Then Hugo made you play Mario Kart until his mother stopped it.' },
    familyDinner: { who: 'nguyen', label: 'Come to dinner', hours: [18, 21] as [number, number], minutes: 150, warmth: 6, trust: 3, line: 'Bao brought spring rolls up from the restaurant. The twins beat you at everything, twice.' },
    fade: { outMs: 900, darkMs: 1400, inMs: 900 },
  },
  /** The Moreaus feed the cat while the player is out at least this many game hours (once a game day). */
  catSitter: { awayHours: 5, below: 0.4, note: { title: 'FROM THE 4TH FLOOR', lines: ['We fed {cat} at {time}.', 'Kibble and a little ham. Don’t tell.', 'C. & P. Moreau'], accent: 0x4f6a5a } },
  /** Girard's race up the stairs: he starts with the player at least `minStoreys` below our landing. */
  race: { minStoreys: 2, perStorey: 6.2, spread: [0.9, 1.1] as [number, number], limit: 120, coins: 10, warmth: 4, start: 'Last one to the top buys the croissants! Go!', won: 'You beat me! Here, I owe you. Cardio, my friend.', lost: 'Ha! Too slow! Train on the stairs, like me.' },
  /** Rossi's coaching at Comets: real advice, one a game day. */
  rossiTips: [
    'Comets: never sit still in the middle. Drift, turn, shoot. The middle is where they meet.',
    'Comets: the little rocks are worth more and kill you more. Clear them first.',
    'Comets: thrust in short taps. Full thrust and you wrap round into trouble.',
  ],
  /** The postman's word at Friend: when the next round comes. */
  postmanRounds: 'I come round twice a day. Give the lift a shout, I’ll bring it to your door myself.',
  /** Pascal and the furniture (no weight to carry in the flat: a line). */
  girardCarry: 'Need something moved? Pianos are my job. Anything in your flat, I could carry with one hand. Just say.',
  /** The Nguyens' spare pad (games nights have no pad limit: a line). */
  nguyenPad: 'Take the spare controller for your games nights. The twins broke the other one anyway.',
};
