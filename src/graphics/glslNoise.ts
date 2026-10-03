/**
 * The GLSL hashes and value noises the shaders share, each guarded so two snippets prepended to one shader
 * declare it once. Several hashes on purpose: every look was tuned on its own, and swapping one hash for
 * another moves every cloud, flicker and grain it drives. A shader keeps the hash it was tuned on; the noise
 * and fbm builders take its name. Pasted into template literals: no backtick in here.
 */

function guard(name: string, code: string): string {
  return `#ifndef GLSL_${name}\n#define GLSL_${name}\n${code}\n#endif\n`;
}

/**
 * `sineHash(x)`, 0..1, for a float, a vec2 or a vec3: the classic fract(sin(.) * 43758.5453). Cheap; loses
 * its spread past inputs of about 1e4 (and may differ a little between GPUs), so keep it to lattice cells.
 */
export const SINE_HASH = guard(
  'SINE_HASH',
  /* glsl */ `float sineHash(float n) { return fract(sin(n) * 43758.5453); }
float sineHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float sineHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }`,
);

/** `hoskinsHash(p)`, 0..1 (Dave Hoskins's hash without sine): steady at large inputs and the same on every GPU. */
export const HOSKINS_HASH = guard(
  'HOSKINS_HASH',
  /* glsl */ `float hoskinsHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}`,
);

/** `fractHash(p)`, 0..1: a two-multiply hash without sine (the painted window view's clouds, snow and lights). */
export const FRACT_HASH = guard(
  'FRACT_HASH',
  /* glsl */ `float fractHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}`,
);

/** `iqHash(p)`, 0..1, in 3D (Inigo Quilez's): the sunbeams' moving air. */
export const IQ_HASH = guard(
  'IQ_HASH',
  /* glsl */ `float iqHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}`,
);

/**
 * `float <name>(vec2 p)`: value noise, 0..1, the lattice's corners hashed by `hash` (a `float(vec2)` from
 * one of the chunks above, prepended before it) and blended by smoothstep.
 */
export function valueNoise2(name: string, hash: string): string {
  return guard(
    `NOISE2_${name}_${hash}`,
    /* glsl */ `float ${name}(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(${hash}(i), ${hash}(i + vec2(1.0, 0.0)), u.x), mix(${hash}(i + vec2(0.0, 1.0)), ${hash}(i + vec2(1.0, 1.0)), u.x), u.y);
}`,
  );
}

/** `float <name>(vec3 p)`: value noise in 3D, 0..1, over `hash` (a `float(vec3)`). */
export function valueNoise3(name: string, hash: string): string {
  return guard(
    `NOISE3_${name}_${hash}`,
    /* glsl */ `float ${name}(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(${hash}(i), ${hash}(i + vec3(1, 0, 0)), f.x), mix(${hash}(i + vec3(0, 1, 0)), ${hash}(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(${hash}(i + vec3(0, 0, 1)), ${hash}(i + vec3(1, 0, 1)), f.x), mix(${hash}(i + vec3(0, 1, 1)), ${hash}(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}`,
  );
}

/**
 * `float <name>(vec2 p)`: fractal sum of `octaves` octaves of `noise` (a `float(vec2)`), each 2.03 times finer,
 * shifted by `shift` (so the lattices never line up) and half as strong. 0..1 (just under).
 */
export function fbm2(name: string, noise: string, octaves: number, shift: readonly [number, number]): string {
  const [sx, sy] = shift.map((v) => v.toFixed(2));
  return guard(
    `FBM2_${name}_${noise}`,
    /* glsl */ `float ${name}(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < ${Math.round(octaves)}; i++) {
    v += a * ${noise}(p);
    p = p * 2.03 + vec2(${sx}, ${sy});
    a *= 0.5;
  }
  return v;
}`,
  );
}
