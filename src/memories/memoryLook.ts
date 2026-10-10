import { LOOKS, type Look } from '@/graphics';

/**
 * A memory's grade (docs/graphics.md: a `Look`): an old print from the album, warm and a little faded, the blacks
 * lifted, a coarse grain, the corners dark. The reflections stay the room's, so no prefiltered copy is made for it.
 */
export const MEMORY_LOOK: Look = {
  exposure: 0.15,
  contrast: 0.9,
  saturation: 0.72,
  temperature: 0.32,
  shadows: 0x2a1c10,
  highlights: 0xfff0d6,
  vignette: 0.72,
  grain: 0.06,
  bloom: 0.7,
  haze: { color: 0xd8b080, density: 0.03 },
  reflections: LOOKS.home.reflections,
};
