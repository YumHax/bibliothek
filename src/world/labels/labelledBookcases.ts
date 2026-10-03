import type { ShelvingOptions } from '../shelving/Shelving';
import type { ShelfLabels } from './ShelfLabels';

/**
 * A shelving's `onBookcase` that also sticks the labels saved for shelving `id` on each bookcase it puts up (and takes
 * them off it when it comes down), after whatever `base` does (making it movable). `base` as it is without labels.
 */
export function labelledBookcases(base: Pick<ShelvingOptions, 'onBookcase'>, labels: ShelfLabels | undefined, id: string): Pick<ShelvingOptions, 'onBookcase'> {
  if (!labels) return base;
  const movable = base.onBookcase;
  return {
    onBookcase: (shelf, index) => {
      const unmove = movable?.(shelf, index);
      const unlabel = labels.attach(id, index, shelf);
      return () => {
        unlabel();
        unmove?.();
      };
    },
  };
}
