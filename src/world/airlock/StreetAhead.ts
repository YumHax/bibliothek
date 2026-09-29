import type * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { STAIRWELL_PLAN, STOREY, landingY } from '../stairwell/stairwellPlan';
import { TWINS } from './airlockPlan';

export interface StreetAheadOptions {
  /** The player's eye (world). */
  viewer: THREE.Object3D;
  /** The zone the player is in. */
  here: () => string;
  /** Whether the street's zone is built yet (built: dormant or active). */
  built: (id: string) => boolean;
  /** Builds and compiles a zone out of the scene (`World.prepareZone`). */
  prepare: (id: string) => Promise<void>;
  /** Keeps it loaded while dormant, or lets it go (`ZoneManager.hold`). */
  hold: (id: string, held: boolean) => void;
}

/** How often the player's whereabouts are checked (s): nothing here needs a frame's precision. */
const CHECK_S = 0.5;
/**
 * The eye below this (world y): the player on the way down, past our landing's first flight (on foot, or riding the
 * lift, whose trip to the hall takes a few seconds): the building starts then, at an idle moment, long before the sas.
 */
const LOW = STAIRWELL_PLAN.origin[1] + landingY(0) - STOREY / 2 + 1.7;
/** The street's twin: the zone the hall's sas crosses into. */
const STREET = TWINS.street.zone;

/**
 * Gets the street ready before the sas is crossed: its first crossing of a visit built the whole street while the
 * buzzer sounded, a freeze of a second or more in the shut box. Once the player is on the way down (`LOW`), the street is built dormant and compiled out of the scene (`World.prepareZone`), at the browser's next
 * idle moment, and held loaded (`ZoneManager.hold`) while they stay down there; climbing back up or going through
 * lets it go (the street then unloads after the usual wait, or is the current zone). The crossing then only switches.
 */
export class StreetAhead implements Updatable {
  private clock = 0;
  private preparing = false;
  private holding = false;
  /** The street failed to get ready once: not tried again (the crossing builds it then, as before), no log every check. */
  private failed = false;

  constructor(private readonly options: StreetAheadOptions) {}

  update(dt: number): void {
    this.clock -= dt;
    if (this.clock > 0) return;
    this.clock = CHECK_S;
    const { viewer, here, built, prepare, hold } = this.options;
    const low = here() === 'stairwell' && viewer.position.y < LOW;
    if (low !== this.holding) {
      this.holding = low;
      hold(STREET, low);
    }
    if (!low || this.preparing || this.failed || built(STREET)) return;
    this.preparing = true;
    idle(() => {
      prepare(STREET)
        .catch((error: unknown) => {
          this.failed = true;
          console.error('[airlock] the street failed to get ready (the sas will build it)', error);
        })
        .finally(() => (this.preparing = false));
    });
  }
}

function idle(run: () => void): void {
  if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 1500 });
  else setTimeout(run, 200);
}
