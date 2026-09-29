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
/** Seconds between two choices of the glows that deserve a light (the fades run every frame). */
const RERANK_SECONDS = 0.25;
/**
 * A glow holding a light keeps it until a newcomer weighs this much more: walking along a row of
 * cabinets, two of nearly equal weight would otherwise trade the light back and forth, each trade a
 * fade out and in.
 */
const HOLD = 1.4;

/**
 * A fixed handful of real point lights (`size`, never more, never fewer: the count never changes, so
 * no shader recompiles) lent to the `PooledLight`s of the subtree it is placed in (its parent: the
 * zone's group), the heaviest glows first (bright and near the viewer, a glow that holds one
 * counting `HOLD` times its weight). Placed like furniture: an empty footprint, never collides,
 * ticks. Allocates nothing per frame (the ranking fills preallocated arrays).
 */
export class LightPool extends THREE.Group implements Updatable {
  private readonly slots: Slot[] = [];
  private sources: PooledLight[] = [];
  private rescan = 0;
  private rerank = 0;
  /** The glows that deserve a light, heaviest first (at most one per slot), and their weights. */
  private readonly wanted: PooledLight[] = [];
  private readonly wantedWeights: number[] = [];
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
      this.rerank = 0;
    }
    this.rerank -= dt;
    if (this.rerank <= 0) {
      this.rerank = RERANK_SECONDS;
      this.rank();
    }
    const wanted = this.wanted;
    const step = dt / FADE_SECONDS;
    // A free slot takes the heaviest wanted glow that no slot holds yet.
    let next = 0;
    for (const slot of this.slots) {
      if (slot.source && wanted.includes(slot.source)) slot.level = Math.min(1, slot.level + step);
      else if (slot.source && slot.level > 0) slot.level = Math.max(0, slot.level - step);
      else {
        slot.source = null;
        while (next < wanted.length) {
          const candidate = wanted[next++]!;
          if (!this.isLent(candidate)) {
            slot.source = candidate;
            break;
          }
        }
        slot.level = 0;
      }
      this.apply(slot);
    }
  }

  /** The glows that deserve a light: lit, drawn, the heaviest `size` of them (a holder weighs `HOLD` times more), by insertion into the preallocated list. */
  private rank(): void {
    this.viewer.getWorldPosition(this.eye);
    const { wanted, wantedWeights: weights } = this;
    const size = this.slots.length;
    wanted.length = 0;
    weights.length = 0;
    if (!size) return;
    for (const source of this.sources) {
      if (source.intensity <= 0 || !isDrawn(source)) continue;
      let w = weight(source, this.positionOf(source), this.eye);
      if (this.isLent(source)) w *= HOLD;
      let i: number;
      if (wanted.length < size) {
        wanted.push(source);
        weights.push(w);
        i = wanted.length - 1;
      } else {
        if (w <= weights[size - 1]!) continue;
        i = size - 1;
      }
      while (i > 0 && weights[i - 1]! < w) {
        wanted[i] = wanted[i - 1]!;
        weights[i] = weights[i - 1]!;
        i--;
      }
      wanted[i] = source;
      weights[i] = w;
    }
  }

  private isLent(source: PooledLight): boolean {
    for (const slot of this.slots) if (slot.source === source) return true;
    return false;
  }

  /** Finds the `PooledLight`s under `root` (the zone): props come and go with purchases and rebuilds. */
  private collect(root: THREE.Object3D): void {
    const found: PooledLight[] = [];
    root.traverse((obj) => {
      if (isPooledLight(obj)) found.push(obj);
    });
    this.sources = found;
    // Positions are read again at each sweep (a rebuilt shelf may have moved a glow), into the vectors already there.
    const kept = new Set(found);
    for (const [source, position] of this.positions) {
      if (kept.has(source)) source.getWorldPosition(position);
      else this.positions.delete(source);
    }
    for (const slot of this.slots) if (slot.source && !kept.has(slot.source)) slot.source = null;
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
