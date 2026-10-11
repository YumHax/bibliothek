import { EPILOGUE_TALK } from '@/grandma/epilogueLines';
import { memeLook } from '../../grandma/familyLooks';
import type { FriendPlan } from '../friendsPlan';

/*
 * MÉMÉ AT THE PLAYER'S (docs/grandma.md "The end of the story"): her body and pace as a visitor of the flat (the
 * friends' round, `gathering/MemeVisit`), and the numbers of her visit.
 */

/** Mémé as the visitors' director plays her: her own look, slow on the stairs, a light voice. */
export const MEME_VISITOR: FriendPlan = {
  id: 'meme',
  name: 'Mémé',
  seed: 1931,
  look: memeLook(),
  taste: { platforms: [], genres: [], years: [1985, 1995] },
  speed: 0.55,
  borrowChance: 0,
  voice: { pitch: 0.66 },
  lines: { greet: EPILOGUE_TALK.visit.enter, smalltalk: EPILOGUE_TALK.visit.chat, loved: EPILOGUE_TALK.visit.his },
};

export const MEME_VISIT = {
  /** Seated, seconds before she asks for her photo. */
  askAfter: 5,
  /** Seated, she stays until the photo is taken, this long at most (s); a visit after it, the usual linger. */
  waitPhoto: 150,
  /** The print for her album: its size (4:3) and JPEG quality. */
  print: { width: 480, height: 360, quality: 0.78 },
} as const;
