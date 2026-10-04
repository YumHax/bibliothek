/*
 * What `scripts/scene-lint.mjs` builds and runs: the z-fight catalogue's subjects and the lints of `world/lint/`
 * (see `data.ts` for why the headless scripts import through this folder).
 */
export { zfightSubjects } from '@/world/surface/zfightCatalogue';
export { lintLights } from '@/world/lint/lights';
export { lintPlacement } from '@/world/lint/placement';
export { lintReach } from '@/world/lint/reach';
export { lintDisposal } from '@/world/lint/disposal';
export { SharingLedger } from '@/world/lint/sharing';
export { markShared } from '@/world/materials/sharedResources';
export { seedLiveRandom } from '@/random';
export * as THREE from 'three';
