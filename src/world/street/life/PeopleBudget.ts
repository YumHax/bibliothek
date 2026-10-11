import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../../Furniture';
import type { Walker } from '../../people/Walker';
import { smooth } from '@/math/scalar';
import { proxyDistance } from '../../people/PersonModel';

/** Seconds between two rankings of who is nearest. */
const RANK_EVERY = 0.12;
/** Seconds a person takes to fade out when they fall out of the budget, or back in when they get into it again. */
const EASE = 0.8;
/** Metres round a person's middle that count as "in view": wide enough that someone at the frame's edge stays in. */
const VIEW_RADIUS = 1.6;
/** Within this many metres someone counts as in view wherever they stand: a glance round would find them. */
const NEAR_ALWAYS = 5;
/** Added to the squared distance of whoever is out of view, so everyone in view ranks first. */
const OUT_OF_VIEW = 1e6;
/**
 * What someone past the proxy distance costs of the budget (`PersonModel.proxyDistance`: drawn as one skinned mesh,
 * one draw instead of dozens): a quarter of a full body (they still walk, pose and fade).
 */
const PROXY_SHARE = 0.25;
/** However cheap they are, never more people drawn at once than this many times the budget. */
const MOST_PEOPLE = 3;

interface Entry {
  walker: Walker;
  /** The share the budget lets show, eased towards `allowed`. */
  share: number;
  allowed: boolean;
  /** The ranking's key: the squared distance, plus `OUT_OF_VIEW` when out of view. */
  distance: number;
  /** The squared distance alone. */
  away: number;
}

/**
 * How many people the street draws at once: the costliest meshes there (several dozen draw calls each), so whoever
 * would show (present, faded in by their owner) is ranked, those in the camera's view (or within `NEAR_ALWAYS`) first
 * and then by distance from the player, and they are let through in that order while the budget lasts: `max` full
 * bodies, someone past the proxy distance counting `PROXY_SHARE` of one (never more than `MOST_PEOPLE` x `max` in all) (a slot is never spent on someone
 * behind the camera while someone ahead fades out); the rest fade out over `EASE` (they are the furthest, so it reads as the edge of the crowd) and
 * back in once a nearer one has gone. Every people class of the street joins its walkers (`join`, those made with
 * `fade`); it sets their `Walker.setAllowance`, never their own fade.
 */
export class PeopleBudget extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  private readonly entries: Entry[] = [];
  private readonly ranked: Entry[] = [];
  private readonly eye = new THREE.Vector3();
  private readonly spot = new THREE.Vector3();
  private readonly frustum = new THREE.Frustum();
  private readonly viewMatrix = new THREE.Matrix4();
  private readonly sphere = new THREE.Sphere(new THREE.Vector3(), VIEW_RADIUS);
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
    this.entries.push({ walker, share: 1, allowed: true, distance: 0, away: 0 });
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
      e.walker.setAllowance(smooth(e.share));
    }
  }

  private rank(): void {
    this.viewer.getWorldPosition(this.eye);
    const camera = this.viewer instanceof THREE.Camera ? this.viewer : null;
    if (camera) {
      camera.updateMatrixWorld();
      this.viewMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      this.frustum.setFromProjectionMatrix(this.viewMatrix);
    }
    const near = NEAR_ALWAYS * NEAR_ALWAYS;
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
      e.away = e.distance;
      if (camera && e.distance > near) {
        this.sphere.center.copy(this.spot).y += 0.9;
        if (!this.frustum.intersectsSphere(this.sphere)) e.distance += OUT_OF_VIEW;
      }
      this.ranked.push(e);
    }
    this.ranked.sort((a, b) => a.distance - b.distance);
    const proxied = proxyDistance() ** 2;
    let spent = 0;
    let shown = 0;
    for (const e of this.ranked) {
      const cost = e.away > proxied ? PROXY_SHARE : 1;
      e.allowed = spent + cost <= this.max && shown < this.max * MOST_PEOPLE;
      if (!e.allowed) continue;
      spent += cost;
      shown++;
    }
  }
}
