/*
 * Randomness, in one place: the hashes (`hash.ts`), the streams (`streams.ts`) and the draws made from a stream
 * (`draws.ts`). Day draws go through `time/daily`, which is built on these. `Math.random` is called in `streams.ts`
 * only: everything live draws through `random`, so the headless checks can seed the whole game at once.
 */
export { fnv1a, unit01, hashInts, unitOf } from './hash';
export { random, seedLiveRandom, lcg, mulberry32, frozenRng, seededRng, type Rng } from './streams';
export { pick, pickWeighted, shuffled, between, within, integer, chance } from './draws';
