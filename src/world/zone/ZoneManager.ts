import type * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { Listeners } from '@/core/Listeners';
import type { Zone } from './Zone';

export interface ZoneManagerOptions<Id extends string = string> {
  /** Zone the player starts in; activated in the constructor. */
  start: Id;
  /** Metres the player may step outside the current zone's bounds before it stops being current (doorway thresholds). Default 0.4. */
  hysteresis?: number;
  /** Seconds a non-persistent zone stays dormant before its memory is freed. Default 30. */
  unloadAfterSeconds?: number;
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
  /** Modules asked for, once each (a failed fetch is reported, not retried every frame). */
  private readonly requested = new Set<Zone<Id>>();

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
    for (const zone of this.zones) {
      if (zone.status !== 'dormant' || zone.spec.persistent) continue;
      const t = (this.dormantFor.get(zone) ?? 0) + dt;
      if (t >= this.unloadAfter) {
        zone.unload();
        this.dormantFor.delete(zone);
      } else this.dormantFor.set(zone, t);
    }
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
      } else zone.deactivate();
    }
  }
}
