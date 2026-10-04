import * as THREE from 'three';
import { Gatherings, type GatheringsOptions } from './Gatherings';

/**
 * Lets people come round in numbers (docs/visitors.md "Gatherings"): places the director in the collection room's
 * zone, beside the visitors' (whose `host` it borrows: the round, the bodies, the door). Call it from
 * `bootstrap/world` once the visitors exist; its `book` is made once in `bootstrap/services`.
 */
export function furnishGatherings(options: GatheringsOptions): Gatherings {
  return options.host.options.living.place(new Gatherings(options), new THREE.Vector3());
}
