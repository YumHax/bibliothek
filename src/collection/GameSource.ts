import type { Game } from '@/catalog/types';

/**
 * Read-only view of the collection for consumers that only display it (shelves, panels).
 * `subscribe` fires after any change to `games`; the callback re-reads `games`.
 */
export interface GameSource {
  readonly games: readonly Game[];
  subscribe(cb: () => void): () => void;
  /**
   * What the last change was, when the source knows: 'import' (a whole collection loaded, the
   * editor's import, back to the seed) or 'edit' (games bought, sold, changed one purchase at a time).
   */
  readonly lastChange?: 'import' | 'edit';
}
