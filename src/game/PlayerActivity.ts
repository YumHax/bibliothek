import type { ZoneId } from '@/world/zoneIds';
import { inFlat } from '@/world/worldPlan';

/** What the activity reads, each on use (the zone manager and the moves are made after it). */
interface ActivitySources {
  /** The zone the player stands in. */
  zone(): ZoneId;
  /** A trip behind the curtain is under way. */
  travelling(): boolean;
  /** A night in the bed. */
  asleep(): boolean;
  /** A household beat told in a fade (cleaning, baking, a soak: `household/pastime.ts`). */
  pastime(): boolean;
  /** The sas is being crossed (no curtain, the player carried: `world/airlock`). */
  crossing(): boolean;
}

/**
 * Where the player is and whether they are free, asked the same way by everyone: the visitors (a friend rings only
 * when the player is home and free), the shops' closing time, the keys (a night or a household beat is deaf), the
 * footsteps and the position memory (nothing moves or is saved while carried), the label maker and the furniture
 * carrier (at home means the flat, not the stairwell). One definition each, so the rules cannot drift apart.
 */
export class PlayerActivity {
  constructor(private readonly sources: ActivitySources) {}

  /** The zone the player stands in. */
  get zoneId(): ZoneId {
    return this.sources.zone();
  }

  /** In the flat or its stairwell. */
  get inFlat(): boolean {
    return inFlat(this.zoneId);
  }

  /** In the flat's rooms: the stairwell is the building's, not home. */
  get atHome(): boolean {
    const id = this.zoneId;
    return inFlat(id) && id !== 'stairwell';
  }

  /** Dark to the player: a night, or a household beat told in a fade. The keys wait for both. */
  get isAsleep(): boolean {
    return this.sources.asleep() || this.sources.pastime();
  }

  /** Away or dark: a trip behind the curtain, a night, a household beat. Nobody rings, nothing shuts them out. */
  get busy(): boolean {
    return this.sources.travelling() || this.isAsleep;
  }

  /** Busy, or carried through the sas: the feet are not theirs, so nothing is saved or heard of them. */
  get held(): boolean {
    return this.busy || this.sources.crossing();
  }
}
