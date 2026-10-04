/*
 * The notes pinned on the entrance hall's noticeboard. Each building feature (the co-ownership
 * meeting, the estate sale, Mrs Roux's move, the neighbours' party, a power cut, the treasure hunt's
 * clues) registers a source once; the board asks every source for today's notes when it repaints
 * (a new game day, or `refresh`). A leaf module: no imports from the world, so any feature can pin.
 */

/** A note on the board: its headline, a few short lines, the paper's colour, who signed it. */
export interface BoardNote {
  /** Stable id, so the board keeps its place on the cork from one repaint to the next. */
  id: string;
  title: string;
  lines: string[];
  /** The paper's colour (0xrrggbb); white by default. */
  paper?: number;
  signed?: string;
  /** Larger first: the syndic's official notices go over a lost cat. Default 0. */
  weight?: number;
  /** The board was read with this note on it (the treasure hunt's card counts as found then). */
  onRead?: () => void;
}

/** What a feature pins: today's notes for game day `day` (none: an empty list). */
type BoardSource = (day: number) => BoardNote[];

const sources = new Map<string, BoardSource>();
const listeners = new Set<() => void>();

/** Registers (or replaces) the source called `name`; returns the unregister. */
export function pinSource(name: string, source: BoardSource): () => void {
  sources.set(name, source);
  refreshBoard();
  return () => {
    if (sources.get(name) === source) sources.delete(name);
    refreshBoard();
  };
}

/** Every note on the board on game day `day`, heaviest first. */
export function notesOn(day: number): BoardNote[] {
  const notes: BoardNote[] = [];
  for (const source of sources.values()) notes.push(...source(day));
  return notes.sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0) || a.id.localeCompare(b.id));
}

/** A source's notes changed outside a new day (a vote cast, a clue found): the board repaints. */
export function refreshBoard(): void {
  for (const cb of listeners) cb();
}

/** The board itself listens; returns the unsubscribe. */
export function onBoardChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
