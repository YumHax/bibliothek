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
    'Maman, your blanquette has too much nutmeg. As always. Hello, you.',
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
