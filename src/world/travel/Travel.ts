import type * as THREE from 'three';
import type { TravelChoice } from '@/ui/TravelMenu';
import type { ZoneId } from '../zoneIds';
import { duckScene } from '@/audio/audioContext';
import { inFlat, zonePlan } from '../worldPlan';
import { playDoorShut, playLatch, playShopBell } from './travelSounds';
import { takeArrival } from './nextArrival';
import { cardOf, placeWords, rememberPhoto, rememberTripTime } from './travelCards';

/** A place a door can take the player to: a zone's arrival spot (world space) and the way to face. */
export interface TravelStop extends TravelChoice<ZoneId> {
  /** World-space floor position to stand on. */
  position: THREE.Vector3;
  /** Camera yaw on arrival (radians about +y; 0 looks down -z). */
  yaw: number;
  /** Other arrival spots by the zone the player comes from (the street: in front of the door they came out of). */
  from?: Readonly<Partial<Record<ZoneId, { position: THREE.Vector3; yaw: number }>>>;
  /** Reached only through its own door (a neighbour's flat): never offered by the travel menu. */
  unlisted?: boolean;
}

interface Traveller {
  /** Feet at `feet` (world floor height): the stairwell's lobby is far below the flat. */
  setPosition(x: number, z: number, feet?: number): void;
  setLook(yaw: number, pitch: number): void;
  /** Held still from the moment the curtain starts to fall until it has lifted (no stepping on while it is dark). */
  movementEnabled: boolean;
}

/** The card the curtain shows of where a trip goes (`ui/Fader`): its name, where it is, its photo, how long it takes. */
export interface TravelCard {
  label: string;
  /** Where it is, a few words ("Front Street"), or none. */
  place?: string;
  /** A small photo of it as the player last left it (a JPEG data URL). */
  photo?: string;
  /** How long the last trip there took (ms): the card's bar is paced on it. */
  expectMs?: number;
}

interface Curtain {
  /** Covers the view, in `tint` (a CSS colour) if given. */
  out(ms?: number, tint?: string): Promise<void>;
  in(): Promise<void>;
  /** Shows where the trip goes (its card), only if the curtain is still down a moment later. */
  destination?(card: TravelCard): void;
  /** How far the trip is behind the curtain, 0..1 (the card's bar). */
  progress?(share: number): void;
}

interface TravelOptions {
  stops: readonly TravelStop[];
  player: Traveller;
  curtain: Curtain;
  /** The zone the player is in. */
  here: () => ZoneId;
  /** Fetches the destination's builder module while the curtain falls (`World.load`: the zones reached by travel load on demand). */
  load?: (id: ZoneId) => Promise<void>;
  /** Behind the curtain, once the destination is loaded: compiles its shaders (`World.primeAsync`) so the view fades in without a hitch. */
  prepare?: () => Promise<void>;
  /** The colour the curtain falls in on the way to `id` (its light: warm for a shop, the sky's for the street); black if none. */
  tint?: (id: ZoneId) => string | undefined;
  /**
   * Something played over the fallen curtain on the way from `from` to `to` (the bus ride to Mémé's and back:
   * `ui/busRide`), the destination building behind it; the curtain lifts once it has ended. Null: a plain trip.
   */
  interlude?: (from: ZoneId, to: ZoneId) => (() => Promise<void>) | null;
  /** The 3D view drawn now, grabbed on the way out for the card of the place left (`travelCards`); none: no photos. */
  snapshot?: () => HTMLCanvasElement | null;
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
  private readonly tint: (id: ZoneId) => string | undefined;
  private readonly interlude: NonNullable<TravelOptions['interlude']>;
  private readonly snapshot: () => HTMLCanvasElement | null;
  /** Called when a trip could not be made (the destination would not load): the player is told, back where they stood. */
  onFailed: (() => void) | null = null;
  /** Called once the curtain is down on the way out: what belonged where the player was goes (the words said there). */
  onDepart: (() => void) | null = null;

  constructor(options: TravelOptions) {
    this.stops = options.stops;
    this.player = options.player;
    this.curtain = options.curtain;
    this.here = options.here;
    this.load = options.load ?? (async () => {});
    this.prepare = options.prepare ?? (async () => {});
    this.tint = options.tint ?? (() => undefined);
    this.interlude = options.interlude ?? (() => null);
    this.snapshot = options.snapshot ?? (() => null);
  }

