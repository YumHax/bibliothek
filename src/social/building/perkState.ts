import { KEYS, PersistedStore } from '@/persistence';

/*
 * What the building's perks have given and when (`KEYS.buildingPerks`): a gift given once is never given again
 * (Lucien's box, Gilles's cartridges, Théo's cart, Claire's game, Mrs Roux's parting gift), a once-a-day perk
 * remembers its day (a story, a meal, the cat fed, a race, a hand of cards).
 */

interface PerkState {
  /** Gifts given, by id. */
  given: string[];
  /** Once-a-day perks: id -> the game day it last ran. */
  days: Record<string, number>;
  /** Steps of the arcs: id -> step reached. */
  steps: Record<string, number>;
}

let store: PersistedStore<PerkState> | null = null;
let state: PerkState | null = null;

function loaded(): PerkState {
  if (state) return state;
  store = new PersistedStore<PerkState>({ key: KEYS.buildingPerks, version: 1, defaults: () => ({ given: [], days: {}, steps: {} }), read: readState });
  state = store.load();
  return state;
}

function readState(data: unknown): PerkState | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Partial<PerkState>;
  const days: Record<string, number> = {};
  const steps: Record<string, number> = {};
  for (const [k, v] of Object.entries(d.days ?? {})) if (typeof v === 'number') days[k] = v;
  for (const [k, v] of Object.entries(d.steps ?? {})) if (typeof v === 'number') steps[k] = v;
  return { given: Array.isArray(d.given) ? d.given.filter((g): g is string => typeof g === 'string') : [], days, steps };
}

function save(): void {
  store?.save(loaded());
}

/** Whether the gift `id` was given already. */
export function given(id: string): boolean {
  return loaded().given.includes(id);
}

/** Marks the gift `id` given. */
export function markGiven(id: string): void {
  const s = loaded();
  if (s.given.includes(id)) return;
  s.given.push(id);
  save();
}

/** Whether the daily perk `id` ran on `day` already. */
export function doneOn(id: string, day: number): boolean {
  return loaded().days[id] === day;
}

/** The daily perk `id` ran on `day`. */
export function markDay(id: string, day: number): void {
  loaded().days[id] = day;
  save();
}

/** The step an arc reached (0: not begun). */
export function step(id: string): number {
  return loaded().steps[id] ?? 0;
}

export function setStep(id: string, value: number): void {
  loaded().steps[id] = value;
  save();
}
