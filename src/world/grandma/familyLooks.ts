import { randomLook, type PersonLook } from '../people/looks';

/*
 * The family as they look (docs/story.md "Mémé"): Mémé today and thirty years younger, Félix in his thirties, the
 * player as a child. Each is a drawn look with what makes them them pinned on top, so they are the same people in
 * every memory.
 */

/** Mémé today: grey hair in a bun, her glasses, a cardigan over a blouse, a skirt and thick tights. */
export function memeLook(): PersonLook {
  return {
    ...randomLook(1931, 'shopper', { age: 'elder', season: 'autumn' }),
    hairStyle: 'bun',
    hair: 0xd9d3c8,
    glasses: 0x6a4a3a,
    smile: true,
    top: 'jacket',
    topColor: 0x8a5a6a,
    topAccent: 0xf2efe8,
    longSleeves: true,
    skirt: 'skirt',
    skirtColor: 0x3a3a52,
    tights: 0x3a2e2a,
    coat: false,
    scarf: undefined,
    hat: undefined,
    bag: undefined,
    figure: 'curvy',
    shoes: 'loafer',
    shoeColor: 0x2a2622,
  };
}

/** Mémé in the nineties: the same woman, the hair still mostly brown. */
export function memeThenLook(): PersonLook {
  return { ...memeLook(), age: 'adult', hair: 0x8a7a66, topColor: 0x6b2f3a };
}

/** Félix at thirty-five: dark hair, stubble, his glasses, a flannel shirt. */
export function felixLook(): PersonLook {
  return {
    ...randomLook(1960, 'shopper', { season: 'autumn' }),
    hairStyle: 'short',
    hair: 0x2a1d14,
    beard: 'stubble',
    glasses: 0x1e1e1e,
    smile: true,
    top: 'flannel',
    topColor: 0x8f3b3b,
    topAccent: 0x2a2a2a,
    longSleeves: true,
    trousers: 0x2b3a5a,
    shorts: false,
    skirt: undefined,
    coat: false,
    scarf: undefined,
    hat: undefined,
    bag: undefined,
    figure: 'straight',
    shoes: 'boot',
  };
}

/** The player at six: a striped jumper, short hair, indoors at Christmas. */
export function childLook(): PersonLook {
  return {
    ...randomLook(1989, 'shopper', { age: 'child', season: 'autumn' }),
    // Six: a small one (the draw ranges up to a twelve-year-old's), the head big for it as a child's is.
    height: 1.16,
    headScale: 1.19,
    hairStyle: 'short',
    hair: 0x4a3222,
    smile: true,
    top: 'stripes',
    topColor: 0x2f6b8f,
    topAccent: 0xf2efe8,
    longSleeves: true,
    shorts: false,
    skirt: undefined,
    coat: false,
    scarf: undefined,
    hat: undefined,
    bag: undefined,
  };
}

/** The player at fourteen: the child grown lanky, a hoodie, trainers (the arcade, `arcadeMemory`). */
export function playerTeenLook(): PersonLook {
  return {
    ...childLook(),
    height: 1.6,
    headScale: 1.06,
    build: 0.88,
    top: 'hoodie',
    topColor: 0x3a4a5e,
    topAccent: 0xd8a33a,
    trousers: 0x2b3a5a,
    shoes: 'sneaker',
    shoeColor: 0xe8e6e0,
  };
}

/** Gaspard Aubry, Félix's elder brother, at sixty-odd: tall, the grey hair combed back, a dark suit, no glasses, no smile. */
export function gaspardLook(): PersonLook {
  return {
    ...randomLook(1958, 'shopper', { season: 'autumn' }),
    height: 1.84,
    build: 1.05,
    figure: 'straight',
    hairStyle: 'short',
    hair: 0x8e8a86,
    beard: undefined,
    glasses: undefined,
    smile: false,
    jaw: 1.1,
    top: 'jacket',
    topColor: 0x2a2c33,
    topAccent: 0xeef0f2,
    longSleeves: true,
    trousers: 0x2a2c33,
    shorts: false,
    skirt: undefined,
    coat: false,
    scarf: undefined,
    hat: undefined,
    bag: undefined,
    shoes: 'loafer',
    shoeColor: 0x1a1a1a,
  };
}

/** The player at nine: taller, the head less big for the body, a tee for a Wednesday indoors (`wednesdaysMemory`). */
export function childNineLook(): PersonLook {
  return {
    ...childLook(),
    height: 1.33,
    headScale: 1.13,
    top: 'tee',
    topColor: 0xd8a33a,
    topAccent: 0x2f6b8f,
    longSleeves: false,
  };
}

/** The player at eighteen, off to study: grown up, a jacket and a backpack for the train (`leavingMemory`). */
export function playerYoungLook(): PersonLook {
  return {
    ...childLook(),
    age: 'adult',
    height: 1.74,
    headScale: 1,
    build: 0.92,
    top: 'jacket',
    topColor: 0x3a4a3a,
    topAccent: 0xe0d6c2,
    longSleeves: true,
    trousers: 0x24304a,
    shoes: 'sneaker',
    shoeColor: 0xe8e6e0,
    bag: 'backpack',
    bagColor: 0x8f2a2a,
  };
}

/** Félix at forty-seven: the same man, the hair gone grey at the sides, a fuller stubble, a cardigan over his shirt. */
export function felixLaterLook(): PersonLook {
  return {
    ...felixLook(),
    hair: 0x6e6a66,
    beard: 'full',
    build: 1.08,
    top: 'jacket',
    topColor: 0x5a4a3a,
    topAccent: 0x8f3b3b,
  };
}
