import type { SaleReaction } from '@/game/SessionActions';
import type { SellerKind } from '@/classifieds/rules';

/** What a private seller says: on the player's arrival, when clicked, as the coins change hands, and to what the player does with a copy. */
export interface SellerTalk {
  greeting: readonly string[];
  chat: readonly string[];
  thanks: readonly string[];
  react: Partial<Record<SaleReaction, readonly string[]>>;
  /** About the broken console on the box: what it does, and once it is bought. */
  console: { pitch: string; sold: string };
  /** Everything bought: the last word. */
  cleared: string;
}

export const SELLER_TALK: Readonly<Record<SellerKind, SellerTalk>> = {
  clearOut: {
    greeting: ['Come in, come in! They’re all on the table. Honestly, take the lot.', 'You found us! Mind the boxes. It’s all on the table, love.'],
    chat: [
      'He played them every night for years. Now it’s all phones.',
      'I don’t know one from another. You tell me what they’re worth.',
      'Anything left goes to the charity shop on Monday.',
    ],
    thanks: ['Oh, lovely. That’s one less thing in the cupboard.', 'There you go. He’d be glad it’s going to someone who cares.'],
    react: {
      pickUp: ['That one was his favourite, I think.', 'Oh, he was always shouting at that one.'],
      haggleWon: ['Go on then. I just want them gone.'],
      haggleLost: ['That’s what I’m asking, love.'],
      insult: ['Well! I’m not giving them away. Not quite.'],
    },
    console: { pitch: 'The console stopped working years ago. Take it for a few coins, if you can fix those things.', sold: 'Good riddance, that thing. Mind the cable.' },
    cleared: 'That’s the lot! You’ve emptied my cupboard. Thank you, love.',
  },
  mover: {
    greeting: ['Hi! Sorry about the mess, the van comes Friday. Games are on the table.', 'Come in. Everything must go, so make me an offer.'],
    chat: ['I can’t fit any of it in a suitcase. It all goes.', 'The flat’s nearly empty. Strange, isn’t it?', 'If you want the kettle too, it’s yours.'],
    thanks: ['Great, one less box.', 'Perfect. Enjoy them!'],
    react: {
      pickUp: ['Played that one to death at uni.', 'That’s a good one, honestly.'],
      haggleWon: ['Fine, fine. I’m in no position to argue.'],
      haggleLost: ['Sorry, I can’t go lower on that one.'],
      insult: ['Come on, I’m moving, not desperate.'],
    },
    console: { pitch: 'The console won’t start any more. It’s yours for next to nothing, if you want a project.', sold: 'Ha, brilliant. One less thing in the van.' },
    cleared: 'All gone! That’s a weight off. Good luck with them.',
  },
  collector: {
    greeting: ['Good, you’re on time. They’re laid out on the table. Please, handle them carefully.', 'Come in. Shoes off, if you don’t mind. Everything is on the table.'],
    chat: [
      'Complete in box, every one. I keep them in protectors.',
      'I’m only keeping the sealed ones and the Japanese imports now.',
      'I know what they go for at the market. Don’t try that with me.',
    ],
    thanks: ['A good home, I hope.', 'Look after it. Out of the sun.'],
    react: {
      pickUp: ['By the edges, please.', 'That one’s a first print, look at the back.'],
      haggleWon: ['Hm. All right. You know your stuff.'],
      haggleLost: ['That’s a fair price and you know it.'],
      insult: ['I’ll pretend I didn’t hear that.'],
    },
    console: { pitch: 'A spare I never got round to fixing. Sold as seen, no returns.', sold: 'It’s in better hands, I’m sure.' },
    cleared: 'Well. That’s the shelf cleared. A pleasure.',
  },
  loft: {
    greeting: ['Hello, dear. They were in Dad’s loft, I put them all on the table. Have a look.', 'Come in. I hope they’re worth something to someone.'],
    chat: [
      'I’ve no idea what any of it is. I just put a number on each.',
      'Dad never threw anything away. Forty years of it up there.',
      'If you know what they’re worth, don’t tell me. I’d only feel bad.',
    ],
    thanks: ['Oh, lovely. Dad would have liked that.', 'There we are. One less thing to dust.'],
    react: {
      pickUp: ['Is that one any good? I wouldn’t know.', 'Goodness, that one’s dusty.'],
      haggleWon: ['Oh, all right. You seem nice.'],
      haggleLost: ['That’s what it says on the sticker, dear.'],
      insult: ['Oh! Well, I never.'],
    },
    console: { pitch: 'There was this machine with them. It doesn’t switch on. A few coins?', sold: 'Take the cables too, dear, I don’t want them.' },
    cleared: 'Every last one! The loft’s empty at last. Thank you, dear.',
  },
};
