import { KEYS, PersistedStore } from '@/persistence';
import type { PersonId } from '../types';

/*
 * What the building's quarrels keep (docs/social.md "Conflicts"), saved under `KEYS.socialConflicts`: for each
 * quarrel, when it started, whose side the player heard and took, how it ended; and the votes promised before the
 * co-owners' meetings. A leaf (nothing of `social/` but types), so `promises.ts` reads it without a cycle.
 */

/** A quarrel's ids (`conflictsPlan.CONFLICTS`). */
export type ConflictId = 'noise' | 'rumour' | 'hunt';

/** How one quarrel stands. */
export interface ConflictState {
  /** The game day it started (both sides met), or null: not yet. */
  started: number | null;
  /** The side the player took, and when; null while it brews. */
  side: 'a' | 'b' | null;
  decided: number | null;
  /** The game day it blew over without the player (no side taken in time). */
  lapsed: number | null;
  /** The game day the player made the two make up (a friend of both), or null. */
  peace?: number | null;
  /** Each side told the player their side of it. */
  told: { a?: boolean; b?: boolean };
  /** The winner told how it went; the loser said their piece; the loser's way back taken. */
  concluded: boolean;
  lostSaid: boolean;
  wayBack: boolean;
  /** `hunt`: the game both are after (its title), drawn at the start. */
  game?: string;
}

/** A vote promised before a co-owners' meeting: to vote `option` on `resolution` at the meeting of `meeting`, like `person`. */
export interface VotePromise {
  person: PersonId;
  meeting: number;
  resolution: string;
  option: string;
  /** The game day it was promised. */
  made: number;
  /** Kept or broken once the meeting sat; null while it is to come. */
  kept: boolean | null;
}

interface ConflictSave {
  conflicts: Partial<Record<ConflictId, ConflictState>>;
  votes: VotePromise[];
}

let store: PersistedStore<ConflictSave> | null = null;
let state: ConflictSave | null = null;

function readSave(data: unknown): ConflictSave | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Partial<ConflictSave>;
  const conflicts: ConflictSave['conflicts'] = {};
  for (const [id, c] of Object.entries(d.conflicts ?? {})) {
    if (!c || typeof c !== 'object') continue;
    const v = c as Partial<ConflictState>;
    conflicts[id as ConflictId] = {
      started: typeof v.started === 'number' ? v.started : null,
      side: v.side === 'a' || v.side === 'b' ? v.side : null,
      decided: typeof v.decided === 'number' ? v.decided : null,
      lapsed: typeof v.lapsed === 'number' ? v.lapsed : null,
      peace: typeof v.peace === 'number' ? v.peace : null,
      told: { a: v.told?.a === true, b: v.told?.b === true },
      concluded: v.concluded === true,
      lostSaid: v.lostSaid === true,
      wayBack: v.wayBack === true,
      game: typeof v.game === 'string' ? v.game : undefined,
    };
  }
  const votes = Array.isArray(d.votes)
    ? d.votes.filter((v): v is VotePromise => !!v && typeof v.person === 'string' && typeof v.meeting === 'number' && typeof v.resolution === 'string' && typeof v.option === 'string' && typeof v.made === 'number' && (v.kept === null || typeof v.kept === 'boolean'))
    : [];
  return { conflicts, votes };
}

/** The state, loaded on first use. */
export function conflictSave(): ConflictSave {
  if (state) return state;
  store = new PersistedStore<ConflictSave>({ key: KEYS.socialConflicts, version: 1, defaults: () => ({ conflicts: {}, votes: [] }), read: readSave });
  state = store.load();
  return state;
}

export function saveConflicts(): void {
  if (state) store?.save(state);
}

/** How quarrel `id` stands (a fresh, not started one when never touched). */
export function conflictOf(id: ConflictId): ConflictState {
  const all = conflictSave().conflicts;
  return (all[id] ??= { started: null, side: null, decided: null, lapsed: null, told: {}, concluded: false, lostSaid: false, wayBack: false });
}
