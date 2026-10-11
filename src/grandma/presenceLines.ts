/*
 * WHAT MÉMÉ SAYS AROUND THE VISIT (docs/grandma.md "Her presence"): getting up to the door, the tea, her little jobs
 * about the flat, Gaspard on the phone, what she remembers of the player's doings, and what she makes of the news
 * the player tells her. Her hello itself is `grandma.ts`'s.
 */

/** The player's news as she hears it (the journal's kinds she cares for). */
export type HeardKind = 'bought' | 'gift' | 'prize' | 'medal' | 'pennant' | 'cat' | 'home' | 'sold' | 'visit' | 'party' | 'met' | 'felix' | 'hunt';

export const PRESENCE_TALK = {
  /** Getting up to the door, called out from her seat. */
  coming: ['Wait, wait, I’m coming!', 'Don’t move, let me look at you.', 'Is that who I think it is?'],
  /** Back from the market on the same bus as the player (`SharedRide.cameWith`): the shopping put down first. */
  cameWith: 'Let me put the shopping down. There. Now hello properly.',
  /** Late in the evening she stays put: her knees. */
  stayingPut: 'Come here, love, my knees have gone to bed already.',

  /** Tea: the entry (the player's words), her answer, a word from the kitchenette, the cups poured. */
  tea: {
    ask: 'Any chance of a cup of tea?',
    yes: ['I thought you’d never ask.', 'The kettle’s always half full in this house.', 'Sit down, I’ll do it. No, sit.'],
    kitchen: ['Milk? No, you never took milk. Félix took three sugars, the heathen.', 'Where did I put the good biscuits… Behind the flour. Always behind the flour.', 'This kettle’s older than you. It still whistles in tune.'],
    poured: ['There. Mind, it’s hot.', 'Proper tea. Not those little bags on a string.', 'Drink it while it’s hot, it does you good.'],
  },

  /** Sitting with her: the entry. */
  sit: 'Sit with her a while',

  /** Her little jobs about the flat, said to herself in passing (a word over her head, now and then). */
  chores: {
    canary: ['There you are, Pipo. Seeds.', 'Sing for the visitor, go on.', 'Greedy bird.'],
    clock: ['Four minutes slow again.', 'There. Georges would be proud.'],
    curtainsShut: ['That’s enough of the avenue for today.', 'Nights are drawing in.'],
    curtainsOpen: ['Let’s have some light.', 'Look at that sky.'],
    plant: ['You’re thirsty, aren’t you.', 'Félix gave me this one. It outlived him. Plants do.'],
    frame: ['Crooked again. It’s the trams. There haven’t been trams for forty years.', 'There.'],
  },

  /** Gaspard on the phone: her side heard, a line once she is back. */
  gaspard: {
    pickUp: 'Hello? … Oh. Gaspard.',
    side: [
      ['Yes, Gaspard.', 'No, Gaspard. I haven’t thought about it.', 'Because I don’t want to, that’s why.', 'My grandchild is here, as it happens. Yes. Yes, I’ll tell them.'],
      ['I’m eating, Gaspard. Yes, properly.', 'No, I don’t need a smaller flat. I need a smaller son.', 'That was a joke. Mostly.'],
      ['Sunday? I’m busy Sunday.', 'Busy with my grandchild. Yes, every Sunday now.', 'Goodbye, Gaspard.'],
      ['The papers? What papers? Oh, those papers.', 'I’ve put them somewhere safe. Very safe. I forget where.', 'Yes, Gaspard. Bye, Gaspard.'],
    ],
    back: ['Your uncle. He says hello. He didn’t, but I’m saying it for him.', 'Gaspard. He wants me in a home with a view of a car park.', 'That man. Where did I go wrong? Don’t answer that.'],
  },

  /** What she remembers of the player's life, asked on the way in (each now and then). */
  remember: {
    cat: ['How’s {cat}? Does it sleep on your games?', 'Is {cat} eating properly? Cats know when you’re skimping.', 'Give {cat} a scratch from me. Behind the ears.'],
    noCat: 'You should get a cat, love. A flat needs a cat. Félix had a tortoise. It wasn’t the same.',
    neighbour: {
      roux: 'Your mother says you’ve met Mrs Roux. A widow, is she? You keep an eye on her.',
      moreau: 'And the piano teacher, downstairs from you? Does she play all night? Félix would have loved that.',
      leclerc: 'That railway man in your building, Leclerc. Is he still counting everyone’s footsteps?',
      nguyen: 'The family with the twins: do they ever sleep? Take them some sweets from me.',
      girard: 'The removals man, Girard. Strong arms, I hear. Ask him to carry your shelves.',
      haddad: 'Mrs Haddad, the Sega lady. Is that a kind of sewing machine? Never mind.',
    } as Record<string, string>,
    noNeighbour: 'Have you met your neighbours yet? In my day you took them a cake on the first week.',
    shown: ['Did you ever play that {title} you showed me? Was it any good?', 'That {title}: have you finished it? Or do they not finish, those games?'],
    scarf: 'You’re wearing my scarf! There’s a dropped stitch on the left. Don’t look.',
    noScarf: 'Where’s my scarf? Don’t tell me it’s in a drawer.',
    missedSunday: ['You didn’t come on Sunday. I made blanquette for two and ate it for three days.', 'No visit on Sunday? I kept a plate warm till four. It’s fine. It’s fine.'],
  },

  /** The player's news: the entry (the player's words), then her answer by kind (`{x}` the thing, `{who}` someone). */
  tell: {
    ask: 'Guess what!',
    heard: {
      bought: ['{x}? Is that one of the good ones? Don’t tell me what you paid.', '{x}! Félix would have known all about it. I’ll take your word for it.', 'Another one! Where do you put them all?'],
      gift: ['A present? From {who}? You keep friends like that.', '{who} gave you that? Then you go round with a cake, it’s only manners.'],
      prize: ['{x}? Won at the fair? Your grandfather won me a teapot once. Ugliest thing I own. I still have it.', 'A prize! Put it somewhere it can be seen.'],
      medal: ['Another medal from those machines! I’ll have to buy you a bigger mantelpiece.', 'Félix was hopeless at those machines. You must get it from me.'],
      pennant: ['The whole week’s winner? Oh, love. Bring me the pennant, I want to see it.'],
      cat: ['A cat! What’s it called? Feed it on time, they don’t forgive.'],
      home: ['You’re making it a home, then. Good. A flat isn’t just walls.', 'New things for the flat! Not too many, mind. Leave room to breathe.'],
      sold: ['You sold one? Félix never sold a thing. Mind you, he never had a bean either.', 'Sometimes you have to let one go. I sold my mother’s brooch once. I still dream of it. No, you did right.'],
      visit: ['Company! Good. A flat’s for people, not just boxes.', 'Did you offer them something? Tell me you offered them something.'],
      party: ['A party at yours! At your age I danced on a table. Once. Don’t tell your mother.', 'All those people in Félix’s flat. He’d have hidden in the kitchen and loved every minute.'],
      met: ['You met {who}? Nice? Good. Neighbours are worth more than furniture.', '{who}. I’ll remember that. I won’t, but I’ll try.'],
      felix: ['Back on his shelf… Oh, love. He’d be so pleased.', 'One of his, home again. I’ll light a candle. Don’t laugh.'],
      hunt: ['A treasure hunt in your building? In my day we just had the gas man.'],
    } satisfies Record<HeardKind, readonly string[]>,
  },
} as const;
