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
}

/** A grade colour in display values: a hex or CSS string read as is (no sRGB -> linear conversion), a `Color` copied. */
export function displayColor(target: THREE.Color, color: THREE.ColorRepresentation): THREE.Color {
  if (typeof color === 'number') return target.setHex(color, THREE.LinearSRGBColorSpace);
  if (typeof color === 'string') return target.setStyle(color, THREE.LinearSRGBColorSpace);
  return target.copy(color);
}

export type LookName = 'home' | 'arcade' | 'market' | 'street' | 'stairwell' | 'shop';

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
  },
};
