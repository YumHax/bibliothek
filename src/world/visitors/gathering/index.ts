import * as THREE from 'three';
import { Gatherings, type GatheringsOptions } from './Gatherings';
import { GatheringBook } from './GatheringBook';

export { Gatherings, type GatheringsOptions, type PhoneEventRow } from './Gatherings';
export { GatheringBook } from './GatheringBook';
export { GATHERING_RULES } from './gatheringPlan';

/**
 * Lets people come round in numbers (docs/visitors.md "Gatherings"): places the director in the collection room's
 * zone, beside the visitors' (whose `host` it borrows: the round, the bodies, the door). Call it from
 * `bootstrap/world` once the visitors exist.
 */
export function furnishGatherings(options: Omit<GatheringsOptions, 'book'> & { book?: GatheringBook }): Gatherings {
  const book = options.book ?? new GatheringBook();
  return options.host.options.living.place(new Gatherings({ ...options, book }), new THREE.Vector3());
}
