import type { BoxDimensions } from '@/catalog/types';

/** Physical constants of one bookcase; every bookcase in a Shelving shares them. */
export interface BookcaseSpec {
  width: number;
  depth: number;
  height: number;
  rows: number;
  boardThickness: number;
  /** Gap between neighbouring boxes on a row. */
  gap: number;
  /** Free air above the tallest box of a row. */
  headroom: number;
}

interface PlannedRow<T> {
  items: T[];
  /** Inner height the row must offer (tallest box + headroom). */
  minHeight: number;
}

export interface PlannedBookcase<T> {
  /** Top row first, like the boards are filled. */
  rows: PlannedRow<T>[];
  /** Board-to-board clearance per row, top first; sums (with boards) to `spec.height`. */
  rowHeights: number[];
}

export interface ShelvingPlan<T> {
  bookcases: PlannedBookcase<T>[];
  /** Items that did not fit in `maxBookcases`. */
  leftover: T[];
}

interface PlanInput<T> {
  items: readonly T[];
  dimensions(item: T): BoxDimensions;
  /** Items with different keys never share a row. */
  groupKey(item: T): string;
  spec: BookcaseSpec;
  maxBookcases: number;
  /** Bookcases to stand even with nothing to put in them (an empty collection still gets its shelves). Default 0. */
  minBookcases?: number;
}

/**
 * Flows items into rows of `innerWidth`, then rows into bookcases of `spec.rows` rows.
 * Each row is at least as tall as its tallest box; the spare height of a bookcase is
 * shared equally between its rows so every bookcase ends up the same height.
 */
export function planShelving<T>({ items, dimensions, groupKey, spec, maxBookcases, minBookcases = 0 }: PlanInput<T>): ShelvingPlan<T> {
  const innerWidth = spec.width - 2 * spec.boardThickness;
  const rows: PlannedRow<T>[] = [];

  let current: PlannedRow<T> | null = null;
  let cursor = 0;
  let currentKey = '';
  for (const item of items) {
    const { width, height } = dimensions(item);
    const key = groupKey(item);
    const overflow = cursor + width > innerWidth + 1e-6;
    if (!current || overflow || key !== currentKey) {
      current = { items: [], minHeight: 0 };
      rows.push(current);
      cursor = 0;
      currentKey = key;
    }
    current.items.push(item);
    current.minHeight = Math.max(current.minHeight, height + spec.headroom);
    cursor += width + spec.gap;
  }

  const usable = spec.height - (spec.rows + 1) * spec.boardThickness;
  const bookcases: PlannedBookcase<T>[] = [];
  const leftover: T[] = [];
  for (let i = 0; i < rows.length; i += spec.rows) {
    const chunk = rows.slice(i, i + spec.rows);
    if (bookcases.length >= maxBookcases) {
      for (const row of chunk) leftover.push(...row.items);
      continue;
    }
    bookcases.push({ rows: chunk, rowHeights: distributeHeights(chunk, spec.rows, usable) });
  }
  // Empty bookcases up to the minimum: equal rows, nothing on them.
  while (bookcases.length < Math.min(minBookcases, maxBookcases)) bookcases.push({ rows: [], rowHeights: distributeHeights([], spec.rows, usable) });
  return { bookcases, leftover };
}

/** Gives every row its minimum, then splits what is left equally. Empty rows mimic the tallest filled one. */
function distributeHeights<T>(rows: PlannedRow<T>[], rowCount: number, usable: number): number[] {
  const filler = rows.reduce((h, r) => Math.max(h, r.minHeight), 0) || usable / rowCount;
  const minima = Array.from({ length: rowCount }, (_, i) => rows[i]?.minHeight ?? filler);
  const required = minima.reduce((a, b) => a + b, 0);
  if (required >= usable) {
    // Taller boxes than the bookcase can hold: scale down and let the caller's headroom absorb it.
    return minima.map((m) => (m / required) * usable);
  }
  const extra = (usable - required) / rowCount;
  return minima.map((m) => m + extra);
}

interface ArrangedInput<T> {
  /** Everything this shelving may show, in the order the ones not arranged fill the gaps. */
  items: readonly T[];
  id(item: T): string;
  dimensions(item: T): BoxDimensions;
  /** The player's rows for this shelving: bookcase, row (top first), ids left to right. */
  arranged: readonly (readonly (readonly string[])[])[];
  /** Arranged on another shelving: left over here (for that one), never put in a gap. */
  elsewhere(id: string): boolean;
  spec: BookcaseSpec;
  maxBookcases: number;
  minBookcases?: number;
}