  /** Everywhere but here. */
  choices(): TravelChoice<ZoneId>[] {
    const current = this.here();
    // At home, "Home" is no destination (the pause menu's Go out lists the rest).
    return this.stops.filter((s) => s.id !== current && !s.unlisted && !(inFlat(current) && inFlat(s.id))).map(({ id, label }) => ({ id, label }));
  }

  /** `?debug`'s "Go to": every stop but the one the player is in, those only their own door reaches included. */
  everyStop(): TravelChoice<ZoneId>[] {
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
    const couldMove = this.player.movementEnabled;
    this.player.movementEnabled = false;
    try {
      // A door with a spot of its own on the other side (a neighbour's flat and back: `nextArrival`) wins.
      const spot = takeArrival(stop.id) ?? stop.from?.[this.here()] ?? stop;
      const loaded = this.load(stop.id).then(
        () => true,
        (error: unknown) => {
          console.error(`[travel] ${stop.id} failed to load`, error);
          return false;
        },
      );
      // The door: its latch (and a shop's bell) as the player goes through, the room's sound fading under the curtain.
      const from = this.here();
      const shopDoor = isShop(from) || isShop(stop.id);
      const interlude = this.interlude(from, stop.id);
      // The place being left, as it looks now: the photo on its card next time (the sas, sleeping: no trip, no photo).
      try {
        rememberPhoto(from, this.snapshot());
      } catch {
        // No frame to grab (a lost context): the card goes without.
      }
      const started = performance.now(); // convention-ok: a trip's measured time, not an animation
      const timings: string[] = [];
      const lap = (what: string, since: number): number => {
        const now = performance.now(); // convention-ok: the same measure
        timings.push(`${what} ${Math.round(now - since)} ms`);
        return now;
      };
      playLatch();
      if (shopDoor) playShopBell(0.09, 0.12);
      duckScene(0, CURTAIN_S);
      await this.curtain.out(undefined, this.tint(stop.id));
      this.onDepart?.();
      // A ride over the curtain (the bus to Mémé's) while the destination builds; else its name, should it take a while.
      const played = interlude?.() ?? null;
      const card = cardOf(stop.id);
      const place = placeWords(zonePlan(stop.id).kind);
      if (!played) this.curtain.destination?.({ label: stop.label, place: place === stop.label ? undefined : place, photo: card.photo, expectMs: card.ms });
      this.curtain.progress?.(0.1);
      let mark = lap('curtain', started);
      const ok = await loaded;
      mark = lap('load', mark);
      this.curtain.progress?.(0.45);
      if (!ok) {
        await played;
        duckScene(1, CURTAIN_S);
        await this.curtain.in();
        this.onFailed?.();
        return;
      }
      this.player.setPosition(spot.position.x, spot.position.z, spot.position.y);
      this.player.setLook(spot.yaw, 0);
      // Two frames, so the engine has ticked the ZoneManager at least once whatever the order of the
      // frame callbacks: it switches zones (and builds the destination). Then compile what is there
      // now, and one more frame to draw it.
      await nextFrame();
      await nextFrame();
      mark = lap('build', mark);
      this.curtain.progress?.(0.75);
      await this.prepare();
      await nextFrame();
      lap('prime', mark);
      this.curtain.progress?.(1);
      await played;
      const took = performance.now() - started; // convention-ok: the same measure
      if (!played) rememberTripTime(stop.id, took);
      // Where a slow trip spends its time: the module's fetch, the zone's build, the shaders' compile.
      console.info(`[travel] ${stop.id} in ${Math.round(took)} ms: ${timings.join(', ')}`);
      // The other side: the door shut behind the player (a shop's bell still bobbing), the new room's sound coming up.
      // Off a ride the bus's doors were the last thing heard.
      if (!played) playDoorShut(shopDoor ? 0.18 : 0.25);
      if (shopDoor) playShopBell(0.035);
      duckScene(1, CURTAIN_S * 1.5);
      await this.curtain.in();
    } catch (error) {
      duckScene(1, CURTAIN_S);
      throw error;
    } finally {
      this.player.movementEnabled = couldMove;
      this.busy = false;
    }
  }
}

/** About how long the curtain takes to fall (s): the room's sound fades as long. */
const CURTAIN_S = 0.35;

/** A zone entered by a shop's door (with a bell over it): the walk-in shops, the arcade, RETRO GAMES and its market. */
function isShop(id: ZoneId): boolean {
  const kind = zonePlan(id).kind;
  return kind === 'shop' || kind === 'arcade' || kind === 'market';
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}
