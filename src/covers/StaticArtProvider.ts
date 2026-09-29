import type { Game } from '@/catalog/types';
import type { BoxArtKind, BoxArtUrls, CoverArtProvider } from './CoverArtProvider';

/** Where `npm run bake-art` leaves the seed catalogue's art (public/boxart, served as is). */
const ROOT = '/boxart';

/** `public/boxart/index.json`: per `<platform>/<libretroName>`, its folder and the faces baked there (`<kind>.webp`). */
export interface StaticArtIndex {
  version: 1;
  games: Record<string, { dir: string; files: BoxArtKind[] }>;
}

/**
 * The art baked into the build for the built-in games (scripts/bake-box-art.mjs): front, back,
 * spine, cartridge and disc as static files, first in every chain, so those games need no API.
 * The index is fetched once; without one (not baked, a host that lost it) it answers nothing.
 */
export class StaticArtProvider implements CoverArtProvider {
  readonly id = 'static';
  private index: Promise<StaticArtIndex['games']> | null = null;

  constructor(private readonly kinds?: readonly BoxArtKind[]) {}

  async getBoxArt(game: Game): Promise<BoxArtUrls | null> {
    const name = game.externalIds?.libretroName;
    if (!name) return null;
    const entry = (await this.games())[`${game.platform}/${name}`];
    if (!entry) return null;
    const urls: BoxArtUrls = {};
    for (const kind of entry.files) if (!this.kinds || this.kinds.includes(kind)) urls[kind] = `${ROOT}/${entry.dir}/${kind}.webp`;
    return urls;
  }

  private games(): Promise<StaticArtIndex['games']> {
    this.index ??= fetch(`${ROOT}/index.json`)
      .then(async (response) => {
        // A dev server answers an unknown path with the page itself: only JSON counts.
        if (!response.ok || !response.headers.get('content-type')?.includes('json')) return {};
        const index = (await response.json()) as Partial<StaticArtIndex>;
        return index.version === 1 && index.games ? index.games : {};
      })
      .catch(() => ({}));
    return this.index;
  }
}
