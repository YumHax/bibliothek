/*
 * What `scripts/check-data.mjs` reads from the game. The headless scripts (`scripts/headless.mjs` bundles one of
 * these modules and imports it in Node) take their imports from `src/headless/`, never from a string in the script,
 * so the typecheck catches a rename and knip sees the export in use (`knip.json` lists this folder as an entry).
 */
export { SEED_GAMES, LEGACY_SEED_IDS, canonicalGameId } from '@/catalog';
export { PLATFORMS, PLATFORM_LIST } from '@/catalog/platforms';
export { caseOf, mediaOf, regionOf, widestCaseOf, defaultCaseOf } from '@/catalog/media';
export { BOOTLEGS, isBootlegId } from '@/catalog/bootlegs';
export { gameIdFor } from '@/catalog/nointro';
export { KEYS, ROOT_PREFIX, CACHE_PREFIX, CORRUPT_PREFIX, PREFERENCE_KEYS } from '@/persistence/keys';
export { WORLD_PLAN, FLAT } from '@/world/worldPlan';
export { DEFAULT_ROOM } from '@/world/roomPlan';
export { ARCADE_GAMES } from '@/world/arcade/games';
export * as pricing from '@/economy/pricing';
