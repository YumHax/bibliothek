/*
 * GASPARD'S WORDS (docs/grandma.md "The end of the story"): Félix's elder brother at Mémé's Sunday table once the row
 * has been seen in her album; what he says when the sale comes up before the player knows, and the reckoning once
 * they do (the album's "Lot 1 to 412"): the player's three ways in, Mémé's part, how it ends.
 */

export const GASPARD_TALK = {
  /** At her table, the player coming in: his first word of the day (a bag). */
  opening: [
    'Ah. The heir. Maman said you might drop by.',
    'Sit down, you’re making the room look untidy.',
    'Still taking the bus? I could find you a little runabout. Mates’ rates.',
    'Maman, there’s too much nutmeg in this. As always. Hello, you.',
  ],
  /** Clicked without the social layer, or as his chat. */
  chat: [
    'Business is fine. Business is always fine, if you ask the bank.',
    'You should get a proper job. Games! At your age.',
    'Félix was the dreamer. Somebody in this family had to do the sums.',
    'I’ve got a client at four. Saturday’s for clients, Sunday’s for Maman.',
  ],
  /** "About the sale…", before the player has seen it in the album: he dodges. */
  dodge: [
    'Ancient history. Pass the bread.',
    'It was all legal. Maman signed, the auctioneer was happy, end of story.',
    'Do we have to? It’s Sunday.',
    'What sale? Oh, that. Boxes of plastic. Nobody wanted them.',
  ],
  /** Getting up to go, his watch checked. */
  leaving: ['Right. Traffic on the ring road. Maman.', 'I’ll beat the traffic. Kiss, Maman.', 'Look at the time. I’m off. Don’t get up.'],
  /** Her word after him, when he has gone of his own accord. */
  afterHim: ['He was a sweet boy, you know. Until he learned to count.', 'Every Sunday he leaves before the cheese.', 'He means well. He means well for Gaspard.'],

  /** The reckoning (the sale seen): the player's opening line, and his. */
  confront: {
    ask: 'We need to talk about the sale.',
    his: 'What about it? It was all above board. Papers, signatures, the lot.',
  },
  /** "Mémé was in the back row": she stands, and he gives way. */
  sawYou: {
    ask: 'Mémé was in the back row. She saw everything.',
    his: 'She… Maman, you said you were at the doctor’s.',
    meme: ['Gaspard. Sit down.', 'I signed where you pointed. And that man was in the front row before the first lot. You had him there.', 'Forty years I kept quiet for you. Not today.'],
    sorry: ['The garage was going under, Maman. I was going to pay it all back.', 'I’m sorry. About the flat. About all of it. He’d have given you the shirt off his back, and I sold his shirts.'],
    memeLast: 'Then say it to the one he left it to. Not to me.',
    bye: 'I’ll go. Maman… next Sunday?',
    memeBye: 'We’ll see, Gaspard. We’ll see.',
  },
  /** The sale's catalogue shown (once Mémé gave it, `grandma/Keepsakes` 'catalogue'): her pencil marks; then as "she saw". */
  catalogue: {
    label: 'Show him the sale’s catalogue',
    his: 'That’s Maman’s copy. Her pencil… she ticked every lot he bought. Every one.',
  },
  /** His own letter to Félix shown (once Mémé gave it, `grandma/Keepsakes` 'gaspardLetter'): then as "she saw". */
  letter: {
    label: 'Show him the letter he wrote Félix',
    his: 'That’s… my writing. “The kid will grow out of it.” God. I wrote that, and here you are.',
  },
  /** "You sold Félix's things to Crane": he hardens, and she shows him the door. */
  crane: {
    ask: 'You sold Félix’s things to Crane.',
    his: 'I sold a dead man’s toys to the only buyer in town. That’s what a sale is.',
    meme: ['Then go and do your business somewhere else, Gaspard.', 'And you can tell your Mr Crane that Odette remembers.'],
    bye: 'Fine. Fine! Don’t ring me when the boiler goes.',
  },
  /** Saying nothing: he fills the silence himself, and goes. */
  silence: {
    label: 'Say nothing',
    his: ['…', 'Well. Traffic.'],
    meme: ['You didn’t have to say a word. I saw your face. So did he.', 'He won’t be back for a while. It’s quieter. I don’t mind quiet.'],
  },
  /**
   * His one Sunday back, a week or more after the apology (`FamilyStory.returning`): sorry to the player this time, and
   * the one thing of Félix's he kept back from the sale, handed over (`family/gaspardReturn` puts it in the parcel).
   */
  back: {
    opening: 'You. Good, I hoped you’d come. I owe you a word, and Maman says I owe it standing up.',
    sorry: [
      'I sold your uncle’s things to pay my debts. That’s the long and the short of it. I’m sorry.',
      'I kept one back. I couldn’t put it in the sale, I don’t know why. It was on my desk all this time. It’s yours.',
    ],
    meme: 'There. That wasn’t so hard, was it? Sit, Gaspard. You’ll stay for lunch for once.',
    chat: [
      'The garage is sold. I sell Peugeots for someone else now. Humbling, Maman says. Good for me, she means.',
      'Maman has me peeling the carrots now. Penance, she calls it.',
      'Félix would have laughed at me. Then lent me the money. That was always the trouble with him.',
      'You’ve got his look, you know. When you’re cross. Don’t be cross.',
    ],
    afterHim: ['He’ll come next month. I’ll have him peel the potatoes too.', 'He stayed for the tart. First time in twenty years.'],
    /** What he kept, its past (inside the box) and where it came from on its receipt. */
    past: 'A slip of paper in the box, in Gaspard’s hand: “Lot withdrawn. Not for sale. G.”',
    where: 'kept back from the sale by Gaspard',
    note: 'Gaspard came back to Mémé’s and said sorry to you too',
  },
  /** At her Sunday table with him there (`LunchAtHers`): her words over the blanquette, his plate laid at the door end. */
  lunch: [
    'Gaspard, the bread. No, to your left. Your other left.',
    'You two used to fight over the end of the loaf. Félix always let you have it. Remember that, Gaspard.',
    'Eat, Gaspard, you look grey. Selling cars is no life.',
    'Gaspard always counted the mushrooms in his plate. Didn’t you, love? Don’t pretend.',
  ],

  /** The day's journal, by how it ended. */
  journal: {
    apologised: 'Gaspard said sorry, at Mémé’s table',
    gone: 'Mémé showed Gaspard the door',
    silent: 'Gaspard left Mémé’s without a word',
  },
  /** His standing remembers it (`social/standing.addMemory`). */
  memory: {
    apologised: 'you made me say sorry to Maman',
    gone: 'you turned Maman against me',
    silent: 'you sat there and said nothing',
  },
} as const;
