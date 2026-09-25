import type * as THREE from 'three';
import type { TravelChoice } from '@/ui/TravelMenu';
import type { ZoneId } from '../zoneIds';

/** A place a door can take the player to: a zone's arrival spot (world space) and the way to face. */
export interface TravelStop extends TravelChoice<ZoneId> {
  /** World-space floor position to stand on. */
  position: THREE.Vector3;
  /** Camera yaw on arrival (radians about +y; 0 looks down -z). */
  yaw: number;
  /** Other arrival spots by the zone the player comes from (the street: in front of the door they came out of). */
  from?: Readonly<Partial<Record<ZoneId, { position: THREE.Vector3; yaw: number }>>>;
}

export interface Traveller {
  /** Feet at `feet` (world floor height): the stairwell's lobby is far below the flat. */
  setPosition(x: number, z: number, feet?: number): void;
  setLook(yaw: number, pitch: number): void;
}

export interface Curtain {
  out(): Promise<void>;
  in(): Promise<void>;
}

export interface TravelOptions {
  stops: readonly TravelStop[];
  player: Traveller;
  curtain: Curtain;
  /** The zone the player is in. */
  here: () => ZoneId;
  /** Fetches the destination's builder module while the curtain falls (`World.load`: the zones reached by travel load on demand). */
  load?: (id: ZoneId) => Promise<void>;
  /** Behind the curtain, once the destination is loaded: compiles its shaders (`World.primeAsync`) so the view fades in without a hitch. */
  prepare?: () => Promise<void>;
}

/**
 * Teleports between the zones a door connects: the flat's hallway, the arcade, the market. Nothing
 * is walked; the view fades out, the player is set down at the destination's arrival spot facing
 * the room, the `ZoneManager` notices the new position and loads that zone, and the view fades in.
 * `here()` tells which zone the player is in, so the menu never offers where they already stand.
 * The destination's module (a zone built by a lazily loaded builder) is fetched while the curtain
 * falls, so the `ZoneManager` can build it on its next tick; should the fetch fail, the view comes
 * back where the player stood.
 */
export class Travel {
  private busy = false;
  private readonly stops: readonly TravelStop[];
  private readonly player: Traveller;
  private readonly curtain: Curtain;
  private readonly here: () => ZoneId;
  private readonly load: (id: ZoneId) => Promise<void>;
  private readonly prepare: () => Promise<void>;

  constructor(options: TravelOptions) {
    this.stops = options.stops;
    this.player = options.player;
    this.curtain = options.curtain;
    this.here = options.here;
    this.load = options.load ?? (async () => {});
    this.prepare = options.prepare ?? (async () => {});
  }

  /** Everywhere but here. */
  choices(): TravelChoice<ZoneId>[] {
    const current = this.here();
    return this.stops.filter((s) => s.id !== current).map(({ id, label }) => ({ id, label }));
  }

  get isTravelling(): boolean {
    return this.busy;
  }

  async go(id: ZoneId): Promise<void> {
    const stop = this.stops.find((s) => s.id === id);
    if (!stop || this.busy) return;
    this.busy = true;
    try {
      const spot = stop.from?.[this.here()] ?? stop;
      const loaded = this.load(stop.id).then(
        () => true,
        (error: unknown) => {
          console.error(`[travel] ${stop.id} failed to load`, error);
          return false;
        },
      );
      await this.curtain.out();
      if (!(await loaded)) {
        await this.curtain.in();
        return;
      }
      this.player.setPosition(spot.position.x, spot.position.z, spot.position.y);
      this.player.setLook(spot.yaw, 0);
      // Two frames, so the engine has ticked the ZoneManager at least once whatever the order of the
      // frame callbacks: it switches zones (and builds the destination). Then compile what is there
      // now, and one more frame to draw it.
      await nextFrame();
      await nextFrame();
      await this.prepare();
      await nextFrame();
      await this.curtain.in();
    } finally {
      this.busy = false;
    }
  }
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}
