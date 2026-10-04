import type * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { Listeners } from '@/core/Listeners';
import type { Zone } from './Zone';

interface ZoneManagerOptions<Id extends string = string> {
  /** Zone the player starts in; activated in the constructor. */
  start: Id;
  /** Metres the player may step outside the current zone's bounds before it stops being current (doorway thresholds). Default 0.4. */
  hysteresis?: number;
  /** Seconds a non-persistent zone stays dormant before its memory is freed. Default 30. */
  unloadAfterSeconds?: number;
  /**
   * How many of the travel zones (lazy builders: the street, the arcade, the market) left most
   * recently stay dormant however long the player is away (built, uploaded, compiled: going back is
   * instant, no rebuild, no repaint). Older ones, and every other zone, unload after
   * `unloadAfterSeconds`. Default 2: the street and the shop last visited.
   */
  keepRecent?: number;
}

/**
 * Streams the world around the player: the zone the player stands in and its `neighbours` are
 * active; every other zone is deactivated (out of the scene, not ticked, not collidable) and, unless
 * persistent, unloaded after a while so its memory comes back. Checks a few boxes per frame; cheap.
 * A zone whose builder's module is not loaded yet (`Zone.load`, the zones reached by travel) is
 * fetched first: the player's zone stays current meanwhile, and the switch happens once it is there.
 */
export class ZoneManager<Id extends string = string> implements Updatable {
  private readonly zoneChange = new Listeners<[zone: Zone<Id>, previous: Zone<Id>]>();
  private _current: Zone<Id>;
  private readonly hysteresis: number;
  private readonly unloadAfter: number;
  private readonly dormantFor = new Map<Zone<Id>, number>();
  private readonly keepRecent: number;
  /** Travel zones in the order the player last had them active, most recent last. */
  private readonly recency: Zone<Id>[] = [];
  /** The dormant travel zones kept loaded (the `keepRecent` most recent), refilled in place (no garbage per frame). */
  private readonly kept = new Set<Zone<Id>>();
  /** Modules asked for, once each (a failed fetch is reported, not retried every frame). */
  private readonly requested = new Set<Zone<Id>>();
  /** Dormant zones kept loaded however long, while something needs them ready (`hold`). */
  private readonly held = new Set<Zone<Id>>();

  constructor(
    private readonly zones: readonly Zone<Id>[],
    /** Whose position decides the current zone (the camera). */
    private readonly player: { readonly position: THREE.Vector3 },
    options: ZoneManagerOptions<Id>,
  ) {
    const start = zones.find((z) => z.id === options.start);
    if (!start) throw new Error(`[zones] unknown start zone ${options.start}`);
    this.hysteresis = options.hysteresis ?? 0.4;
    this.unloadAfter = options.unloadAfterSeconds ?? 30;
    this.keepRecent = options.keepRecent ?? 2;
    this._current = start;
    this.apply();
  }

  /** The zone the player is in. */
  get current(): Zone<Id> {
    return this._current;
  }

  zone(id: string): Zone<Id> | undefined {
    return this.zones.find((z) => z.id === id);
  }

  /** Calls `listener(zone, previous)` whenever the player's zone changes; returns the unsubscribe. */
  onZoneChange(listener: (zone: Zone<Id>, previous: Zone<Id>) => void): () => void {
    return this.zoneChange.add(listener);
  }

  update(dt: number): void {
    const p = this.player.position;
    if (!this._current.contains(p, this.hysteresis)) {
      // Prefer a neighbour (the player walked through a doorway), else anyone containing the point.
      const next = this.neighboursOf(this._current).find((z) => z.contains(p)) ?? this.zones.find((z) => z.contains(p));
      if (next && next !== this._current && this.ready(next)) {
        const previous = this._current;
        this._current = next;
        this.apply();
        this.zoneChange.emit(next, previous);
      }
    }
    // Most frames nothing is waiting to unload: no allocation then.
    if (!this.zones.some((z) => z.status === 'dormant' && !z.spec.persistent)) return;
    this.refreshKept();
    for (const zone of this.zones) {
      if (zone.status !== 'dormant' || zone.spec.persistent || this.kept.has(zone) || this.held.has(zone)) continue;
      const t = (this.dormantFor.get(zone) ?? 0) + dt;
      if (t >= this.unloadAfter) {
        zone.unload();
        this.dormantFor.delete(zone);
      } else this.dormantFor.set(zone, t);
    }
  }

  /**
   * Keeps zone `id` loaded while dormant (`held`), whatever `unloadAfterSeconds` says: the street, built ahead while
   * the player is down in the entrance hall so the sas crosses into it at once (`airlock/StreetAhead`). Released, it
   * unloads after the usual wait.
   */
  hold(id: string, held: boolean): void {
    const zone = this.zone(id);
    if (!zone) return;
    if (held) this.held.add(zone);
    else if (this.held.delete(zone)) this.dormantFor.delete(zone);
  }

  /** The `keepRecent` travel zones left most recently that are dormant now. */
  private refreshKept(): void {
    this.kept.clear();
    for (let i = this.recency.length - 1; i >= 0 && this.kept.size < this.keepRecent; i--) {
      const zone = this.recency[i]!;
      if (zone.status === 'dormant') this.kept.add(zone);
    }
  }

  /** `zone` was just active: the most recent. */
  private touch(zone: Zone<Id>): void {
    const i = this.recency.indexOf(zone);
    if (i !== -1) this.recency.splice(i, 1);
    this.recency.push(zone);
  }

  private neighboursOf(zone: Zone<Id>): Zone<Id>[] {
    return zone.spec.neighbours.map((id) => this.zone(id)).filter((z): z is Zone<Id> => !!z);
  }

  /** True when `zone` can be built now; otherwise asks for its module (once) and says no. */
  private ready(zone: Zone<Id>): boolean {
    if (zone.isLoaded) return true;
    if (!this.requested.has(zone)) {
      this.requested.add(zone);
      zone.load().then(
        () => this.apply(),
        (error: unknown) => console.error(`[zones] ${zone.id} failed to load`, error),
      );
    }
    return false;
  }

  /** Makes the active set = current + neighbours, and nothing else (a neighbour still loading joins once it is there). */
  private apply(): void {
    const wanted = new Set([this._current, ...this.neighboursOf(this._current)]);
    for (const zone of this.zones) {
      if (wanted.has(zone)) {
        if (!this.ready(zone)) continue;
        zone.activate();
        this.dormantFor.delete(zone);
        if (zone.isLazy && !zone.spec.persistent) this.touch(zone);
      } else zone.deactivate();
    }
  }
}
