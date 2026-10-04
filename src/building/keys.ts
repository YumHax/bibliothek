import { KEYS, PersistedStore } from '@/persistence';

/*
 * The building's keys the player holds besides the flat's (those are `hallway/HouseKeys`): the
 * cellar's, which the concierge hands over (`stairwell/Concierge`), and any other a feature adds.
 * One store for the whole page, made on first use; the cellar's door asks `hasKey('cellar')`.
 */

/** Every key of the building that can be given. */
type BuildingKey = 'cellar' | 'roof' | 'lodge';

const ALL: readonly BuildingKey[] = ['cellar', 'roof', 'lodge'];

let store: PersistedStore<BuildingKey[]> | null = null;
let held: Set<BuildingKey> | null = null;

function keys(): Set<BuildingKey> {
  if (held) return held;
  store = new PersistedStore<BuildingKey[]>({
    key: KEYS.buildingKeys,
    version: 1,
    defaults: () => [],
    read: (data) => (Array.isArray(data) ? data.filter((k): k is BuildingKey => ALL.includes(k as BuildingKey)) : null),
  });
  held = new Set(store.load());
  return held;
}

/** Whether the player holds `key`. */
export function hasKey(key: BuildingKey): boolean {
  return keys().has(key);
}

/** Hands `key` to the player (once; saved). Returns false if they had it already. */
export function giveKey(key: BuildingKey): boolean {
  const set = keys();
  if (set.has(key)) return false;
  set.add(key);
  store!.save([...set]);
  return true;
}