/**
 * The player's arrangement: every arranged box on its row in its order, as far as the row has room. An arranged box
 * whose row is gone (a taller box came: 4 rows now, not 5) or full goes to the nearest row of its own bookcase with
 * room (below it first), else like every box not arranged yet into the first gap wide enough, bookcase by bookcase,
 * top row first. Rows are all the same height, so any box can go on any row. What fits nowhere is left over.
 */
export function planArranged<T>({ items, id, dimensions, arranged, elsewhere, spec, maxBookcases, minBookcases = 0 }: ArrangedInput<T>): ShelvingPlan<T> {
  const innerWidth = spec.width - 2 * spec.boardThickness;
  const byId = new Map(items.map((item) => [id(item), item]));
  const used = new Set<T>();
  const rows: T[][][] = [];
  const widths: number[][] = [];
  const rowAt = (b: number, r: number): T[] => {
    while (rows.length <= b) {
      rows.push(Array.from({ length: spec.rows }, () => []));
      widths.push(Array.from({ length: spec.rows }, () => 0));
    }
    return rows[b]![r]!;
  };
  const fits = (b: number, r: number, item: T): boolean => {
    const row = rowAt(b, r);
    const width = widths[b]![r]! + (row.length ? spec.gap : 0) + dimensions(item).width;
    return width <= innerWidth + 1e-6;
  };
  const put = (b: number, r: number, item: T): void => {
    const row = rowAt(b, r);
    widths[b]![r]! += (row.length ? spec.gap : 0) + dimensions(item).width;
    row.push(item);
    used.add(item);
  };

  const pending: { item: T; bookcase: number; row: number }[] = [];
  arranged.forEach((bookcase, b) =>
    bookcase.forEach((row, r) => {
      for (const key of row) {
        const item = byId.get(key);
        if (!item || used.has(item)) continue;
        if (b < maxBookcases && r < spec.rows && fits(b, r, item)) put(b, r, item);
        else pending.push({ item, bookcase: b, row: r }); // the row is gone (fewer bookcases or rows now) or full
      }
    }),
  );
  // Kept in its own bookcase when it still stands: the nearest row with room, the one below first (row by row, in order).
  for (const { item, bookcase: b, row } of pending) {
    if (b >= maxBookcases) continue;
    const from = Math.min(row, spec.rows - 1);
    for (let d = 0; d < spec.rows * 2 && !used.has(item); d++) {
      const r = from + (d % 2 === 1 ? (d + 1) / 2 : -d / 2); // from, below, above, two below...
      if (r >= 0 && r < spec.rows && fits(b, r, item)) put(b, r, item);
    }
  }
  // Standing: the minimum, and every bookcase that holds an arranged box.
  let lastHolding = -1;
  rows.forEach((bookcase, b) => {
    if (bookcase.some((row) => row.length)) lastHolding = b;
  });
  let standing = Math.min(maxBookcases, Math.max(minBookcases, lastHolding + 1));
  const leftover: T[] = [];
  const wasArranged = new Set(pending.map((p) => p.item));
  const rest = [...pending.map((p) => p.item), ...items.filter((item) => !used.has(item) && !wasArranged.has(item))];
  for (const item of rest) {
    if (used.has(item)) continue;
    if (!wasArranged.has(item) && elsewhere(id(item))) {
      leftover.push(item);
      continue;
    }
    let placed = false;
    for (let b = 0; b < maxBookcases && !placed; b++) {
      for (let r = 0; r < spec.rows && !placed; r++) {
        if (!fits(b, r, item)) continue;
        put(b, r, item);
        standing = Math.max(standing, b + 1);
        placed = true;
      }
    }
    if (!placed) leftover.push(item);
  }

  const usable = spec.height - (spec.rows + 1) * spec.boardThickness;
  const rowHeights = Array.from({ length: spec.rows }, () => usable / spec.rows);
  const bookcases: PlannedBookcase<T>[] = [];
  for (let b = 0; b < standing; b++) {
    rowAt(b, 0);
    bookcases.push({
      rows: rows[b]!.map((items) => ({ items, minHeight: items.reduce((h, item) => Math.max(h, dimensions(item).height + spec.headroom), 0) })),
      rowHeights: [...rowHeights],
    });
  }
  return { bookcases, leftover };
}
