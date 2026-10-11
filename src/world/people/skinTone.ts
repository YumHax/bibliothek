import { lcg } from '@/random';

/*
 * Skin colour as what absorbs light in it: melanin (brown, darker towards blue), haemoglobin
 * (the blood's red, taking green and blue) and carotene (the yellow undertone), over a pale
 * base. Each of the palette's tones is solved back into these three amounts, and a person's own
 * tone is theirs varied a little in each: darker or lighter, rosier or sallower, more golden or
 * more pink. The painted face reddens and darkens the same way (`absorb`), so a flush on dark
 * skin deepens it instead of lightening it towards pink.
 */

type RGB = [number, number, number];

/** What one unit of each absorber takes from red, green and blue (optical depth, linear light). */
const MELANIN: RGB = [0.85, 1, 1.1];
const HAEMOGLOBIN: RGB = [0.05, 0.75, 0.45];
const CAROTENE: RGB = [0, 0.08, 0.6];
/** Skin with none of them. */
const BASE: RGB = [0.95, 0.86, 0.8];

/** The tone drawn for `seed` near `base` (a palette tone): the same person always gets the same one. */
export function skinTone(base: number, seed: number): number {
  const [m, h, c] = absorbers(base);
  const random = lcg(seed * 2654435761 + 29);
  const melanin = m * (0.88 + random() * 0.24);
  const blood = Math.max(0, h + (random() - 0.5) * 0.3);
  const carotene = Math.max(0, c + (random() - 0.5) * 0.6);
  const rgb = [0, 1, 2].map((i) => toSrgb(BASE[i]! * Math.exp(-melanin * MELANIN[i]! - blood * HAEMOGLOBIN[i]! - carotene * CAROTENE[i]!)));
  return (rgb[0]! << 16) | (rgb[1]! << 8) | rgb[2]!;
}

/**
 * `rgb` (0..255, sRGB) with `melanin` and `blood` more (or less, negative) of each absorber in it:
 * a flush is blood, shade under the eyes melanin. Close enough in sRGB for paint (no conversion).
 */
export function absorb(rgb: RGB, melanin: number, blood: number): RGB {
  return absorbInto([0, 0, 0], rgb, melanin, blood);
}

/** `absorb` written into `out` (the face's painter calls it for every pixel: no allocation). */
export function absorbInto(out: RGB, rgb: RGB, melanin: number, blood: number): RGB {
  const k = 1 / 2.2;
  out[0] = rgb[0] * Math.exp(-(melanin * MELANIN[0] + blood * HAEMOGLOBIN[0]) * k);
  out[1] = rgb[1] * Math.exp(-(melanin * MELANIN[1] + blood * HAEMOGLOBIN[1]) * k);
  out[2] = rgb[2] * Math.exp(-(melanin * MELANIN[2] + blood * HAEMOGLOBIN[2]) * k);
  return out;
}

/** The amounts of melanin, haemoglobin and carotene that make `color` over the base (three channels, three unknowns). */
function absorbers(color: number): RGB {
  const depth = [(color >> 16) & 255, (color >> 8) & 255, color & 255].map((c, i) => -Math.log(Math.max(1e-4, toLinear(c)) / BASE[i]!));
  const a = [0, 1, 2].map((i) => [MELANIN[i]!, HAEMOGLOBIN[i]!, CAROTENE[i]!]);
  const det = (m: number[][]): number =>
    m[0]![0]! * (m[1]![1]! * m[2]![2]! - m[1]![2]! * m[2]![1]!) - m[0]![1]! * (m[1]![0]! * m[2]![2]! - m[1]![2]! * m[2]![0]!) + m[0]![2]! * (m[1]![0]! * m[2]![1]! - m[1]![1]! * m[2]![0]!);
  const d = det(a);
  return [0, 1, 2].map((k) => Math.max(0, det(a.map((row, i) => row.map((v, j) => (j === k ? depth[i]! : v)))) / d)) as RGB;
}

function toLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function toSrgb(v: number): number {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, c)) * 255);
}
