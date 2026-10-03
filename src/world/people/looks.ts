import { seededRandom } from '@/covers/generated/canvasUtils';

/*
 * What a person looks like and wears. Colours are hex numbers; everything else picks a variant
 * the `PersonModel` knows how to build. `randomLook(seed, role)` draws a whole look from the
 * palettes below so a stallholder is the same every day and no two shoppers match.
 */

export type HairStyle = 'short' | 'buzz' | 'long' | 'bun' | 'ponytail' | 'curly' | 'bald';
export type TopKind = 'tee' | 'stripes' | 'flannel' | 'hoodie' | 'jacket' | 'shirt';
export type ShoeKind = 'sneaker' | 'boot' | 'loafer';
/** The body's lines: straight, or a narrower waist with fuller hips and bust. */
export type Figure = 'straight' | 'curvy';

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
  /** Width of the jaw, 0.85 (narrow, pointed chin) to 1.15 (square). */
  jaw: number;
  /** Size of the nose, 0.8 to 1.25. */
  nose: number;
  /** A dusting of freckles over the nose and cheeks. */
  freckles: boolean;

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

  /** A scarf round the neck (in the cold), in this colour. */
  scarf?: number;
  /** A child or someone old; an adult when absent (`Dress.age`). */
  age?: Age;
  /** The head's size against the body's (a child's head is big for its body). Default 1. */
  headScale?: number;

  /** Standing height in metres. Default 1.72. */
  height: number;
  /** Width of the body, 0.85 (slight) to 1.2 (broad). */
  build: number;
  figure: Figure;
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
const HAIR_STYLES: Record<Figure, HairStyle[]> = {
  straight: ['short', 'short', 'short', 'short', 'buzz', 'buzz', 'curly', 'bald', 'long', 'ponytail'],
  curvy: ['long', 'long', 'long', 'bun', 'bun', 'ponytail', 'ponytail', 'curly', 'short', 'buzz'],
};
const TOP_KINDS: TopKind[] = ['tee', 'tee', 'stripes', 'flannel', 'hoodie', 'jacket', 'shirt'];

export type Age = 'child' | 'adult' | 'elder';

/** What a look is drawn for, beyond the person: the season they dress for, and how old they are. */
export interface Dress {
  season?: 'spring' | 'summer' | 'autumn' | 'winter';
  age?: Age;
}

const SCARVES = [0x8f2a2a, 0x2a3f6a, 0xd8b23a, 0x3a5a3a, 0xe8e2d6, 0x5a2a5e, 0x2a2a2a];

/**
 * A look drawn from the palettes, fixed by `seed`. Stallholders get an apron half the time and
 * never a bag; shoppers carry one half the time. With a `dress`, the same person dressed for the
 * season (coats and scarves in winter, shorts and tees in summer) and made a child or someone old;
 * without one, the look is what it always was for that seed.
 */
export function randomLook(seed: number, role: 'vendor' | 'shopper' = 'shopper', dress?: Dress): PersonLook {
  const look = baseLook(seed, role);
  return dress ? dressed(look, seed, dress) : look;
}

