import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Updatable } from '@/core/Engine';
import type { Look } from './grade';
import { damp } from '@/math/damp';

/** Strength of the reflections in a fully lit room; the room's own lamps and hemisphere do the rest. */
const MAX_INTENSITY = 0.24;
/** Per second: switching a lamp dims the reflections along with it, without a pop. */
const RATE = 4;
/**
 * A new look's tinted copy goes in once the reflections have eased down to this share of the room's
 * strength (they dip towards `SWAP_DIP`, then come back up with the new tint): a half-strength
 * reflection hides the swap, and the glossy things never go dull for the better part of a second.
 * The easing is quicker while a swap waits (`SWAP_RATE`).
 */
const SWAP_BELOW = 0.6;
const SWAP_DIP = 0.5;
const SWAP_RATE = 9;
/**
 * A zone's own map refreshed (the street's sky, every few seconds of sky): a shallower dip, the
 * change being small; the swap still happens under it rather than as a step.
 */
const REFRESH_DIP = 0.82;
const REFRESH_BELOW = 0.88;

/**
 * A zone's own reflections (the street's sky dome, `street/SkyReflection`): while one is set and
 * returns a map, that map is the scene's environment instead of the look's studio room. Set by the
 * zone while the player is in it, null when they leave.
 */
export interface ReflectionSource {
  update(renderer: THREE.WebGLRenderer, dt: number): THREE.Texture | null;
  /** A factor on the reflections' strength while this source's map is shown (a room's capture brought to the studio's brightness, `RoomReflection`). */
  gain?(): number;
}
let reflectionSource: ReflectionSource | null = null;
export function setReflectionSource(source: ReflectionSource | null): void {
  reflectionSource = source;
}

/** Stops `source` being the scene's reflections, if it still is (a room left after the next zone already set its own). */
export function clearReflectionSource(source: ReflectionSource): void {
  if (reflectionSource === source) reflectionSource = null;
}

/**
 * Something to reflect: a small studio room (three.js's `RoomEnvironment`) prefiltered into a PMREM
 * and set as the scene's environment, so glossy plastic, glass and metal catch highlights instead of
 * reading flat. Image-based light also brightens the diffuse a little, so its intensity follows how
 * lit the player's room is (`level`, 0 dark .. 1 lamp or sun): a room with the lights off at night
 * must not glow with a studio's reflections.
 *
 * Each zone's look tints and scales it (`Look.reflections`: a warm dim den, a dark magenta arcade, a
 * cool open sky). With `tinted` (medium, high) every tint is its own prefiltered copy, made once (the
 * first time it is needed, or at idle by `prewarm`) and kept; they all have the same size, so a swap
 * recompiles nothing, and it happens in a short dip to about half strength. Without, only
 * the strength follows the look.
 */
