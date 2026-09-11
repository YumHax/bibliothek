import type { Game } from '@/catalog/types';

/**
 * Image kinds a provider may know about. `front`/`back`/`spine` are box faces;
 * `snap` (in-game screenshot) and `title` (title screen) feed the generated back cover.
 */
export type BoxArtKind = 'front' | 'back' | 'spine' | 'snap' | 'title';
export type BoxArtUrls = Partial<Record<BoxArtKind, string>>;

/**
 * A source of box-art images. Implementations may be synchronous (URL templates)
 * or asynchronous (search APIs such as IGDB / TheGamesDB), hence the Promise union.
 * Return only the kinds you actually have; missing ones are filled by the next provider
 * or generated procedurally.
 */
export interface CoverArtProvider {
  readonly id: string;
  getBoxArt(game: Game): BoxArtUrls | null | Promise<BoxArtUrls | null>;
}

/** Asks providers in order; for each kind, the first provider with a URL wins. */
export class CoverArtResolver implements CoverArtProvider {
  readonly id = 'chain';

  constructor(private readonly providers: CoverArtProvider[]) {}

  async getBoxArt(game: Game): Promise<BoxArtUrls> {
    const merged: BoxArtUrls = {};
    for (const provider of this.providers) {
      try {
        const urls = await provider.getBoxArt(game);
        if (!urls) continue;
        for (const [kind, url] of Object.entries(urls) as [BoxArtKind, string][]) {
          merged[kind] ??= url;
        }
      } catch (err) {
        console.warn(`[covers] provider "${provider.id}" failed for ${game.title}`, err);
      }
    }
    return merged;
  }
}
