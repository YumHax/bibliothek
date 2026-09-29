import { KEYS, PersistedStore, safeStorage } from '@/persistence';

/** Where a piece was set down, in its zone's local frame: position (m) and yaw (radians). */
export interface SavedPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

/** Zone id -> piece key -> pose. The zone is kept so a piece may one day be carried to another room. */
type Saved = Record<string, Record<string, SavedPose>>;

/**
 * Where the player moved the flat's furniture (`Furnishings`): a pose per piece that is not where the plan put
 * it. Persisted; a piece with no entry stands where its plan says.
 */
export class FurnitureLayout {
  private state: Saved;
  private readonly store: PersistedStore<Saved>;

  constructor(storage: Storage | null = safeStorage(), key: string = KEYS.furniture) {
    this.store = new PersistedStore<Saved>({ key, version: 1, storage, defaults: () => ({}), read: readSaved });
    this.state = this.store.load();
  }

  get(zone: string, key: string): SavedPose | null {
    return this.state[zone]?.[key] ?? null;
  }

  set(zone: string, key: string, pose: SavedPose): void {
    this.state = { ...this.state, [zone]: { ...this.state[zone], [key]: { ...pose } } };
    this.store.save(this.state);
  }
}

function readSaved(data: unknown): Saved | null {
  if (typeof data !== 'object' || data === null) return null;
  const saved: Saved = {};
  for (const [zone, pieces] of Object.entries(data)) {
    if (typeof pieces !== 'object' || pieces === null) continue;
    const clean: Record<string, SavedPose> = {};
    for (const [key, pose] of Object.entries(pieces as Record<string, unknown>)) {
      const p = pose as Partial<SavedPose> | null;
      if (p && [p.x, p.y, p.z, p.yaw].every((n) => typeof n === 'number' && Number.isFinite(n))) clean[key] = { x: p.x!, y: p.y!, z: p.z!, yaw: p.yaw! };
    }
    saved[zone] = clean;
  }
  return saved;
}
