import { KEYS, PersistedStore } from '@/persistence';
import type { PersonId } from './types';

/*
 * What the player has noticed in conversations (`KEYS.socialNoticed`): the entries each person has offered so far,
 * so one that appears for the first time (a tier reached opens "Ask a favour", a perk opens "Tell me about the
 * building") is marked "new" in the conversation it first shows in; and whether the first conversation's tip was
 * shown. Presentation only: nothing here changes what anyone does.
 */

interface NoticedSave {
  /** The first conversation's tip was shown. */
  tipShown: boolean;
  /** By person, the entries (the panel's row keys) offered in a conversation that ended. */
  offered: Record<PersonId, string[]>;
}

let store: PersistedStore<NoticedSave> | null = null;
let state: NoticedSave | null = null;

function loaded(): NoticedSave {
  if (state) return state;
  store = new PersistedStore<NoticedSave>({ key: KEYS.socialNoticed, version: 1, defaults: () => ({ tipShown: false, offered: {} }), read: readSave });
  state = store.load();
  return state;
}

function readSave(data: unknown): NoticedSave | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Partial<NoticedSave>;
  const offered: Record<PersonId, string[]> = {};
  for (const [id, keys] of Object.entries(d.offered ?? {})) if (Array.isArray(keys)) offered[id] = keys.filter((k): k is string => typeof k === 'string');
  return { tipShown: d.tipShown === true, offered };
}

/**
 * The entries `id` offered before, or null when nothing is known yet of what they offer (a first meeting, or someone
 * met before this was kept): then nothing is new, and what is offered now becomes the baseline.
 */
export function offeredBefore(id: PersonId): ReadonlySet<string> | null {
  const keys = loaded().offered[id];
  return keys ? new Set(keys) : null;
}

/** A conversation with `id` ended having offered `keys`: from now on they are not new. */
export function noteOffered(id: PersonId, keys: Iterable<string>): void {
  const s = loaded();
  const known = new Set(s.offered[id] ?? []);
  for (const key of keys) known.add(key);
  s.offered[id] = [...known];
  store?.save(s);
}

/** True the first time it is asked, ever (the first conversation's tip); false after. */
export function firstConversation(): boolean {
  const s = loaded();
  if (s.tipShown) return false;
  s.tipShown = true;
  store?.save(s);
  return true;
}
