import { nowPlaying } from '@/world/screen/nowPlaying';

/*
 * How much noise the flat makes for the neighbours, 0 (quiet) .. 1 (a party), whoever listens:
 * not where the player stands (that is `nowPlaying.loudness`) but what is on. A longplay on a
 * screen counts by itself; other things that play (the kitchen's radio, a record player) add a
 * source. Read by the noise complaints (`noiseComplaints`): loud after hours, the downstairs
 * neighbour hears it.
 */

/** A longplay on one of the flat's screens: the TV or the projector, game music and all. */
const LONGPLAY = 0.7;

const sources = new Map<string, () => number>();

/** Counts `source` (0..1) as the flat's noise under `name` until the returned function is called. */
export function addFlatNoise(name: string, source: () => number): () => void {
  sources.set(name, source);
  return () => {
    if (sources.get(name) === source) sources.delete(name);
  };
}

/** The flat's loudest noise now, 0..1. */
export function flatNoise(): number {
  let loudest = nowPlaying.platform !== null ? LONGPLAY : 0;
  for (const source of sources.values()) loudest = Math.max(loudest, source());
  return loudest;
}

/** What makes it, for a neighbour's words ("your TV", "your radio"): the loudest source's name. */
export function flatNoiseSource(): string | null {
  let loudest = nowPlaying.platform !== null ? LONGPLAY : 0;
  let name: string | null = loudest > 0 ? 'TV' : null;
  for (const [key, source] of sources) {
    const level = source();
    if (level > loudest) {
      loudest = level;
      name = key;
    }
  }
  return name;
}
