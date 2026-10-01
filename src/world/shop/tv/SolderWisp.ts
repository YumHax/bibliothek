import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../../Furniture';
import { Steam } from '../../kitchen/Steam';

export interface SolderWispOptions {
  /** How high over the surface it rises from (the iron's tip, `SolderingStation.IRON_TIP.y`). Default 0.115. */
  height?: number;
}

/** Seconds of a puff of flux, and between two (at random, up to twice this). */
const PUFF_FOR = 2.5;
const PUFF_EVERY = 6;

/**
 * The thread of flux smoke off a hot soldering iron: now and then a thin grey wisp curls up from its tip and thins
 * out, as if the repairer had just touched a joint (`kitchen/Steam`, one draw, the canvas's alpha untouched). Stands
 * on the bench at the iron's tip. Never collides.
 */
export class SolderWisp extends THREE.Object3D implements Furniture, Updatable {
  readonly footprint = new THREE.Box3();
  readonly contactShadow = false;
  private readonly smoke = new Steam({ count: 10, life: 2.6, rise: 0.09, startSize: 0.006, endSize: 0.06, opacity: 0.16 });
  private until = PUFF_EVERY * Math.random();
  private puffing = false;

  constructor(options: SolderWispOptions = {}) {
    super();
    this.name = 'SolderWisp';
    this.smoke.position.y = options.height ?? 0.115;
    this.add(this.smoke);
  }

  update(dt: number): void {
    this.until -= dt;
    if (this.until <= 0) {
      this.puffing = !this.puffing;
      this.until = (this.puffing ? PUFF_FOR : PUFF_EVERY) * (0.5 + Math.random());
    }
    this.smoke.rate = this.puffing ? 0.7 : 0;
    this.smoke.update(dt);
  }
}
