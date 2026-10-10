import * as THREE from 'three';

/**
 * The one rule for `toneMapped: false` (screens, neon, marquees, fairy lights): every level tone-maps
 * everything with ACES, so a sign looks the same on `low` as on `medium` and `high`.
 *
 * Why: with `PostFx` (medium, high) the scene renders into an off-screen target, where three.js tone
 * maps nothing, and the output pass tone-maps every pixel alike: a material cannot opt out there
 * (the frame has no channel left to mark it: the alpha is the video cut-out). On `low` three.js
 * tone-maps while drawing to the canvas and honours `toneMapped: false`, so displays came out
 * brighter and more saturated than on the levels they were tuned on. Here, on `low`,
 * `Material.prototype.toneMapped` becomes an accessor that always reads true (writes are ignored),
 * so the flag means nothing anywhere; materials keep declaring it, harmlessly. Called by
 * `quality.ts` as it resolves `QUALITY`, before any material is made (one made earlier would keep
 * an own property).
 */
export function toneMapEveryMaterial(enabled: boolean): void {
  if (!enabled) return;
  Object.defineProperty(THREE.Material.prototype, 'toneMapped', {
    configurable: true,
    get: () => true,
    set: () => undefined,
  });
}

/**
 * `low` has no output pass and so no grain to break up 8-bit gradients (the sky dome, a lamp's
 * falloff on a wall, the window views band): every material dithers there, the same accessor trick
 * as `toneMapEveryMaterial` (three's `dithering`, a few ALU; a `ShaderMaterial` gets `DITHERING`
 * and dithers where its fragment shader includes `dithering_fragment`). Before any material is made.
 */
export function ditherEveryMaterial(enabled: boolean): void {
  if (!enabled) return;
  Object.defineProperty(THREE.Material.prototype, 'dithering', {
    configurable: true,
    get: () => true,
    set: () => undefined,
  });
}
