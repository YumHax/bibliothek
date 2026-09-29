import type { PlatformId } from '@/catalog/types';

/**
 * What the flat's screens are doing, for the things that answer them without holding one: the
 * console whose game plays lights its power LED (`props/consoleStyles`), the hi-fi speakers pulse
 * with the loudness (`props/Speaker`). Written by `game/Screens` (the platform) and every
 * `VideoSurface` (its loudness); read every frame, so it is plain state, no events.
 */
let platform: PlatformId | null = null;
let gameId: string | null = null;
const sources = new Set<() => number>();

export const nowPlaying = {
  /** The platform of the game whose longplay is on a screen, or null. */
  get platform(): PlatformId | null {
    return platform;
  },

  /** That game's id, or null: a visiting friend does not ask to borrow the box in the console. */
  get gameId(): string | null {
    return gameId;
  },

  setPlatform(next: PlatformId | null, game: string | null = null): void {
    platform = next;
    gameId = next ? game : null;
  },

  /** The loudest screen's volume where the listener stands, 0..1 (0 when nothing plays). */
  loudness(): number {
    let loudest = 0;
    for (const source of sources) loudest = Math.max(loudest, source());
    return loudest;
  },

  /** A screen's loudness getter, counted until the returned function is called. */
  addSource(source: () => number): () => void {
    sources.add(source);
    return () => sources.delete(source);
  },
};
