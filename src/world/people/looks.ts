import { seededRandom } from '@/covers/generated/canvasUtils';

/*
 * What a person looks like and wears. Colours are hex numbers; everything else picks a variant
 * the `PersonModel` knows how to build. `randomLook(seed, role)` draws a whole look from the
 * palettes below so a stallholder is the same every day and no two shoppers match.
 */

export type HairStyle = 'short' | 'buzz' | 'long' | 'bun' | 'ponytail' | 'curly' | 'bald';
export type TopKind = 'tee' | 'stripes' | 'flannel' | 'hoodie' | 'jacket' | 'shirt';
export type ShoeKind = 'sneaker' | 'boot' | 'loafer';

export interface PersonLook {
  skin: number;
  hair: number;
  hairStyle: HairStyle;
  /** A peaked cap, a beanie, or nothing on the head. */
  hat?: 'cap' | 'beanie';
  hatColor?: number;
  eyes: number;
  /** Eyebrow thickness, 0.5 (fine) to 1.5 (heavy). */
  brows: number;
  beard?: 'stubble' | 'full';
  glasses?: number;
  /** A smile or a straight mouth. */
  smile: boolean;

  top: TopKind;
  topColor: number;
  /** Second colour of the top: the print on a tee, the stripes, the check, the shirt under a jacket. */
  topAccent: number;
  /** Sleeves stop at the elbow (tee) or reach the wrist. */
  longSleeves: boolean;
  /** The stallholder's apron over the top, in this colour. */
  apron?: number;
  trousers: number;
  shorts: boolean;
  shoes: ShoeKind;
  shoeColor: number;
  bag?: 'tote' | 'backpack';
  bagColor?: number;

  /** Standing height in metres. Default 1.72. */
  height: number;
  /** Width of the body, 0.85 (slight) to 1.2 (broad). */
  build: number;
}

const SKINS = [0xf3d6c1, 0xe8b894, 0xd9a279, 0xc68e6a, 0x9c6a4a, 0x7a4f36, 0x6b4630, 0x4a2f22];
const HAIRS = [0x2a1d14, 0x4a3222, 0x8a5a2a, 0xc9a25a, 0xd9d3c8, 0x1a1a1a, 0x9a2f1f, 0x6e6a66];
const EYES = [0x3a2a1c, 0x2f4a6b, 0x4a6b3a, 0x5a4634, 0x1e1e1e];
const TOPS = [0x3b5b8f, 0x8f3b3b, 0x4f7a4a, 0xe0d6c2, 0x2f2f33, 0xd8a33a, 0x6b4a8f, 0xb85c3a, 0x7a9ab0, 0x4a4a4a, 0x1f3a2a, 0x8a6a3a];
const ACCENTS = [0xf2efe8, 0x1e1e22, 0xd8a33a, 0xc8443a, 0x2f6b8f, 0x8fbf9a, 0xe6a83a];
const TROUSERS = [0x2b3a5a, 0x3a3a3a, 0x6b5a44, 0x1e2a3a, 0x5a6a5a, 0x8a7a66, 0x24304a, 0x4a3a30];
const SHOE_COLORS = [0x2a2622, 0x4a3a2a, 0xe8e6e0, 0x1a1a1a, 0x8f3b3b, 0x3b5b8f];
const HATS = [0x8f3b3b, 0x2f2f33, 0x3b5b8f, 0xd8a33a, 0x4f7a4a, 0x1a1a1a];
const APRONS = [0x3a3a3a, 0x5a3a2a, 0x2a4a3a, 0x6b2f2a, 0x2a3a5a];
const BAGS = [0xd8cdb4, 0x2f2f33, 0x6b4a2a, 0x8f3b3b, 0x3b5b8f];
const HAIR_STYLES: HairStyle[] = ['short', 'short', 'short', 'buzz', 'long', 'bun', 'ponytail', 'curly', 'bald'];
const TOP_KINDS: TopKind[] = ['tee', 'tee', 'stripes', 'flannel', 'hoodie', 'jacket', 'shirt'];

/**
 * A look drawn from the palettes, fixed by `seed`. Stallholders get an apron half the time and
 * never a bag; shoppers carry one half the time.
 */
export function randomLook(seed: number, role: 'vendor' | 'shopper' = 'shopper'): PersonLook {
  const random = seededRandom(seed * 2246822519);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!;
  const chance = (p: number): boolean => random() < p;

  const skin = pick(SKINS);
  const hair = pick(HAIRS);
  const hairStyle = pick(HAIR_STYLES);
  const hatRoll = random();
  const top = pick(TOP_KINDS);
  const topColor = pick(TOPS);
  let topAccent = pick(ACCENTS);
  if (topAccent === topColor) topAccent = ACCENTS[0]!;
  const shorts = top !== 'jacket' && top !== 'hoodie' && chance(0.15);
  const shoes: ShoeKind = chance(0.6) ? 'sneaker' : chance(0.5) ? 'boot' : 'loafer';
  const bagRoll = random();

  return {
    skin,
    hair,
    hairStyle,
    hat: hatRoll < 0.22 ? 'cap' : hatRoll < 0.34 ? 'beanie' : undefined,
    hatColor: pick(HATS),
    eyes: pick(EYES),
    brows: 0.6 + random() * 0.9,
    beard: chance(0.28) ? (chance(0.5) ? 'stubble' : 'full') : undefined,
    glasses: chance(0.25) ? (chance(0.6) ? 0x1e1c1a : 0x6b4a2a) : undefined,
    smile: chance(0.55),

    top,
    topColor,
    topAccent,
    longSleeves: top === 'jacket' || top === 'hoodie' || top === 'flannel' || (top === 'shirt' && chance(0.6)) || chance(0.2),
    apron: role === 'vendor' && chance(0.5) ? pick(APRONS) : undefined,
    trousers: pick(TROUSERS),
    shorts,
    shoes,
    shoeColor: shoes === 'boot' ? pick([0x2a2622, 0x4a3a2a, 0x1a1a1a]) : pick(SHOE_COLORS),
    bag: role === 'shopper' && bagRoll < 0.5 ? (bagRoll < 0.3 ? 'tote' : 'backpack') : undefined,
    bagColor: pick(BAGS),

    height: 1.56 + random() * 0.32,
    build: 0.85 + random() * 0.35,
  };
}
