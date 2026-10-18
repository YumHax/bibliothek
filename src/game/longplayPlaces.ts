import { KEYS, PersistedStore } from '@/persistence';

/** Where a game's longplay was left off: which video, and how far into it (s). */
interface Place {
  videoId: string;
  seconds: number;
  /** When it was kept, as a running count: the oldest go first (an object's key order puts number-like ids first). */
  n: number;
}

/** The games kept at most (the oldest put aside first): a small save, whatever the collection's size. */
const MAX_PLACES = 300;
/** A place this near the start or the end is not worth going back to: the next play draws a fresh spot. */
const EDGE_S = 90;

function readPlaces(data: unknown): Record<string, Place> | null {
  if (!data || typeof data !== 'object') return null;
  const places: Record<string, Place> = {};
  for (const [id, raw] of Object.entries(data as Record<string, unknown>)) {
    const place = raw as Partial<Place> | null;
    if (place && typeof place.videoId === 'string' && typeof place.seconds === 'number' && Number.isFinite(place.seconds)) places[id] = { videoId: place.videoId, seconds: place.seconds, n: typeof place.n === 'number' ? place.n : 0 };
  }
  return places;
}

/**
 * Where each game's longplay was left off (docs/media.md "Longplays"): switched off mid-way, the next play of that game
 * goes on from there, on the same video, as the NES carts keep their saves; a fresh game (or a video the search no
 * longer finds) starts at a random spot past the intro. Persisted, the oldest places dropped past `MAX_PLACES`.
 */
export class LongplayPlaces {
  private readonly store = new PersistedStore<Record<string, Place>>({ key: KEYS.longplayPlaces, version: 1, defaults: () => ({}), read: readPlaces });
  private places = this.store.load();

  /** Where `gameId`'s longplay `videoId` was left, or null (never watched, another video, too near an edge). */
  at(gameId: string, videoId: string, duration: number): number | null {
    const place = this.places[gameId];
    if (!place || place.videoId !== videoId) return null;
    if (place.seconds < EDGE_S || (duration > 0 && place.seconds > duration - EDGE_S)) return null;
    return place.seconds;
  }

  /** The longplay of `gameId` stopped at `seconds` into `videoId`. */
  keep(gameId: string, videoId: string, seconds: number): void {
    const n = Math.max(0, ...Object.values(this.places).map((p) => p.n)) + 1;
    this.places[gameId] = { videoId, seconds: Math.floor(seconds), n };
    const ids = Object.keys(this.places).sort((a, b) => this.places[a]!.n - this.places[b]!.n);
    for (const id of ids.slice(0, Math.max(0, ids.length - MAX_PLACES))) delete this.places[id];
    this.store.save(this.places);
  }
}
