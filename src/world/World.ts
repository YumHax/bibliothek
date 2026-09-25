import * as THREE from 'three';
import type { Engine, Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import { CollisionWorld } from '@/core/Collider';
import { Listeners } from '@/core/Listeners';
import { FIRST_ZONE_SHADOW_LAYER, Zone, type LazyZoneBuilder, type ZoneBuilder, type ZoneHost, type ZoneSpec } from './zone/Zone';

/** How long `primeAsync` waits at most for the driver to finish compiling (ms). */
const PRIME_WAIT_MS = 3000;
/** Texture units a lit material may take besides the shadow maps (map, bump, roughness, env, area-light tables). */
const MATERIAL_UNITS = 6;

function materialsOf(obj: THREE.Object3D): THREE.Material[] {
  const material = (obj as Partial<THREE.Mesh>).material;
  return Array.isArray(material) ? material : material ? [material] : [];
}

/** The zone ids of a handle map. */
type IdOf<Handles> = Extract<keyof Handles, string>;

/**
 * The whole 3D world: one scene, one collision world, one list of clickables, and the zones that
 * put content into them. Content itself is built per zone (`addZone` + a builder from `layout.ts`)
 * and streamed by the `ZoneManager`; the World only keeps the registries the engine-side objects
 * (player, interactor) read. `Handles` maps each zone id to what its builder returns
 * (`ZoneHandleById`), so `zone(id)` only takes a declared id and `handle(id)` is typed.
 */
export class World<Handles extends object = Record<string, unknown>> implements ZoneHost {
  readonly collisions = new CollisionWorld();
  /** Everything the crosshair can target right now (a set: a trip (de)activates the whole flat at once). Live: see `onInteractableAdded`. */
  readonly interactables = new Set<Interactable>();
  /** Every wall the crosshair ray stops at right now. Live: see `onOccluderAdded`. */
  readonly occluders: THREE.Object3D[] = [];
  private readonly occluderSet = new Set<THREE.Object3D>();
  readonly zones: Zone<IdOf<Handles>>[] = [];
  private readonly interactableAddedListeners = new Listeners<[item: Interactable]>();
  private readonly interactableRemovedListeners = new Listeners<[item: Interactable]>();
  private readonly occluderAddedListeners = new Listeners<[object: THREE.Object3D]>();
  private readonly occluderRemovedListeners = new Listeners<[object: THREE.Object3D]>();
  private reported = false;

  constructor(private readonly engine: Engine) {}

  get scene(): THREE.Scene {
    return this.engine.scene;
  }

  /** Something clickable appeared after start-up (a box on rebuilt shelving, a zone that loaded); returns the unsubscribe. */
  onInteractableAdded(listener: (item: Interactable) => void): () => void {
    return this.interactableAddedListeners.add(listener);
  }

  onInteractableRemoved(listener: (item: Interactable) => void): () => void {
    return this.interactableRemovedListeners.add(listener);
  }

  /** A wall the crosshair ray must stop at came with its zone; returns the unsubscribe. */
  onOccluderAdded(listener: (object: THREE.Object3D) => void): () => void {
    return this.occluderAddedListeners.add(listener);
  }

  onOccluderRemoved(listener: (object: THREE.Object3D) => void): () => void {
    return this.occluderRemovedListeners.add(listener);
  }

  /**
   * Compiles and uploads everything the active zones hold, up front: shader programs (every
   * material, in view or not) get compiled and textures uploaded now, at start-up, instead of the
   * first time the player looks through a doorway. Call it once the `ZoneManager` has activated
   * the start zone and its neighbours: programs depend on the scene's light count, so what is
   * compiled must be the lights the loop will render with (zones out of the flat, reached by
   * teleport, compile behind the fade).
   */
  prime(): void {
    this.uploadTextures();
    this.engine.compileScene();
    // One real frame: the shadow passes and the post-processing passes compile too.
    this.engine.renderFrame();
    this.reportShadowSamplers();
  }

  /**
   * `prime()` for a zone reached by travel, behind the curtain once the `ZoneManager` has switched:
   * the programs are handed to the driver, then awaited frame by frame while it compiles them in
   * the background (`KHR_parallel_shader_compile`; at most `PRIME_WAIT_MS`), so the one real frame
   * at the end does not stall on them and the view fades in on a scene that is ready.
   */
  async primeAsync(): Promise<void> {
    this.uploadTextures();
    this.engine.compileScene();
    await this.whenCompiled(this.engine.scene);
    this.engine.renderFrame();
  }

  /**
   * Gets zone `id` and its neighbours ready to be walked into with no curtain to hide a hitch (the
   * airlock onto the street, `world/airlock`): builds what is not built yet, then compiles the
   * dormant ones in a stand-in scene holding their groups, so each program is the one for their own
   * lights (what the scene holds once the `ZoneManager` has switched over), with the scene's fog and
   * environment; uploads their textures and waits for the driver (at most `PRIME_WAIT_MS`). The
   * groups leave the stand-in afterwards. Programs stay cached per material, so the lights changing
   * back on the way home compile nothing. Meant for a set that is all dormant (an active zone's
   * lights are not in the stand-in).
   */
  async prepareZone(id: string): Promise<void> {
    const target = this.find(id);
    const set = [target, ...target.spec.neighbours.map((other) => this.find(other))];
    await Promise.all(set.map((zone) => zone.load()));
    for (const zone of set) zone.build();
    const dormant = set.filter((zone) => !zone.isActive);
    if (!dormant.length) return;
    const { scene } = this.engine;
    const standIn = new THREE.Scene();
    standIn.fog = scene.fog;
    standIn.environment = scene.environment;
    for (const zone of dormant) standIn.add(zone.group);
    standIn.updateMatrixWorld(true);
    try {
      this.uploadTextures(standIn);
      this.engine.compileScene(standIn);
      await this.whenCompiled(standIn);
    } finally {
      // A zone the ZoneManager activated meanwhile has moved on into the scene: leave it there.
      for (const zone of dormant) if (zone.group.parent === standIn) standIn.remove(zone.group);
    }
  }

  /** Waits frame by frame (at most `PRIME_WAIT_MS`) until the driver has linked every program `root`'s materials use. */
  private async whenCompiled(root: THREE.Object3D): Promise<void> {
    const { renderer } = this.engine;
    const pending = new Set<THREE.Material>();
    root.traverse((obj) => {
      for (const m of materialsOf(obj)) pending.add(m);
    });
    const ready = (m: THREE.Material): boolean => {
      const program = (renderer.properties.get(m) as { currentProgram?: { isReady(): boolean } }).currentProgram;
      return !program || program.isReady();
    };
    const deadline = performance.now() + PRIME_WAIT_MS;
    while (performance.now() < deadline) {
      for (const m of pending) if (ready(m)) pending.delete(m);
      if (!pending.size) break;
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }

  /** Uploads every texture `root`'s materials hold (render targets aside: their owner draws them). */
  private uploadTextures(root: THREE.Object3D = this.engine.scene): void {
    const { renderer } = this.engine;
    root.traverse((obj) => {
      for (const m of materialsOf(obj)) {
        for (const value of Object.values(m)) {
          const texture = value as THREE.Texture | null;
          if (texture?.isTexture && !texture.isRenderTargetTexture) renderer.initTexture(texture);
        }
      }
    });
  }

  /**
   * Once: how many shadow maps every lit shader samples (one per shadow-casting light in the scene)
   * against the GPU's texture units per shader, which the material's own maps share. Past it, programs fail to link.
   */
  private reportShadowSamplers(): void {
    if (this.reported) return;
    this.reported = true;
    const count = { point: 0, spot: 0, directional: 0 };
    this.engine.scene.traverse((obj) => {
      const light = obj as THREE.Light & { isPointLight?: boolean; isSpotLight?: boolean; isDirectionalLight?: boolean };
      if (!light.isLight || !light.castShadow) return;
      if (light.isPointLight) count.point++;
      else if (light.isSpotLight) count.spot++;
      else if (light.isDirectionalLight) count.directional++;
    });
    const maps = count.point + count.spot + count.directional;
    const units = this.engine.renderer.capabilities.maxTextures;
    const line = `[world] ${maps} shadow maps per lit shader (${count.point} point, ${count.spot} spot, ${count.directional} directional) of ${units} texture units`;
    // A lit material adds its own maps (colour, bump, roughness, environment, the area lights' two tables): past
    // the units left, every lit program fails to link and the rooms render black. Keep a margin of MATERIAL_UNITS.
    if (maps + MATERIAL_UNITS > units) console.error(`${line}: too many shadow-casting lights, lit shaders will not link`);
    else console.info(line);
  }

  /**
   * Declares a zone; nothing is built until it is activated (or `build()` is called). A lazy
   * builder (`LazyZoneBuilder`: its module fetched on demand) is loaded by the `ZoneManager`, by
   * `load()` or by `prepareZone()` before the zone is built.
   */
  addZone(spec: ZoneSpec<IdOf<Handles>>, build: ZoneBuilder | LazyZoneBuilder): Zone<IdOf<Handles>> {
    if (this.zones.some((z) => z.id === spec.id)) throw new Error(`[world] duplicate zone ${spec.id}`);
    const zone = new Zone(spec, this, build, FIRST_ZONE_SHADOW_LAYER + this.zones.length);
    this.zones.push(zone);
    return zone;
  }

  /** A declared zone by id. */
  zone(id: IdOf<Handles>): Zone<IdOf<Handles>> {
    return this.find(id);
  }

  /** What zone `id`'s builder returned; null until it is built. */
  handle<K extends IdOf<Handles>>(id: K): Handles[K] | null {
    return this.find(id).handle as Handles[K] | null;
  }

  /** Builds zone `id` if it is not built yet (out of the scene until activated) and returns its handle. */
  build<K extends IdOf<Handles>>(id: K): Handles[K] {
    return this.find(id).build() as Handles[K];
  }

  /** Fetches zone `id`'s builder module if it is a lazy one (a travel does it behind the curtain). */
  load(id: IdOf<Handles>): Promise<void> {
    return this.find(id).load();
  }

  /** Fetches every lazy builder's module (at idle time after start-up, so a first trip rarely waits). */
  loadAll(): Promise<void> {
    return Promise.all(this.zones.map((zone) => zone.load())).then(() => undefined);
  }

  private find(id: string): Zone<IdOf<Handles>> {
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
    if (this.interactables.has(item)) return;
    this.interactables.add(item);
    this.interactableAddedListeners.emit(item);
  }

  interactableRemoved(item: Interactable): void {
    if (!this.interactables.delete(item)) return;
    this.interactableRemovedListeners.emit(item);
  }

  occluderAdded(object: THREE.Object3D): void {
    if (this.occluderSet.has(object)) return;
    this.occluderSet.add(object);
    this.occluders.push(object);
    this.occluderAddedListeners.emit(object);
  }

  occluderRemoved(object: THREE.Object3D): void {
    if (!this.occluderSet.delete(object)) return;
    this.occluders.splice(this.occluders.indexOf(object), 1);
    this.occluderRemovedListeners.emit(object);
  }
}
