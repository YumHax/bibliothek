import { KEYS, PersistedStore } from '@/persistence';
import { RESOLUTIONS, type ResolutionId } from './coproPlan';

/*
 * What the co-ownership meetings decided, and the player's ballots for the ones still to sit. One
 * store for the page, made on first use. The stairwell reads `coproChoice` (and `onCoproChange`) to
 * show the building as voted; other features may too (the lift's overhaul, the fibre's channels).
 */

/** The player's ballot for one meeting: their vote per resolution, the votes their coins bought. */
export interface Ballot {
  votes: Partial<Record<ResolutionId, string>>;
  bought: Partial<Record<ResolutionId, number>>;
}

/** How one resolution went: the option carried, the votes each option got, what the player voted. */
export interface Outcome {
  id: ResolutionId;
  winner: string;
  tally: Record<string, number>;
  player?: string;
  /** It changed the building (the winner differs from what stood before). */
  changed: boolean;
}

interface Saved {
  decided: Partial<Record<ResolutionId, string>>;
  /** Keyed by the meeting's game day. */
  ballots: Record<string, Ballot>;
  minutes: Record<string, Outcome[]>;
  /** The last meeting tallied (its game day; 0: none yet), so a jump of days tallies every meeting it skipped. */
  settled: number;
}

const KEPT_MINUTES = 4;

let store: PersistedStore<Saved> | null = null;
let state: Saved | null = null;
const listeners = new Set<() => void>();

function readSaved(data: unknown): Saved | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Partial<Saved>;
  return {
    decided: d.decided && typeof d.decided === 'object' ? d.decided : {},
    ballots: d.ballots && typeof d.ballots === 'object' ? d.ballots : {},
    minutes: d.minutes && typeof d.minutes === 'object' ? d.minutes : {},
    // Saved before the marker: the latest minutes kept say how far the tally went.
    settled: typeof d.settled === 'number' ? d.settled : Math.max(0, ...Object.keys(d.minutes ?? {}).map(Number).filter(Number.isFinite)),
  };
}

function load(): Saved {
  if (state) return state;
  store = new PersistedStore<Saved>({ key: KEYS.copro, version: 1, defaults: () => ({ decided: {}, ballots: {}, minutes: {}, settled: 0 }), read: readSaved });
  state = store.load();
  return state;
}

function save(): void {
  store!.save(state!);
  for (const cb of listeners) cb();
}

/** How the building stands on `id` now: what the last meeting on it decided, else as it always was. */
export function coproChoice(id: ResolutionId): string {
  const decided = load().decided[id];
  const resolution = RESOLUTIONS.find((r) => r.id === id)!;
  return decided && resolution.options.some((o) => o.id === decided) ? decided : resolution.initial;
}

/** The player's ballot for the meeting of game day `day` (empty if none cast). */
export function ballotFor(day: number): Ballot {
  return load().ballots[day] ?? { votes: {}, bought: {} };
}

/** Records the player's ballot for the meeting of `day` (replaces any before). */
export function castBallot(day: number, ballot: Ballot): void {
  load().ballots[day] = ballot;
  save();
}

/** The minutes of the meeting of `day`, once it sat; null before. */
export function minutesOf(day: number): Outcome[] | null {
  return load().minutes[day] ?? null;
}

/** The meeting of `day` sat: its outcomes are the building's now (the ballot is spent, the oldest minutes go). */
export function recordMeeting(day: number, outcomes: Outcome[]): void {
  const s = load();
  for (const o of outcomes) s.decided[o.id] = o.winner;
  s.minutes[day] = outcomes;
  s.settled = Math.max(s.settled, day);
  delete s.ballots[day];
  const days = Object.keys(s.minutes).map(Number).sort((a, b) => b - a);
  for (const old of days.slice(KEPT_MINUTES)) delete s.minutes[old];
  save();
}

/** The game day of the last meeting tallied (0: none yet). */
export function settledThrough(): number {
  return load().settled;
}

/** The game days of the ballots still waiting for their meeting's tally, oldest first. */
export function pendingBallotDays(): number[] {
  return Object.keys(load().ballots).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
}

/** Drops the ballot of `day` without a tally (its meeting can never sit): returns the votes its coins had bought. */
export function voidBallot(day: number): number {
  const s = load();
  const ballot = s.ballots[day];
  if (!ballot) return 0;
  delete s.ballots[day];
  save();
  return Object.values(ballot.bought).reduce<number>((sum, n) => sum + (n ?? 0), 0);
}

/** Hears every change (a ballot cast, a meeting's outcome); returns the unsubscribe. */
export function onCoproChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
