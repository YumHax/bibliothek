import type { Game } from './types';
import { PLATFORMS } from './platforms';
import { canonicalGameId } from './index';

/** Whether `value` has a game's shape (a non-empty id, a title, a platform), known platform or not. */
export function isGameShape(value: unknown): value is Game {
  if (typeof value !== 'object' || value === null) return false;
  const g = value as Record<string, unknown>;
  return typeof g.id === 'string' && g.id.length > 0 && typeof g.title === 'string' && typeof g.platform === 'string';
}

/** Whether `value` is a game this build can show: a game's shape on a platform it knows. */
export function isGame(value: unknown): value is Game {
  return isGameShape(value) && value.platform in PLATFORMS;
}

/** A game read back from storage, under its canonical id (see `canonicalGameId`), or null when it is not one. */
export function readGame(value: unknown): Game | null {
  if (!isGame(value)) return null;
  const id = canonicalGameId(value.id);
  return id === value.id ? value : { ...value, id };
}
