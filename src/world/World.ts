import type * as THREE from 'three';
import type { Engine, Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import { CollisionWorld } from '@/core/Collider';
import { FIRST_ZONE_SHADOW_LAYER, Zone, type ZoneBuilder, type ZoneHost, type ZoneSpec } from './zone/Zone';

export interface WorldEvents {
  /** Something clickable appeared after start-up (a box on rebuilt shelving, a zone that loaded). */
  onInteractableAdded?(item: Interactable): void;
  onInteractableRemoved?(item: Interactable): void;
  /** A wall the crosshair ray must stop at came or went with its zone. */
  onOccluderAdded?(object: THREE.Object3D): void;
  onOccluderRemoved?(object: THREE.Object3D): void;
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
  /** Every wall the crosshair ray stops at right now. Live: see `events`. */
  readonly occluders: THREE.Object3D[] = [];
  readonly events: WorldEvents = {};
  readonly zones: Zone[] = [];

  constructor(private readonly engine: Engine) {}

  get scene(): THREE.Scene {
    return this.engine.scene;
  }

  /**
   * Builds every zone and renders the whole world once, up front: shader programs (main and
   * shadow passes) get compiled and textures uploaded now, at start-up, instead of the first time
   * the player looks through a doorway. Call it before the `ZoneManager` takes over: it leaves
   * every zone active, the manager then keeps only the current one and its neighbours.
   */
  prime(): void {
    for (const zone of this.zones) zone.activate();
    const { renderer, scene, camera } = this.engine;
    scene.traverse((obj) => {
      const material = (obj as Partial<THREE.Mesh>).material;
      for (const m of Array.isArray(material) ? material : material ? [material] : []) {
        const textured = m as THREE.MeshStandardMaterial;
        for (const texture of [textured.map, textured.emissiveMap, textured.normalMap, textured.roughnessMap]) if (texture) renderer.initTexture(texture);
      }
    });
    renderer.compile(scene, camera);
    renderer.render(scene, camera);
  }

  /** Declares a zone; nothing is built until it is activated (or `build()` is called). */
  addZone(spec: ZoneSpec, build: ZoneBuilder): Zone {
    if (this.zones.some((z) => z.id === spec.id)) throw new Error(`[world] duplicate zone ${spec.id}`);
    const zone = new Zone(spec, this, build, FIRST_ZONE_SHADOW_LAYER + this.zones.length);
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

  occluderAdded(object: THREE.Object3D): void {
    if (this.occluders.includes(object)) return;
    this.occluders.push(object);
    this.events.onOccluderAdded?.(object);
  }

  occluderRemoved(object: THREE.Object3D): void {
    const i = this.occluders.indexOf(object);
    if (i === -1) return;
    this.occluders.splice(i, 1);
    this.events.onOccluderRemoved?.(object);
  }
}
