/*
 * MÉMÉ'S FAVOURS (docs/grandma.md "Sunday lunch, recipes and favours"): now and then, a small thing she can't do herself,
 * asked in her words, one at a time, done with what the game already has: a thump on her set, the clock wound with
 * her key, a croissant from Front Street's bakery, Félix's old console mended at the kitchen table.
 */

export type FavourId = 'set' | 'clock' | 'croissant' | 'console';

interface Favour {
  id: FavourId;
  /** Asked once she has the player's ear, after her hello. */
  ask: string;
  /** Said on the way in while it is still open. */
  reminder: string;
  /** Her thanks once it is done. */
  thanks: string;
  /** Done only once (the console); the others may come round again. */
  once?: boolean;
}

/** In the order she asks them the first time; after that, the ones that may come back, in turn. */
export const FAVOURS: readonly Favour[] = [
  {
    id: 'set',
    ask: 'My set’s picture keeps rolling, love. Félix used to give it a good thump on the side. I daren’t.',
    reminder: 'The picture’s still rolling. I watched the quiz upside down yesterday.',
    thanks: 'There! You have his touch. Thirty years that set’s been waiting for someone to hit it properly.',
  },
  {
    id: 'clock',
    ask: 'The clock’s stopped, did you notice? I can’t reach the key any more. Here, it’s this one. Wind it for me?',
    reminder: 'The clock’s still stopped. The key’s on top of it, I put it back.',
    thanks: 'Listen to that. The flat was too quiet without it. I kept waking up thinking something had happened.',
  },
  {
    id: 'croissant',
    ask: 'You know what I fancy? A croissant from that bakery on your street. Félix used to bring me one on Sundays.',
    reminder: 'No croissant? I’m only teasing. A bit.',
    thanks: 'Still warm, nearly! Oh, that’s the one. He always brought two and ate them both on the bus.',
  },
  {
    id: 'console',
    ask: 'There’s a machine of Félix’s in the cupboard, he played it here on Sundays. It doesn’t come on any more. You’re good with those things?',
    reminder: 'How’s Félix’s machine? No hurry. It’s waited this long.',
    thanks: 'You mended it? Keep it, love. Sell it, play it, whatever you like. It was always going to be yours.',
    once: true,
  },
];

export function favourOf(id: FavourId): Favour {
  return FAVOURS.find((favour) => favour.id === id) ?? FAVOURS[0]!;
}

export function isFavourId(value: unknown): value is FavourId {
  return FAVOURS.some((favour) => favour.id === value);
}

/** The console Félix kept at hers, mended at the kitchen table (`repair/Workshop`). */
export const FELIX_CONSOLE = { platform: 'megadrive', from: 'Mémé’s cupboard' } as const;
