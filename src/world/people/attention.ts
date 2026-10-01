import * as THREE from 'three';
import { seededRandom } from '@/covers/generated/canvasUtils';

/*
 * How someone's eyes treat the player: never a stare. Coming into range, they look up for a
 * moment (sometimes with a nod), then go back to what they were doing and look again now and
 * then. Caught being looked at, they meet the player's eyes, then look away sooner than they
 * would have; someone standing too close gets looked at less, not more. While talking with the
 * player (`engage`) their eyes stay mostly on them, with a glance aside every few seconds, as
 * people do while they think. A walker looks at someone coming towards them from a few metres
 * off, then looks ahead again before passing them. Each person is a little shyer or bolder
 * (from the seed). The owner asks every frame whether to look at the player (`update`) and does
 * whatever it does otherwise; `takeNotice` tells it when to nod.
 */

export interface AttentionRange {
  /** The player further than this (metres, on the floor) goes unnoticed. */
  range: number;
  /** The widest angle off their forward (radians) at which they notice the player: ahead only for a walker. */
  cone: number;
  /** Nearer than this, a walker has already looked away (passing strangers do not watch each other go by). */
  passBy?: number;
}

/** Standing about: anyone round the front. */
export const STANDING: AttentionRange = { range: 3.2, cone: 2 };
/** Walking: someone coming the other way, from a few metres. */
export const WALKING: AttentionRange = { range: 5.5, cone: 0.75, passBy: 1.9 };

/** Seconds the player has to have been away to be noticed afresh (a look and maybe a nod). */
const FRESH_AFTER = 6;
/** Seconds of a look at the player, and of the time between two, by mood (bounds, scaled by the person's shyness). */
const LOOK: readonly [number, number] = [0.9, 2.1];
const BETWEEN: readonly [number, number] = [3.5, 9];
/** Walking: one look per encounter, or nearly. */
const BETWEEN_WALKING: readonly [number, number] = [9, 16];
/** In a conversation: long looks, short glances aside. */
const TALK_LOOK: readonly [number, number] = [2.4, 5];
const TALK_AWAY: readonly [number, number] = [0.5, 1.3];
/** The player's view within this of their head counts as looking at them (cosine), within this far. */
const WATCHED_COS = 0.985;
const WATCHED_WITHIN = 6;
/** Nearer than this (metres), a look at the player is cut short. */
const TOO_CLOSE = 0.75;

export class Attention {
  private looking = false;
  private timer: number;
  private near = false;
  private awayFor = Infinity;
  private engaged = 0;
  private noticed = false;
  /** 0.7 (bold: looks longer, sooner) .. 1.4 (shy). */
  private readonly shyness: number;
  /** How likely a nod is on noticing the player. */
  private readonly warmth: number;
  private readonly random: () => number;
  private readonly here = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private readonly view = new THREE.Vector3();

  constructor(seed: number) {
    this.random = seededRandom(seed * 7919 + 17);
    this.shyness = 0.7 + this.random() * 0.7;
    this.warmth = 0.25 + this.random() * 0.5;
    this.timer = this.draw(BETWEEN) * this.random();
  }

  /** Talking with the player for `seconds` from now: eyes mostly on them. */
  engage(seconds: number): void {
    if (this.engaged <= 0 && !this.looking) {
      this.looking = true;
      this.timer = this.draw(TALK_LOOK);
    }
    this.engaged = Math.max(this.engaged, seconds);
  }

  get inConversation(): boolean {
    return this.engaged > 0;
  }

  /** Whether they just noticed the player (a nod is in order); true once per noticing. */
  takeNotice(): boolean {
    const noticed = this.noticed;
    this.noticed = false;
    return noticed;
  }

  /**
   * A frame: whether `self` (a person, origin on the floor, facing +z) looks at `viewer` now.
   * The viewer's world position is left in `viewerPos` either way.
   */
  update(dt: number, self: THREE.Object3D, viewer: THREE.Object3D, mood: AttentionRange, viewerPos: THREE.Vector3): boolean {
    viewer.getWorldPosition(viewerPos);
    self.getWorldPosition(this.here);
    const dx = viewerPos.x - this.here.x;
    const dz = viewerPos.z - this.here.z;
    const distance = Math.hypot(dx, dz);
    const talking = this.engaged > 0;
    this.engaged = Math.max(0, this.engaged - dt);
    let inRange = distance < (talking ? 6 : mood.range);
    if (inRange && !talking && distance > 0.3) {
      self.getWorldDirection(this.forward);
      const off = Math.acos(THREE.MathUtils.clamp((this.forward.x * dx + this.forward.z * dz) / (Math.hypot(this.forward.x, this.forward.z) * distance + 1e-6), -1, 1));
      inRange = off < mood.cone && !(mood.passBy && distance < mood.passBy);
    }
    if (!inRange) {
      this.near = false;
      this.awayFor += dt;
      if (this.looking && !talking) {
        this.looking = false;
        this.timer = this.draw(BETWEEN) * this.shyness;
      }
      return false;
    }
    if (!this.near) {
      this.near = true;
      if (this.awayFor > FRESH_AFTER && !talking) {
        // Noticed: a look up at once, sometimes a nod with it.
        this.looking = true;
        this.timer = this.draw(LOOK) / Math.sqrt(this.shyness);
        this.noticed = this.random() < this.warmth;
      }
      this.awayFor = 0;
    }
    // Being looked at hurries their look back, then their looking away; too close, they look away sooner.
    viewer.getWorldDirection(this.view);
    const toHead = this.here.setY(this.here.y + 1.6).sub(viewerPos);
    const watched = toHead.length() < WATCHED_WITHIN && this.view.dot(toHead.normalize()) > WATCHED_COS;
    let rate = 1;
    if (!talking) {
      if (watched) rate = this.looking ? 1.7 : 2.5;
      if (this.looking && distance < TOO_CLOSE) rate *= 2;
    }
    this.timer -= dt * rate;
    if (this.timer <= 0) {
      this.looking = !this.looking;
      if (talking) this.timer = this.draw(this.looking ? TALK_LOOK : TALK_AWAY);
      else if (this.looking) this.timer = this.draw(LOOK) / this.shyness;
      else this.timer = this.draw(mood.passBy ? BETWEEN_WALKING : BETWEEN) * this.shyness;
    }
    return this.looking;
  }

  private draw([low, high]: readonly [number, number]): number {
    return low + (high - low) * this.random();
  }
}
