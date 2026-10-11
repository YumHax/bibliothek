/*
 * MÉMÉ'S STORIES (docs/grandma.md "Her presence"): what she tells when the player sits with her a while, a few lines
 * each. Some only once the memory named has been seen (what she can bring herself to talk about, like her chat).
 */

/** One of her stories: its lines in turn; `after`, the memory (`MEMORIES` id) it waits for. */
export interface GrandmaStory {
  id: string;
  lines: readonly string[];
  after?: string;
}

export const GRANDMA_STORIES: readonly GrandmaStory[] = [
  {
    id: 'tortoise',
    lines: [
      'When Félix was seven he wanted a dog. We got him a tortoise.',
      'He called it Speedy. He timed it, with his father’s watch, across the kitchen.',
      'Eleven minutes. He wrote it down in a little book. Every week, a new record.',
      'He kept lists of everything, even then. You know that, you’ve seen his notebook.',
    ],
  },
  {
    id: 'georges',
    lines: [
      'Your grandfather, Georges, mended clocks. That one in the corner was his.',
      'He’d take it apart on the kitchen table on a Sunday and put it back by supper.',
      'Always one little screw left over. He’d hold it up and say: “Spare.”',
      'It still runs. I wind it on Thursdays. It loses four minutes a week, like he did.',
    ],
  },
  {
    id: 'rationing',
    lines: [
      'When I was a girl there was nothing in the shops. One orange at Christmas.',
      'My mother cut it in four, so we each had a piece, and she ate the peel.',
      'I didn’t understand till I had my own. You give them the orange.',
    ],
  },
  {
    id: 'sixties',
    lines: [
      'We moved in here in sixty-four. The avenue had trams then, and a dairy on the corner.',
      'Georges carried me over the doorstep and put his back out. Two weeks in bed.',
      'The wallpaper was orange. Big flowers. I thought it was the height of fashion.',
      'It’s under this one, still. Some days I think I can see it through.',
    ],
  },
  {
    id: 'television',
    lines: [
      'We were the first on the landing with a television. Seventy-one.',
      'The whole floor came to watch on a Saturday night. I made forty crêpes.',
      'Félix sat right up against the screen. I said he’d go blind.',
      'He didn’t. He went into games instead. I’m not sure which is worse.',
    ],
  },
  {
    id: 'parent',
    lines: [
      'Your mother was the clever one. Top of the class, every year.',
      'Félix was the dreamer, Gaspard the counter. And she just got on with it.',
      'She rings on Thursdays. She asks about you first, you know. Before the weather.',
    ],
  },
  {
    id: 'seaside',
    lines: [
      'That photo by the window, the seaside: Le Crotoy, fifty-nine.',
      'Georges hired a tandem. We went into a ditch in the first hundred metres.',
      'I sat in the ditch and laughed till I cried. He thought I was hurt.',
      'Best holiday of my life. A ditch.',
    ],
  },
  {
    id: 'knitting',
    lines: [
      'My mother taught me to knit with two pencils and a bit of string.',
      'I knitted Georges a jumper the year we met. One arm was longer than the other.',
      'He wore it for thirty years. Rolled the sleeve up. Never said a word.',
    ],
  },
  {
    id: 'firstGame',
    after: 'christmas95',
    lines: [
      'Félix bought his first game with his first wages. From the post office, sorting letters.',
      'He came home with the box under his coat, like it was stolen.',
      'He didn’t even have the machine yet. He just looked at the box for a month.',
      'That’s when I knew. Some people collect stamps. He collected waiting.',
    ],
  },
  {
    id: 'wednesdaysTea',
    after: 'wednesdays',
    lines: [
      'On your Wednesdays he’d ring me after you’d gone. Every time.',
      '“The kid beat the second castle.” As if I knew what a castle was.',
      'I’d say “Well done” and he’d say “Not me, the kid”, and hang up.',
    ],
  },
  {
    id: 'brothers',
    after: 'row',
    lines: [
      'They were close, once, the boys. Gaspard taught Félix to ride a bike.',
      'Then Gaspard went into insurance and started measuring everything in money.',
      'He used to say Félix would die poor. Félix said he’d die surrounded by friends.',
      'They were both a bit right. That’s the sad part.',
    ],
  },
  {
    id: 'lastCall',
    after: 'sale',
    lines: [
      'The last time Félix rang me he talked about you for an hour.',
      'The flat, the shelves, how he’d leave it all to you, sorted.',
      'Then Gaspard came round with his papers and his nice pen.',
      'I should have rung Félix back. I thought there was time. There’s never time.',
    ],
  },
  {
    id: 'peace',
    after: 'keys',
    lines: [
      'I went past the old flat on the bus last week. Your light was on.',
      'I didn’t get off. I just sat there with my bag on my knees, smiling like a fool.',
      'The driver asked if I was all right. I said: “My grandchild lives there.”',
    ],
  },
];

/** Her words around a story: sitting down to it, told before, and the time gone after. */
export const STORY_TALK = {
  /** The player sits down by her: before the story. */
  settle: ['Sit, sit. Put your feet up, nobody’s looking.', 'Come here. Have I told you about…', 'Comfortable? Good. Listen to this.'],
  /** All told already: one again, said so. */
  again: ['You’ve heard this one. You’ll hear it again, I’m old.', 'Did I tell you this? Never mind, it’s a good one.'],
  /** The time gone by, after. */
  after: ['Look at the time. Where did that go?', 'Listen to me, going on. You should have stopped me.', 'The clock’s been busy while we weren’t looking.'],
} as const;
