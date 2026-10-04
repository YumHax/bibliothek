import type * as THREE from 'three';

/*
 * The building's mains: on, or cut (a storm's power cut, `building/blackout`). A leaf module (no
 * imports from the world), so a lamp, a television or the lift can ask whether it has power where
 * it stands. Only what stands on the building's circuit goes dark: the zones named by
 * `setBuildingCircuit` (the flat, the stairwell, the cellars...); the street's shops keep theirs.
 */

let on = true;
const listeners = new Set<(on: boolean) => void>();
let circuit: ReadonlySet<string> = new Set();
/** Each object's answer, found once (its zone does not change but by a move inside the flat, all on the circuit). */
const onCircuitCache = new WeakMap<THREE.Object3D, boolean>();

/** Whether the building has power. */
export function mainsOn(): boolean {
  return on;
}

/** Cuts or restores the power; tells every listener when it changes. */
export function setMains(next: boolean): void {
  if (next === on) return;
  on = next;
  for (const cb of listeners) cb(on);
}

/** Hears every cut and every return of the power; returns the unsubscribe. */
export function onMains(cb: (on: boolean) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** The zones (by id) the building's mains feed: wired once at boot. */
export function setBuildingCircuit(zoneIds: readonly string[]): void {
  circuit = new Set(zoneIds);
}

/** Whether zone `id` is on the building's circuit. */
export function zoneOnCircuit(id: string): boolean {
  return circuit.has(id);
}

/** Whether `object` stands in a zone on the building's circuit (its zone group is named `Zone:<id>`). */
function onBuildingCircuit(object: THREE.Object3D): boolean {
  const known = onCircuitCache.get(object);
  if (known !== undefined) return known;
  let found: boolean | null = null;
  for (let o: THREE.Object3D | null = object; o && found === null; o = o.parent) {
    if (o.name.startsWith('Zone:')) found = circuit.has(o.name.slice(5));
  }
  // Not placed yet: not cached, asked again next time.
  if (found === null) return false;
  onCircuitCache.set(object, found);
  return found;
}

/** Whether `object` has power where it stands: always off the building's circuit, else while the mains are on. */
export function poweredAt(object: THREE.Object3D): boolean {
  return on || !onBuildingCircuit(object);
}
