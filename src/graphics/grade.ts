import * as THREE from 'three';

/**
 * The colour grade and lens of a zone, applied after tone mapping (display space) by `PostFx`,
 * plus the haze in the air (`Haze`). Neutral is `NEUTRAL_LOOK`; a zone's look is data in its
 * `WORLD_PLAN` entry (`look`), and the pipeline eases from one to the next when the player moves.
 */
export interface Look {
  /** Stops of exposure on top of the eye's own adaptation (0 = none). */
  exposure: number;
  /** 1 = neutral; > 1 deepens the shadows and brightens the highlights around mid grey. */
  contrast: number;
  /** 1 = neutral, 0 = greyscale. */
  saturation: number;
  /**
   * -1 cool .. +1 warm, a white-balance shift: done in linear light before tone mapping (a von Kries
   * adaptation towards a white 60 mireds warmer per unit, `whiteBalance.ts`), not on display values.
   */
  temperature: number;
  /**
   * Tint added to the shadows (lift), small numbers. Display values: the grade runs after tone mapping
   * and sRGB, so a hex is read as is (0x0a0604 lifts black to 10/255 red), never converted to linear.
   */
  shadows: THREE.ColorRepresentation;
  /** Multiplier of the highlights (gain), white = neutral. Display values, like `shadows` (0xfff6ea = 1, 0.965, 0.918). */
  highlights: THREE.ColorRepresentation;
  /** 0 = none .. 1 = heavy darkening of the corners. */
  vignette: number;
  /** Film grain amplitude in display values (0.02 is subtle). */
  grain: number;
  /** Strength of the bloom around bright things. */
  bloom: number;
  /** Exponential fog: its colour and density per metre (0 = clear air). */
  haze: { color: THREE.ColorRepresentation; density: number };
  /**
   * What glossy things reflect (`Environment`): the studio room tinted (`tint`, white = as is; a
   * prefiltered copy per tint on medium and high) and scaled (`strength`, 1 = the flat's).
   */
  reflections: { tint: THREE.ColorRepresentation; strength: number };
  /**
   * How far the grade turns to night after dark (0 never, 1 fully: `NIGHT_GRADE`, eased by the sky's
   * daylight): cooler, a little drained, the shadows lifted blue, more bloom round the lamps, the eye
   * opening wider. For a zone that sees the sky (the street, a room with windows); a windowless hall keeps 0.
   */
  night?: number;
  /**
   * Share of Khronos's PBR Neutral tone mapper against ACES (0 ACES, the default .. 1 Neutral):
   * Neutral keeps a printed red red and a blue blue up to the highlights, where ACES pushes saturated
   * colours towards white. For box-art-heavy places (`PostFx`, medium and high; `low` stays ACES).
   */
  neutralTone?: number;
}

/**
 * What a look turns towards at night, scaled by its `night` (added to its own values): cooler,
 * a little less saturated, the shadows lifted a touch of blue, more bloom round the lamps.
 */
export const NIGHT_GRADE = { temperature: -0.12, saturation: 0.85, shadows: 0x02040a, bloom: 0.15 } as const;

/** A grade colour in display values: a hex or CSS string read as is (no sRGB -> linear conversion), a `Color` copied. */
export function displayColor(target: THREE.Color, color: THREE.ColorRepresentation): THREE.Color {
  if (typeof color === 'number') return target.setHex(color, THREE.LinearSRGBColorSpace);
  if (typeof color === 'string') return target.setStyle(color, THREE.LinearSRGBColorSpace);
  return target.copy(color);
}

export type LookName = 'home' | 'arcade' | 'market' | 'street' | 'stairwell' | 'shop' | 'tvShop' | 'florist' | 'petShop' | 'saleroom';

export const NEUTRAL_LOOK: Look = {
  exposure: 0,
  contrast: 1,
  saturation: 1,
  temperature: 0,
  shadows: 0x000000,
  highlights: 0xffffff,
  vignette: 0,
  grain: 0,
  bloom: 0.3,
  haze: { color: 0x000000, density: 0 },
  reflections: { tint: 0xffffff, strength: 1 },
};

/**
 * The flat: a warm, slightly soft collector's den. The arcade: deep blacks, saturated neon, a
 * touch of smoke. The market: a daylit hall of dust, cooler and hazier, gentler contrast. The
 * stairwell: cool common parts, a little drained of colour, a faint dust in the air. The shops:
 * neutral and crisp, the goods shown as they are.
 */
