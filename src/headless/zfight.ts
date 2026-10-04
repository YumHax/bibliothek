/*
 * What `scripts/zfight.mjs` builds and runs: the catalogue's subjects and the browser's own detector (see `data.ts`
 * for why the headless scripts import through this folder).
 */
export { zfightSubjects } from '@/world/surface/zfightCatalogue';
export { findZFighting } from '@/world/surface/zfight';
export { seedLiveRandom } from '@/random';
export * as THREE from 'three';
