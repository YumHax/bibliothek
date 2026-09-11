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

export interface PlannedRow<T> {
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

export interface PlanInput<T> {
  items: readonly T[];
  dimensions(item: T): BoxDimensions;
  /** Items with different keys never share a row. */
  groupKey(item: T): string;
  spec: BookcaseSpec;
  maxBookcases: number;
}

/**
 * Flows items into rows of `innerWidth`, then rows into bookcases of `spec.rows` rows.
 * Each row is at least as tall as its tallest box; the spare height of a bookcase is
 * shared equally between its rows so every bookcase ends up the same height.
 */
export function planShelving<T>({ items, dimensions, groupKey, spec, maxBookcases }: PlanInput<T>): ShelvingPlan<T> {
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