export class Environment implements Updatable {
  private intensity = 0;
  private strength = 1;
  private readonly maps = new Map<number, THREE.Texture>();
  private generator: THREE.PMREMGenerator | null = null;
  /** A look's copy (or a zone's own map) waiting for the reflections to dim before it goes in. */
  private pending: THREE.Texture | null = null;
  /** How deep the wait for `pending` dips, and under what share it swaps: a new look, or a refresh of the zone's own map. */
  private dip = SWAP_DIP;
  private below = SWAP_BELOW;
  /** The look's map (the studio room), and whether a zone's own (`ReflectionSource`) is shown instead. */
  private lookMap: THREE.Texture | null = null;
  private ownShown = false;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly level: () => number,
    private readonly tinted: boolean,
  ) {
    scene.environment = this.lookMap = this.mapFor(0xffffff);
    if (!tinted) this.release();
    // Starts dark and eases up on the first frames (`level` is only read once the loop runs).
    scene.environmentIntensity = 0;
  }

  setLook(look: Look, snap = false): void {
    this.strength = look.reflections.strength;
    const map = this.tinted ? this.mapFor(look.reflections.tint) : this.lookMap;
    this.lookMap = map;
    // A zone's own map is shown instead (the street's sky): the look's goes in when it stops.
    if (!this.ownShown) this.queue(map === this.scene.environment ? null : map, false);
    if (snap) this.settle();
  }

  /** Makes the tinted copies of `tints` ahead of need, one per idle moment (so walking out onto the street costs no prefilter). */
  prewarm(tints: readonly THREE.ColorRepresentation[]): void {
    if (!this.tinted) return;
    const queue = [...tints];
    const idle = (fn: () => void): void => {
      if (typeof requestIdleCallback === 'function') requestIdleCallback(fn, { timeout: 4000 });
      else setTimeout(fn, 200);
    };
    const next = (): void => {
      const tint = queue.shift();
      if (tint === undefined) return;
      this.mapFor(tint);
      idle(next);
    };
    idle(next);
  }

  /** At once where the easing is heading: the look's copy in, the intensity at the room's (behind a travel's curtain). */
  settle(): void {
    if (this.pending) this.scene.environment = this.pending;
    this.pending = null;
    this.intensity = this.target();
    this.scene.environmentIntensity = this.intensity;
  }

  update(dt: number): void {
    const own = reflectionSource?.update(this.renderer, dt) ?? null;
    // In and out of a zone with its own reflections (walking through the airlock, no curtain to
    // hide it) and each refresh of that map: swapped under a dip too, not as a jump.
    if (own) {
      if (own !== this.scene.environment && own !== this.pending) this.queue(own, this.ownShown);
    } else if (this.ownShown) this.queue(this.lookMap === this.scene.environment ? null : this.lookMap, false);
    this.ownShown = own !== null;
    const room = this.target();
    const target = this.pending ? room * this.dip : room;
    this.intensity = damp(this.intensity, target, this.pending ? SWAP_RATE : RATE, dt);
    // A dark room shows no reflection to swap under: at once.
    if (this.pending && (this.intensity <= room * this.below || room < MAX_INTENSITY * 0.02)) {
      this.scene.environment = this.pending;
      this.pending = null;
    }
    this.scene.environmentIntensity = this.intensity;
  }

  /** `map` to go in under the next dip (null: nothing waits); `refresh`: the shallow dip of a zone's own map renewed. */
  private queue(map: THREE.Texture | null, refresh: boolean): void {
    this.pending = map;
    this.dip = refresh ? REFRESH_DIP : SWAP_DIP;
    this.below = refresh ? REFRESH_BELOW : SWAP_BELOW;
  }

  private target(): number {
    const gain = this.ownShown ? (reflectionSource?.gain?.() ?? 1) : 1;
    return MAX_INTENSITY * this.strength * gain * THREE.MathUtils.clamp(this.level(), 0, 1);
  }

  /** The studio room prefiltered with its light and glowing panels times `tint`, made once per tint. */
  private mapFor(tint: THREE.ColorRepresentation): THREE.Texture {
    const color = new THREE.Color(tint);
    const key = color.getHex();
    let map = this.maps.get(key);
    if (map) return map;
    const room = new RoomEnvironment();
    room.traverse((obj) => {
      const light = obj as THREE.PointLight;
      if (light.isLight) light.color.multiply(color);
      // The glowing panels (unlit) take the tint; the lit walls and boxes get it from the light alone
      // (tinting them too would square it). Their materials are shared between boxes: once each.
      const material = (obj as Partial<THREE.Mesh>).material as THREE.MeshBasicMaterial | undefined;
      if (material?.isMeshBasicMaterial && !material.userData.tinted) {
        material.color.multiply(color);
        material.userData.tinted = true;
      }
    });
    this.generator ??= new THREE.PMREMGenerator(this.renderer);
    map = this.generator.fromScene(room, 0.04).texture;
    map.name = `Environment:${color.getHexString()}`;
    room.dispose();
    this.maps.set(key, map);
    return map;
  }

  /** The prefilter's own programs and targets, once no copy will be made any more. */
  private release(): void {
    this.generator?.dispose();
    this.generator = null;
  }
}