export const LOOKS: Record<LookName, Look> = {
  home: {
    exposure: 0,
    contrast: 1.05,
    saturation: 1.04,
    // Mild: the lamps (`lighting/lampColours`), the gain and the reflections are warm already.
    temperature: 0.07,
    shadows: 0x0a0604,
    highlights: 0xfff6ea,
    vignette: 0.28,
    grain: 0.018,
    bloom: 0.28,
    haze: { color: 0x000000, density: 0 },
    // Lamp-lit wood and paper: a warm, dim room to reflect.
    reflections: { tint: 0xffe4c8, strength: 0.9 },
    // Windows on the street: the nights come in, half as far as outdoors (the lamps are the room's light then).
    night: 0.5,
  },
  arcade: {
    exposure: 0.1,
    contrast: 1.12,
    saturation: 1.18,
    temperature: -0.05,
    shadows: 0x08040f,
    highlights: 0xfff4fb,
    vignette: 0.38,
    grain: 0.026,
    bloom: 0.55,
    haze: { color: 0x1a1426, density: 0.022 },
    // A dark hall lit by screens: the glossy cabinets catch a dim magenta, not a white studio.
    reflections: { tint: 0xa060b8, strength: 0.55 },
  },
  market: {
    exposure: 0,
    contrast: 0.98,
    saturation: 0.95,
    temperature: -0.04,
    shadows: 0x05070a,
    highlights: 0xfffaf0,
    vignette: 0.22,
    grain: 0.022,
    bloom: 0.25,
    haze: { color: 0xb9b4aa, density: 0.01 },
    reflections: { tint: 0xf4f6fa, strength: 1 },
    // Tables of boxes under daylight: the printed colours kept a little truer.
    night: 0.4,
    neutralTone: 0.5,
  },
  // Outdoors: natural, a touch of contrast and bloom for the lamps and neon at night. The haze
  // is only the starting point: the street's lighting drives the fog from the weather (`StreetLighting`).
  street: {
    exposure: 0,
    contrast: 1.04,
    saturation: 1.02,
    temperature: 0,
    shadows: 0x04060a,
    highlights: 0xfffaf2,
    vignette: 0.16,
    grain: 0.016,
    bloom: 0.34,
    haze: { color: 0x9aa4b0, density: 0.0065 },
    // An open sky: cool and a little dimmer (the light level already follows the day).
    reflections: { tint: 0xc4d0e4, strength: 0.85 },
    night: 1,
  },
  // The building's common parts: cold daylight from the stair windows, painted concrete, dust in the air.
  stairwell: {
    exposure: 0,
    contrast: 1.03,
    saturation: 0.9,
    temperature: -0.08,
    shadows: 0x05070a,
    highlights: 0xf6f8fb,
    vignette: 0.26,
    grain: 0.022,
    bloom: 0.26,
    haze: { color: 0x8e9196, density: 0.012 },
    reflections: { tint: 0xdce2ea, strength: 0.8 },
    night: 0.7,
  },
  // A shop floor: even light, true colours, clean edges.
  shop: {
    exposure: 0,
    contrast: 1.06,
    saturation: 1.02,
    temperature: 0,
    shadows: 0x040404,
    highlights: 0xfffcf8,
    vignette: 0.12,
    grain: 0.012,
    bloom: 0.22,
    haze: { color: 0x000000, density: 0 },
    reflections: { tint: 0xffffff, strength: 1 },
    // The goods as printed: Neutral keeps the box art's reds and blues where ACES bleaches them.
    neutralTone: 1,
    night: 0.25,
  },
  // TV REPAIR: a dim, warm workshop, valve-amber and solder smoke, the sets' glow the brightest thing in it.
  tvShop: {
    exposure: -0.05,
    contrast: 1.1,
    saturation: 0.94,
    temperature: 0.22,
    shadows: 0x080503,
    highlights: 0xfff2e0,
    vignette: 0.32,
    grain: 0.024,
    bloom: 0.36,
    haze: { color: 0x3a3028, density: 0.016 },
    reflections: { tint: 0xffe0bc, strength: 0.85 },
    neutralTone: 0.6,
    night: 0.2,
  },
  // The florist: bright, cool and fresh, a faint mist off the buckets.
  florist: {
    exposure: 0.06,
    contrast: 1.02,
    saturation: 1.08,
    temperature: -0.1,
    shadows: 0x030607,
    highlights: 0xf6fffa,
    vignette: 0.1,
    grain: 0.01,
    bloom: 0.3,
    haze: { color: 0xdfe8e4, density: 0.012 },
    reflections: { tint: 0xe8f6f0, strength: 1 },
    neutralTone: 0.8,
    night: 0.25,
  },
  // PAWS & CLAWS: warm and soft, sawdust and lamp light.
  petShop: {
    exposure: 0.02,
    contrast: 1.04,
    saturation: 1.04,
    temperature: 0.14,
    shadows: 0x060403,
    highlights: 0xfff6e8,
    vignette: 0.16,
    grain: 0.014,
    bloom: 0.24,
    haze: { color: 0xc8b89a, density: 0.006 },
    reflections: { tint: 0xfff0dc, strength: 0.95 },
    neutralTone: 0.8,
    night: 0.25,
  },
  // The saleroom: a windowless green room, warm lamp light, deep blacks, the far end in shadow round the lot.
  saleroom: {
    exposure: -0.04,
    contrast: 1.1,
    saturation: 0.96,
    temperature: 0.16,
    shadows: 0x040302,
    highlights: 0xfff1dc,
    vignette: 0.3,
    grain: 0.02,
    bloom: 0.26,
    haze: { color: 0x2e2a22, density: 0.008 },
    reflections: { tint: 0xffe8c8, strength: 0.9 },
    neutralTone: 0.6,
    night: 0,
  },
};
