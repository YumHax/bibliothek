import { LOOKS, type Look } from '@/graphics';

/*
 * The opening's grades (docs/graphics.md: a `Look` is the frame's grade and air). The reflections stay the flat's,
 * so no new prefiltered copy of the room is made for a minute of film.
 */

/** Félix's flat as it is remembered: warm, soft, glowing, a golden haze in the air, the corners dark. */
export const DREAM_LOOK: Look = {
  exposure: 0.2,
  contrast: 0.97,
  saturation: 1.1,
  temperature: 0.38,
  shadows: 0x1c1008,
  highlights: 0xffe2bd,
  vignette: 0.62,
  grain: 0.035,
  bloom: 0.95,
  haze: { color: 0xd8a064, density: 0.05 },
  reflections: LOOKS.home.reflections,
};

/** The sale: the warmth draining out, the colour with it, a grey dust in the air. */
export const SALE_LOOK: Look = {
  exposure: -0.25,
  contrast: 1.04,
  saturation: 0.55,
  temperature: -0.3,
  shadows: 0x04070c,
  highlights: 0xe6eef8,
  vignette: 0.7,
  grain: 0.04,
  bloom: 0.35,
  haze: { color: 0x6c7888, density: 0.035 },
  reflections: LOOKS.home.reflections,
};
