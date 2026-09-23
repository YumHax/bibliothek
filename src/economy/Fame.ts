import type { Game } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';

/**
 * How well known a game is: the average monthly page views of its English Wikipedia article,
 * `null` when it has none, `undefined` while unknown (not asked yet, or Wikipedia unreachable).
 */
export type Views = number | null | undefined;

/**
 * Client for `/api/fame?title=...&platform=...` (see server/fame.ts). One lookup per game per page
 * load; `peek` reads the answer synchronously once it is in, so a price shown and a price paid agree.
 */
export class Fame {
  private readonly known = new Map<string, Views>();
  private readonly pending = new Map<string, Promise<Views>>();

  constructor(private readonly endpoint = '/api/fame') {}

  /** The views if already looked up (including "no article" as null), else undefined. */
  peek(game: Pick<Game, 'id'>): Views {
    return this.known.get(game.id);
  }

  /** Looks the game up; resolves to undefined (never rejects) when the server or Wikipedia is unavailable. */
  lookup(game: Pick<Game, 'id' | 'title' | 'platform'>): Promise<Views> {
    if (this.known.has(game.id)) return Promise.resolve(this.known.get(game.id));
    let pending = this.pending.get(game.id);
    if (!pending) {
      pending = this.fetch(game).finally(() => this.pending.delete(game.id));
      this.pending.set(game.id, pending);
    }
    return pending;
  }

  private async fetch(game: Pick<Game, 'id' | 'title' | 'platform'>): Promise<Views> {
    try {
      const params = new URLSearchParams({ title: game.title, platform: getPlatform(game.platform).name });
      const res = await window.fetch(`${this.endpoint}?${params}`);
      if (!res.ok) return undefined;
      const body = (await res.json()) as { views?: unknown };
      const views: Views = body.views === null ? null : typeof body.views === 'number' ? body.views : undefined;
      if (views !== undefined) this.known.set(game.id, views);
      return views;
    } catch (err) {
      console.warn(`[fame] lookup failed for "${game.title}"`, err);
      return undefined;
    }
  }
}
