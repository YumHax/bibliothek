import type { Look } from '@/graphics';

/** A photo mode grade: a name, and the zone's own look turned into it (the haze stays the zone's). */
export interface PhotoLook {
  name: string;
  apply(base: Look): Look;
}

export const PHOTO_LOOKS: readonly PhotoLook[] = [
  { name: 'As seen', apply: (base) => base },
  {
    name: 'Warm film',
    apply: (base) => ({ ...base, temperature: base.temperature + 0.28, contrast: base.contrast * 1.06, saturation: base.saturation * 0.95, shadows: 0x0d0703, grain: 0.035, vignette: Math.max(base.vignette, 0.38) }),
  },
  { name: 'Cool night', apply: (base) => ({ ...base, temperature: base.temperature - 0.35, saturation: base.saturation * 0.88, contrast: base.contrast * 1.04, shadows: 0x03060d }) },
  { name: 'Black and white', apply: (base) => ({ ...base, saturation: 0, contrast: base.contrast * 1.18, grain: 0.04, vignette: Math.max(base.vignette, 0.42) }) },
  { name: 'Faded print', apply: (base) => ({ ...base, contrast: base.contrast * 0.84, saturation: base.saturation * 0.72, shadows: 0x161412, highlights: 0xf4efe4, grain: 0.028 }) },
  { name: 'Vivid', apply: (base) => ({ ...base, saturation: base.saturation * 1.32, contrast: base.contrast * 1.1, vignette: base.vignette * 0.6 }) },
];
