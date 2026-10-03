import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../../Furniture';
import type { Walker } from '../../people/Walker';

/** Seconds between two rankings of who is nearest. */
const RANK_EVERY = 0.12;
/** Seconds a person takes to fade out when they fall out of the budget, or back in when they get into it again. */
const EASE = 0.8;

interface Entry {
  walker: Walker;
  /** The share the budget lets show, eased towards `allowed`. */
  share: number;
  allowed: boolean;
  distance: number;
}

/**
 * How many people the street draws at once: the costliest meshes there (about thirty draw calls each), so whoever
 * would show (present, faded in by their owner) is ranked by distance from the player, and only the nearest `max`
 * are let through; the rest fade out over `EASE` (they are the furthest, so it reads as the edge of the crowd) and
 * back in once a nearer one has gone. Every people class of the street joins its walkers (`join`, those made with
 * `fade`); it sets their `Walker.setAllowance`, never their own fade.
 */
export class PeopleBudget extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  private readonly entries: Entry[] = [];
  private readonly ranked: Entry[] = [];
  private readonly eye = new THREE.Vector3();
  private readonly spot = new THREE.Vector3();
  private clock = RANK_EVERY;

  constructor(private readonly viewer: THREE.Object3D, private readonly max: number) {
    super();
    this.name = 'PeopleBudget';
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  /** How many are drawn now (for `?stats`). */
  get drawn(): number {
    let n = 0;
    for (const e of this.entries) if (e.walker.drawn) n++;
    return n;
  }

  /** Counts `walker` in (one made with `fade`; others are left alone). */
  join(walker: Walker): void {
    if (!walker.canFade || this.entries.some((e) => e.walker === walker)) return;
    this.entries.push({ walker, share: 1, allowed: true, distance: 0 });
  }

  setZoneActive(active: boolean): void {
    if (active) this.clock = RANK_EVERY;
  }

  update(dt: number): void {
    this.clock += dt;
    if (this.clock >= RANK_EVERY) {
      this.clock = 0;
      this.rank();
    }
    const step = dt / EASE;
    for (const e of this.entries) {
      const target = e.allowed ? 1 : 0;
      if (e.share === target) continue;
      e.share = target > e.share ? Math.min(1, e.share + step) : Math.max(0, e.share - step);
      e.walker.setAllowance(e.share * e.share * (3 - 2 * e.share));
    }
  }

  private rank(): void {
    this.viewer.getWorldPosition(this.eye);
    this.ranked.length = 0;
    for (const e of this.entries) {
      if (!e.walker.wantsShown) {
        // Gone (through a door, out of sight): when they next turn up, they ease in once ranked (never a flash of
        // someone beyond the budget).
        e.allowed = false;
        if (e.share !== 0) {
          e.share = 0;
          e.walker.setAllowance(0);
        }
        continue;
      }
      e.walker.getWorldPosition(this.spot);
      e.distance = this.spot.distanceToSquared(this.eye);
      this.ranked.push(e);
    }
    this.ranked.sort((a, b) => a.distance - b.distance);
    this.ranked.forEach((e, i) => {
      e.allowed = i < this.max;
    });
  }
}
