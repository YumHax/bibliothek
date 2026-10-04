import type * as THREE from 'three';
import type { Zone } from '@/world/zone/Zone';
import { capitalise } from '@/text/strings';

/** The friends in the flat are looked for again this often (ms): a visit comes and goes, their walk is read live. */
const LOOK_EVERY = 1000;
/** A visiting friend's figure is named so (`world/visitors/Friend`): `Friend:<id>`. */
const PREFIX = 'Friend:';

/** A friend visiting: their figure (its world position read live) and what the caption calls them. */
interface FriendHere {
  readonly object: THREE.Object3D;
  readonly name: string;
  getWorldPosition(target: THREE.Vector3): THREE.Vector3;
}

/**
 * Who is visiting in `zones` (the flat's rooms), for the carrier: nothing is set down on a friend. The figures are
 * found by name (the visitors' own code stays theirs), looked for at most once a second while asked.
 */
export function friendsIn(zones: readonly Zone[]): { around(): FriendHere[] } {
  let found: FriendHere[] = [];
  let at = -Infinity;
  return {
    around(): FriendHere[] {
      const now = performance.now();
      if (now - at < LOOK_EVERY) return found;
      at = now;
      found = [];
      for (const zone of zones) {
        if (!zone.isActive) continue;
        zone.group.traverseVisible((object) => {
          if (!object.name.startsWith(PREFIX)) return;
          const id = object.name.slice(PREFIX.length);
          found.push({ object, name: id ? capitalise(id) : 'a friend', getWorldPosition: (target) => object.getWorldPosition(target) });
        });
      }
      return found;
    },
  };
}