/** `look` dressed for `dress`: drawn from its own stream, so the base look stays the seed's. */
function dressed(look: PersonLook, seed: number, { season, age }: Dress): PersonLook {
  const random = seededRandom(seed * 3266489917 + 7);
  const chance = (p: number): boolean => random() < p;
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!;
  const out = { ...look };
  if (season === 'winter') {
    // A coat or a hoodie, long sleeves, trousers; a scarf, a beanie, boots more often.
    if (out.top !== 'jacket' && out.top !== 'hoodie') out.top = chance(0.7) ? 'jacket' : chance(0.5) ? 'hoodie' : 'flannel';
    out.longSleeves = true;
    out.shorts = false;
    if (chance(0.65)) out.scarf = pick(SCARVES);
    if (!out.hat && chance(0.4)) {
      out.hat = 'beanie';
      out.hatColor = pick(SCARVES);
    }
    if (out.shoes === 'sneaker' && chance(0.5)) out.shoes = 'boot';
  } else if (season === 'autumn' || season === 'spring') {
    if (out.top === 'tee' && chance(0.45)) out.top = chance(0.5) ? 'jacket' : 'flannel';
    if (out.top === 'jacket' || out.top === 'flannel') out.longSleeves = true;
    if (out.shorts && chance(0.7)) out.shorts = false;
    if (season === 'autumn' && chance(0.15)) out.scarf = pick(SCARVES);
  } else if (season === 'summer') {
    // Tees and shorts; no woolly hats.
    if ((out.top === 'jacket' || out.top === 'hoodie' || out.top === 'flannel') && chance(0.7)) out.top = chance(0.6) ? 'tee' : 'shirt';
    if (out.top === 'tee') out.longSleeves = false;
    else if (out.top === 'shirt') out.longSleeves = chance(0.3);
    out.shorts = out.top !== 'jacket' && out.top !== 'hoodie' && chance(0.4);
    if (out.hat === 'beanie') out.hat = chance(0.5) ? 'cap' : undefined;
  }
  if (age === 'child') {
    out.age = 'child';
    out.height = 1.05 + random() * 0.4;
    out.headScale = 1.22 - (out.height - 1.05) * 0.3;
    out.build = 0.86 + random() * 0.12;
    out.beard = undefined;
    out.glasses = chance(0.12) ? 0x2a3f6a : undefined;
    out.bag = chance(0.6) ? 'backpack' : undefined;
    out.bagColor = pick(SCARVES);
    out.hat = out.hat === 'cap' || chance(0.2) ? out.hat : undefined;
    out.shoes = 'sneaker';
    out.apron = undefined;
    out.freckles = out.freckles || chance(0.2);
    out.jaw = 0.85 + random() * 0.08;
    out.smile = chance(0.7);
  } else if (age === 'elder') {
    out.age = 'elder';
    // Grey or white, thinner; glasses and a hat more often; never a hoodie or a backpack.
    out.hair = chance(0.6) ? 0xd9d3c8 : 0x8e8a86;
    if (out.hairStyle === 'ponytail' || out.hairStyle === 'long') out.hairStyle = chance(0.5) ? 'bun' : 'short';
    if (out.hairStyle === 'buzz' && chance(0.5)) out.hairStyle = 'bald';
    out.glasses = out.glasses ?? (chance(0.6) ? 0x6b4a2a : undefined);
    if (out.top === 'hoodie' || out.top === 'tee') out.top = chance(0.6) ? 'jacket' : 'shirt';
    out.longSleeves = true;
    out.shorts = false;
    out.shoes = 'loafer';
    if (out.bag === 'backpack') out.bag = 'tote';
    if (!out.hat && chance(0.3)) out.hat = 'cap';
    out.height = Math.max(1.5, out.height - 0.04 - random() * 0.05);
  }
  return out;
}

function baseLook(seed: number, role: 'vendor' | 'shopper'): PersonLook {
  const random = seededRandom(seed * 2246822519);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!;
  const chance = (p: number): boolean => random() < p;

  const figure: Figure = chance(0.45) ? 'curvy' : 'straight';
  const skin = pick(SKINS);
  const hair = pick(HAIRS);
  const hairStyle = pick(HAIR_STYLES[figure]);
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
    beard: figure === 'straight' && hairStyle !== 'long' && chance(0.4) ? (chance(0.5) ? 'stubble' : 'full') : undefined,
    glasses: chance(0.25) ? (chance(0.6) ? 0x1e1c1a : 0x6b4a2a) : undefined,
    smile: chance(0.55),
    jaw: figure === 'curvy' ? 0.85 + random() * 0.15 : 0.95 + random() * 0.2,
    nose: 0.8 + random() * 0.45,
    freckles: skin >= 0xd9a279 && chance(0.25),

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

    height: figure === 'curvy' ? 1.56 + random() * 0.2 : 1.66 + random() * 0.24,
    build: figure === 'curvy' ? 0.85 + random() * 0.25 : 0.92 + random() * 0.28,
    figure,
  };
}
