import type { Game, PlatformId } from '@/catalog/types';
import { SEED_GAMES } from '@/catalog';
import { KEYS, PersistedStore } from '@/persistence';
import { gameDayRandom } from '@/time/daily';
import { coproChoice } from '@/building/coproState';

/*
 * The old channels the roof's aerial brings in for the flat's TV: each a little station that only
 * ever shows longplays of one kind (8-bit afternoons, the Mega Drive's blast, 16-bit Sundays,
 * polygons after dark). The aerial turns in `AERIAL_STEPS` steps; each channel comes in clear at its
 * own `step` (its mast across the city), and once found it stays found. What a channel shows changes
 * every two game hours: one of its games, drawn by the game day and the slot.
 */

export interface Channel {
  id: string;
  /** The number on the tuner's dial. */
  number: number;
  name: string;
  platforms: readonly PlatformId[];
  /** The aerial's step it comes in clear at; null for the fibre's (no aerial: the co-ownership voted the fibre in). */
  step: number | null;
}

/** The aerial turns a full circle in this many steps (one a click). */
export const AERIAL_STEPS = 16;

export const CHANNELS: readonly Channel[] = [
  { id: 'eightbit', number: 2, name: 'RETRO 2 · 8-bit afternoons', platforms: ['nes', 'gb'], step: 3 },
  { id: 'blast', number: 3, name: 'BLAST 3 · the Mega Drive hour', platforms: ['megadrive'], step: 7 },
  { id: 'sixteen', number: 4, name: 'CANAL 4 · 16-bit Sundays', platforms: ['snes'], step: 10 },
  { id: 'polygons', number: 5, name: 'NIGHT 5 · polygons after dark', platforms: ['n64', 'ps1'], step: 14 },
  { id: 'fibre', number: 9, name: 'FIBRE 9 · every console, all night', platforms: ['nes', 'snes', 'gb', 'megadrive', 'n64', 'ps1'], step: null },
];

/** How strong the signal is at aerial `step`: 1 on a channel's step, a little either side, a hiss elsewhere. */
export function signalAt(step: number): { strength: number; channel: Channel | null } {
  let best = 0.08;
  let channel: Channel | null = null;
  for (const c of CHANNELS) {
    if (c.step === null) continue;
    const d = Math.min(Math.abs(step - c.step), AERIAL_STEPS - Math.abs(step - c.step));
    const s = d === 0 ? 1 : d === 1 ? 0.35 : 0.08;
    if (s > best) {
      best = s;
      channel = d === 0 ? c : null;
    }
  }
  return { strength: best, channel };
}

/** The game on `channel` at game day `day`, hour `hours` (a new show every two hours). */
export function showOn(channel: Channel, day: number, hours: number): Game | null {
  const pool = SEED_GAMES.filter((g) => channel.platforms.includes(g.platform));
  if (!pool.length) return null;
  const slot = Math.floor(hours / 2);
  const pick = gameDayRandom(`channel:${channel.id}:${slot}`, day)();
  return pool[Math.floor(pick * pool.length)] ?? null;
}

interface AerialState {
  step: number;
  found: string[];
}

const store = new PersistedStore<AerialState>({
  key: KEYS.aerial,
  version: 1,
  defaults: () => ({ step: 0, found: [] }),
  read: (data) => {
    if (typeof data !== 'object' || data === null) return null;
    const d = data as { step?: unknown; found?: unknown };
    const step = typeof d.step === 'number' && Number.isFinite(d.step) ? ((Math.round(d.step) % AERIAL_STEPS) + AERIAL_STEPS) % AERIAL_STEPS : 0;
    const found = Array.isArray(d.found) ? d.found.filter((id): id is string => typeof id === 'string' && CHANNELS.some((c) => c.id === id)) : [];
    return { step, found };
  },
});

let state: AerialState | null = null;
const listeners = new Set<() => void>();

function current(): AerialState {
  return (state ??= store.load());
}

/** Where the aerial points now (its step). */
export function aerialStep(): number {
  return current().step;
}

/** The channels found so far, in dial order. */
export function foundChannels(): Channel[] {
  const found = new Set(current().found);
  return CHANNELS.filter((c) => found.has(c.id) || (c.step === null && coproChoice('fibre') === 'yes'));
}

/**
 * The aerial turned to `step`: saved, and the channel that comes in clear there found (once).
 * Returns that channel when it is new.
 */
export function turnAerial(step: number): Channel | null {
  const now = current();
  const { channel } = signalAt(step);
  const fresh = channel && !now.found.includes(channel.id) ? channel : null;
  state = { step, found: fresh ? [...now.found, fresh.id] : now.found };
  store.save(state);
  for (const cb of listeners) cb();
  return fresh;
}

/** Calls `cb` when the aerial turns or a channel is found; returns the unsubscribe. */
export function onChannels(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
