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
  /** -1 cool .. +1 warm, a white-balance shift. */
  temperature: number;
  /** Tint added to the shadows (lift), linear RGB, small numbers. */
  shadows: THREE.ColorRepresentation;
  /** Multiplier of the highlights (gain), white = neutral. */
  highlights: THREE.ColorRepresentation;
  /** 0 = none .. 1 = heavy darkening of the corners. */
  vignette: number;
  /** Film grain amplitude in display values (0.02 is subtle). */
  grain: number;
  /** Strength of the bloom around bright things. */
  bloom: number;
  /** Exponential fog: its colour and density per metre (0 = clear air). */
  haze: { color: THREE.ColorRepresentation; density: number };
}

export type LookName = 'home' | 'arcade' | 'market';

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
};

/**
 * The flat: a warm, slightly soft collector's den. The arcade: deep blacks, saturated neon, a
 * touch of smoke. The market: a daylit hall of dust, cooler and hazier, gentler contrast.
 */
export const LOOKS: Record<LookName, Look> = {
  home: {
    exposure: 0,
    contrast: 1.05,
    saturation: 1.04,
    temperature: 0.12,
    shadows: 0x0a0604,
    highlights: 0xfff6ea,
    vignette: 0.28,
    grain: 0.018,
    bloom: 0.28,
    haze: { color: 0x000000, density: 0 },
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
  },
};
