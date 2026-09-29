/*
 * The sky both pictures share (the window panes' `props/outdoors/shader` and the street's dome,
 * `street/skyDomeShader`): the sun's halo, the moon's crescent and the cloud cover's curve, so the
 * sky from the flat and the sky over the street agree. Plain GLSL in a template literal: no
 * backtick may appear in it, not even in a comment.
 */

/** A new moon (2000-01-06 18:14 UTC) in days since 1970, and the synodic month in days. */
const NEW_MOON_EPOCH_DAYS = 10957.76;
const SYNODIC_MONTH = 29.530589;
/** The shadow disc's offset from the moon at the thinnest crescent shown (a new moon would leave nothing in the sky) and past full. */
const THINNEST = 0.45;
const FULLEST = 2.2;

/**
 * How far the moon's shadow disc is offset from the moon (yaw, pitch), for the crescent, in moon
 * radii: each picture scales it by its own moon's size. Tonight's real phase (the same for the
 * whole session, both pictures agree): the offset grows from a thin crescent to past the disc at
 * full moon, on one side waxing and the other waning.
 */
export const MOON_SHADOW_OFFSET = moonShadowOffset(Date.now() / 86_400_000);

function moonShadowOffset(days: number): { yaw: number; pitch: number } {
  const age = (((days - NEW_MOON_EPOCH_DAYS) / SYNODIC_MONTH) % 1 + 1) % 1;
  const lit = (1 - Math.cos(age * 2 * Math.PI)) / 2;
  const reach = THINNEST + (FULLEST - THINNEST) * lit;
  // The shadow's side, tilted a little as the crescent always is.
  const side = age < 0.5 ? -1 : 1;
  return { yaw: side * reach * 0.894, pitch: reach * 0.447 };
}

export const SKY_CHUNK = /* glsl */ `
  float skyAngle(vec3 a, vec3 b) {
    return acos(clamp(dot(a, b), -1.0, 1.0));
  }
  // The sun's halo round it: wider and stronger as the sun gets low (sunLow 0 high .. 1 on the horizon).
  float skySunHalo(float angle, float sunLow) {
    float haloRadius = 0.22 + 0.3 * sunLow;
    return pow(max(1.0 - angle / haloRadius, 0.0), 2.4) * (0.7 + 0.9 * sunLow);
  }
  // The sun's disc: white high up, taking the light's colour as it sets.
  vec3 skySunDisc(vec3 sunColor, float sunLow) {
    return mix(vec3(1.0, 0.98, 0.93), sunColor * 1.15, sunLow);
  }
  // How much of the moon's disc is lit at d: the disc less a shadow disc offset from it (the crescent).
  float skyMoonLit(vec3 d, vec3 moonDir, vec3 moonShadowDir, float radius) {
    float disc = 1.0 - smoothstep(radius * 0.9, radius * 1.1, skyAngle(d, moonDir));
    float shadow = 1.0 - smoothstep(radius * 0.85, radius * 1.05, skyAngle(d, moonShadowDir));
    return disc * (1.0 - shadow);
  }
  // The moon's faint halo.
  float skyMoonHalo(vec3 d, vec3 moonDir) {
    return pow(max(1.0 - skyAngle(d, moonDir) / 0.2, 0.0), 2.0) * 0.18;
  }
  // The overcast sheet for cloud noise n (about 0..1) at a cover of 0 (clear) .. 1 (overcast).
  float skyCloudSheet(float n, float cover) {
    return smoothstep(1.0 - cover, 1.25 - cover, n + 0.2 * cover);
  }
`;
