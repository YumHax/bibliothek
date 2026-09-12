import type * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Zone } from './Zone';

export interface ZoneManagerOptions {
  /** Zone the player starts in; activated in the constructor. */
  start: string;
  /** Metres the player may step outside the current zone's bounds before it stops being current (doorway thresholds). Default 0.4. */
  hysteresis?: number;
  /** Seconds a non-persistent zone stays dormant before its memory is freed. Default 30. */
  unloadAfterSeconds?: number;
}

export interface ZoneManagerEvents {
  onZoneChange?(zone: Zone, previous: Zone): void;
}

/**
 * Streams the world around the player: the zone the player stands in and its `neighbours` are
 * active; every other zone is deactivated (out of the scene, not ticked, not collidable) and, unless
 * persistent, unloaded after a while so its memory comes back. Checks a few boxes per frame; cheap.
 */
export class ZoneManager implements Updatable {
  readonly events: ZoneManagerEvents = {};
  private _current: Zone;
  private readonly hysteresis: number;
  private readonly unloadAfter: number;
  private readonly dormantFor = new Map<Zone, number>();

  constructor(
    private readonly zones: readonly Zone[],
    /** Whose position decides the current zone (the camera). */
    private readonly player: { readonly position: THREE.Vector3 },
    options: ZoneManagerOptions,
  ) {
    const start = zones.find((z) => z.id === options.start);
    if (!start) throw new Error(`[zones] unknown start zone ${options.start}`);
    this.hysteresis = options.hysteresis ?? 0.4;
    this.unloadAfter = options.unloadAfterSeconds ?? 30;
    this._current = start;
    this.apply();
  }

  /** The zone the player is in. */
  get current(): Zone {
    return this._current;
  }

  zone(id: string): Zone | undefined {
    return this.zones.find((z) => z.id === id);
  }

  update(dt: number): void {
    const p = this.player.position;
    if (!this._current.contains(p, this.hysteresis)) {
      // Prefer a neighbour (the player walked through a doorway), else anyone containing the point.
      const next = this.neighboursOf(this._current).find((z) => z.contains(p)) ?? this.zones.find((z) => z.contains(p));
      if (next && next !== this._current) {
        const previous = this._current;
        this._current = next;
        this.apply();
        this.events.onZoneChange?.(next, previous);
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

  private neighboursOf(zone: Zone): Zone[] {
    return zone.spec.neighbours.map((id) => this.zone(id)).filter((z): z is Zone => !!z);
  }

  /** Makes the active set = current + neighbours, and nothing else. */
  private apply(): void {
    const wanted = new Set([this._current, ...this.neighboursOf(this._current)]);
    for (const zone of this.zones) {
      if (wanted.has(zone)) {
        zone.activate();
        this.dormantFor.delete(zone);
      } else zone.deactivate();
    }
  }
}
