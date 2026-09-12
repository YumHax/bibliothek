import type * as THREE from 'three';
import type { Engine, Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import { CollisionWorld } from '@/core/Collider';
import { Zone, type ZoneBuilder, type ZoneHost, type ZoneSpec } from './zone/Zone';

export interface WorldEvents {
  /** Something clickable appeared after start-up (a box on rebuilt shelving, a zone that loaded). */
  onInteractableAdded?(item: Interactable): void;
  onInteractableRemoved?(item: Interactable): void;
}

/**
 * The whole 3D world: one scene, one collision world, one list of clickables, and the zones that
 * put content into them. Content itself is built per zone (`addZone` + a builder from `layout.ts`)
 * and streamed by the `ZoneManager`; the World only keeps the registries the engine-side objects
 * (player, interactor) read.
 */
export class World implements ZoneHost {
  readonly collisions = new CollisionWorld();
  /** Everything the crosshair can target right now. Live: see `events`. */
  readonly interactables: Interactable[] = [];
  readonly events: WorldEvents = {};
  readonly zones: Zone[] = [];

  constructor(private readonly engine: Engine) {}

  get scene(): THREE.Scene {
    return this.engine.scene;
  }

  /** Declares a zone; nothing is built until it is activated (or `build()` is called). */
  addZone(spec: ZoneSpec, build: ZoneBuilder): Zone {
    if (this.zones.some((z) => z.id === spec.id)) throw new Error(`[world] duplicate zone ${spec.id}`);
    const zone = new Zone(spec, this, build);
    this.zones.push(zone);
    return zone;
  }

  /** A declared zone by id. */
  zone(id: string): Zone {
    const zone = this.zones.find((z) => z.id === id);
    if (!zone) throw new Error(`[world] unknown zone ${id}`);
    return zone;
  }

  // --- ZoneHost -------------------------------------------------------------------------------------

  addUpdatable(u: Updatable): void {
    this.engine.addUpdatable(u);
  }

  removeUpdatable(u: Updatable): void {
    this.engine.removeUpdatable(u);
  }

  interactableAdded(item: Interactable): void {
    if (this.interactables.includes(item)) return;
    this.interactables.push(item);
    this.events.onInteractableAdded?.(item);
  }

  interactableRemoved(item: Interactable): void {
    const i = this.interactables.indexOf(item);
    if (i === -1) return;
    this.interactables.splice(i, 1);
    this.events.onInteractableRemoved?.(item);
  }
}
