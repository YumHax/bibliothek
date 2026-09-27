import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';

/**
 * A light a prop would like to throw (a cabinet screen's glow, a neon's spill, a claw machine's
 * case light), without owning a real one: a zone's `LightPool` lends the nearest few of them a
 * real `PointLight` each. It stands where the light would, with the fields a prop sets on a
 * `PointLight` (`color`, `intensity`, `distance`, `decay`), so a class swaps `new THREE.PointLight`
 * for `new PooledLight` and keeps its code. Not a light itself: the scene's light count stays the
 * pool's, whatever the number of glows (see `lightBudget`).
 */
export class PooledLight extends THREE.Object3D {
  readonly isPooledLight = true;
  readonly color: THREE.Color;

  constructor(
    color: THREE.ColorRepresentation,
    public intensity = 1,
    public distance = 0,
    public decay = 2,
  ) {
    super();
    this.name = 'PooledLight';
    this.color = new THREE.Color(color);
  }
}

function isPooledLight(obj: THREE.Object3D): obj is PooledLight {
  return (obj as Partial<PooledLight>).isPooledLight === true;
}

/** How the pool weighs a glow: its intensity over its squared distance to the viewer (plus a metre, so the nearest does not blow up). */
function weight(light: PooledLight, position: THREE.Vector3, eye: THREE.Vector3): number {
  return light.intensity / (1 + position.distanceToSquared(eye));
}

interface Slot {
  readonly light: THREE.PointLight;
  source: PooledLight | null;
  /** 0..1: fades in when lent, out before it moves to another glow, so nothing pops. */
  level: number;
}

/** Seconds a slot takes to fade in or out. */
const FADE_SECONDS = 0.35;
/** Seconds between two sweeps of the zone for new or removed glows. */
const RESCAN_SECONDS = 2;

/**
 * A fixed handful of real point lights (`size`, never more, never fewer: the count never changes, so
 * no shader recompiles) lent to the `PooledLight`s of the subtree it is placed in (its parent: the
 * zone's group), the heaviest glows first (bright and near the viewer). Placed like furniture: an
 * empty footprint, never collides, ticks.
 */
export class LightPool extends THREE.Group implements Updatable {
  private readonly slots: Slot[] = [];
  private sources: PooledLight[] = [];
  private rescan = 0;
  private readonly eye = new THREE.Vector3();
  private readonly at = new THREE.Vector3();
  private readonly positions = new Map<PooledLight, THREE.Vector3>();

  constructor(
    size: number,
    private readonly viewer: THREE.Object3D,
  ) {
    super();
    this.name = 'LightPool';
    for (let i = 0; i < size; i++) {
      const light = new THREE.PointLight(0xffffff, 0, 1, 2);
      light.castShadow = false;
      this.slots.push({ light, source: null, level: 0 });
      this.add(light);
    }
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  update(dt: number): void {
    const root = this.parent;
    if (!root) return;
    this.rescan -= dt;
    if (this.rescan <= 0) {
      this.rescan = RESCAN_SECONDS;
      this.collect(root);
    }
    this.viewer.getWorldPosition(this.eye);
    // The glows that deserve a light: lit, drawn, the heaviest `size` of them.
    const wanted = this.sources
      .filter((s) => s.intensity > 0 && isDrawn(s))
      .map((s) => ({ s, w: weight(s, this.positionOf(s), this.eye) }))
      .sort((a, b) => b.w - a.w)
      .slice(0, this.slots.length)
      .map((e) => e.s);
    const step = dt / FADE_SECONDS;
    const lent = new Set(this.slots.map((slot) => slot.source));
    const waiting = wanted.filter((s) => !lent.has(s));
    for (const slot of this.slots) {
      if (slot.source && wanted.includes(slot.source)) slot.level = Math.min(1, slot.level + step);
      else if (slot.source && slot.level > 0) slot.level = Math.max(0, slot.level - step);
      else {
        slot.source = waiting.shift() ?? null;
        slot.level = 0;
      }
      this.apply(slot);
    }
  }

  /** Finds the `PooledLight`s under `root` (the zone): props come and go with purchases and rebuilds. */
  private collect(root: THREE.Object3D): void {
    const found: PooledLight[] = [];
    root.traverse((obj) => {
      if (isPooledLight(obj)) found.push(obj);
    });
    this.sources = found;
    this.positions.clear();
    for (const slot of this.slots) if (slot.source && !found.includes(slot.source)) slot.source = null;
  }

  /** A glow's world position, cached between sweeps (they stand still: props, machines). */
  private positionOf(source: PooledLight): THREE.Vector3 {
    let position = this.positions.get(source);
    if (!position) {
      position = source.getWorldPosition(new THREE.Vector3());
      this.positions.set(source, position);
    }
    return position;
  }

  private apply(slot: Slot): void {
    const { light, source } = slot;
    if (!source) {
      light.intensity = 0;
      return;
    }
    light.color.copy(source.color);
    light.intensity = source.intensity * slot.level;
    light.distance = source.distance;
    light.decay = source.decay;
    light.position.copy(this.worldToLocal(this.at.copy(this.positionOf(source))));
  }
}

/** Whether `obj` and every parent up to the scene are visible (a hidden cabinet lends no light). */
function isDrawn(obj: THREE.Object3D): boolean {
  for (let o: THREE.Object3D | null = obj; o; o = o.parent) if (!o.visible) return false;
  return true;
}
