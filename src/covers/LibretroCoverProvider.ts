import type { Game } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import type { BoxArtUrls, CoverArtProvider } from './CoverArtProvider';

const GITHUB_URL = 'https://raw.githubusercontent.com/libretro-thumbnails';
/** Same-origin proxy served by the Vite middleware in dev and by api/art/[...path].ts in production. */
export const DEFAULT_ART_PROXY = '/api/art';

export interface LibretroCoverOptions {
  /**
   * Same-origin caching proxy (see server/artCache.ts): URLs become `<proxy>/<repo>/<folder>/<file>`.
   * Defaults to `/api/art`, which exists both in dev and on Vercel and serves 512 px WebP with a
   * one-year cache. Pass `null` to load straight from GitHub (static hosting without functions).
   */
  proxy?: string | null;
}

/**
 * Public, key-less art from https://github.com/libretro-thumbnails.
 * Only front box art, in-game snaps and title screens exist there (no back, no spine).
 * Files are named after No-Intro ROM names, e.g. "Legend of Zelda, The (USA).png".
 * libretro replaces the characters  & * / : ` < > ? \ |  with underscores.
 */
export class LibretroCoverProvider implements CoverArtProvider {
  readonly id = 'libretro';

  constructor(private readonly options: LibretroCoverOptions = {}) {}

  getBoxArt(game: Game): BoxArtUrls {
    const name = game.externalIds?.libretroName ?? game.title;
    const repo = getPlatform(game.platform).libretroRepo;
    const file = encodeURIComponent(sanitizeLibretroName(name)) + '.png';
    const proxy = this.options.proxy === undefined ? DEFAULT_ART_PROXY : this.options.proxy;
    const url = (folder: string) =>
      proxy ? `${proxy}/${repo}/${folder}/${file}` : `${GITHUB_URL}/${repo}/master/${folder}/${file}`;
    return {
      front: url('Named_Boxarts'),
      snap: url('Named_Snaps'),
      title: url('Named_Titles'),
    };
  }
}

const FORBIDDEN = /[&*\/:`<>?\\|]/g;

export function sanitizeLibretroName(name: string): string {
  return name.replace(FORBIDDEN, '_');
}
