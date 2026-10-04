import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { cylinderMesh } from '../../meshUtils';
import { Prop, part } from '../../props/Prop';
import { paint } from '../../materials/palette';
import { PooledLight } from '../../lighting/LightPool';
import { LAMP_LIGHT } from '../../lighting/lampColours';
import { TubeHum } from '../shopSounds';
import { Glows, type PropVoice, type ShopFitting, type ShopVoiced } from './fitting';
import { random } from '@/random';

export interface TubeBattenOptions {
  /** Length of the batten, metres. Default 1.2 (a 4 ft tube). */
  length?: number;
  /** Bare tubes side by side, 1 or 2. Default 2. */
  tubes?: 1 | 2;
  /** A frosted diffuser under the tubes instead of bare glass. Default false (a workshop's batten). */
  diffuser?: boolean;
  /** Hung on two chains this far below the ceiling; 0 screwed to it. Default 0. */
  drop?: number;
  /** One tube stutters now and then (and the ballast crackles). Default false. */
  flicker?: boolean;
  /** The ballast's hum is heard under it. Default true. */
  hum?: boolean;
  /** How much light it throws into the room through the shop's `LightPool` (a `PooledLight`), 0 for none. Default 0.9. */
  light?: number;
}

const BODY = paint(0xe8e6e0, 0.5);
const CHAIN = paint(0x8a8680, 0.4);
const GLOW = 2.2;
/** A stutter: seconds between two (at random, up to twice this), and how long one lasts. */
const STUTTER_EVERY = 14;
const STUTTER_FOR = 0.45;

/**
 * A fluorescent batten: a white steel channel on the ceiling (or hung on chains), one or two bare tubes glowing a cool
 * white under it or a frosted diffuser, the ballast humming; a tired one stutters now and then. A `ShopFitting`: the
 * shop's switch works it; its light on the room is a `PooledLight` (no shadow). Ceiling-hung: origin at the ceiling,
 * along local x, hanging down -y. Decoration: never collides.
 */
export class TubeBatten extends Prop implements ShopFitting, ShopVoiced, Updatable {
  private readonly glows = new Glows();
  private readonly light: PooledLight | null;
  private readonly lightLevel: number;
  private readonly hum: TubeHum | null;
  private readonly flickers: boolean;
  private lit = true;
  private untilStutter: number;
  private stutter = 0;
  private readonly hangAt: number;

  constructor(options: TubeBattenOptions = {}) {
    super();
    this.name = 'TubeBatten';
    const length = options.length ?? 1.2;
    const tubes = options.tubes ?? 2;
    const drop = options.drop ?? 0;
    this.flickers = options.flicker ?? false;
    this.untilStutter = STUTTER_EVERY * (0.5 + random());
    const top = -drop;
    if (drop > 0) {
      for (const x of [-length * 0.4, length * 0.4]) part(this, 0.006, drop, 0.006, CHAIN, { x, y: -drop / 2 });
    }
    const width = tubes === 2 ? 0.14 : 0.08;
    part(this, length, 0.05, width, BODY, { y: top - 0.025 });
    // End caps holding the tubes.
    for (const x of [-1, 1]) part(this, 0.03, 0.04, width * 0.9, BODY, { x: (x * (length - 0.03)) / 2, y: top - 0.07 });
    const tube = this.glows.add({ kind: 'led', color: 0xf4f6f4, strength: GLOW, roughness: 0.3 });
    const zs = tubes === 2 ? [-0.035, 0.035] : [0];
    for (const z of zs) {
      const t = cylinderMesh(0.013, length - 0.06, tube, { y: top - 0.072, z });
      t.rotation.z = Math.PI / 2;
      t.castShadow = false;
      this.add(t);
    }
    if (options.diffuser) {
      const prism = this.glows.add({ kind: 'led', color: 0xf0f2f0, strength: GLOW * 0.55, roughness: 0.6 });
      part(this, length - 0.02, 0.012, width + 0.02, prism, { y: top - 0.1 });
    }
    this.hangAt = top - 0.09;
    this.lightLevel = options.light ?? 0.9;
    this.light = this.lightLevel > 0 ? new PooledLight(LAMP_LIGHT.led, this.lightLevel, 4.5, 2) : null;
    if (this.light) {
      this.light.position.y = this.hangAt - 0.05;
      this.add(this.light);
    }
    this.hum = (options.hum ?? true) ? new TubeHum() : null;
    this.traverse((o) => (o.castShadow = false));
    this.setLit(true);
  }

  setLit(on: boolean): void {
    this.lit = on;
    this.hum?.setLit(on);
    this.render(on ? 1 : 0);
  }

  voices(): readonly PropVoice[] {
    return this.hum ? [{ voice: this.hum, at: new THREE.Vector3(0, this.hangAt, 0), options: { referenceDistance: 0.8, maxDistance: 5 } }] : [];
  }

  update(dt: number): void {
    if (!this.flickers || !this.lit) return;
    if (this.stutter > 0) {
      this.stutter -= dt;
      this.render(this.stutter > 0 ? (random() < 0.5 ? 0.15 : 0.9) : 1);
      return;
    }
    this.untilStutter -= dt;
    if (this.untilStutter > 0) return;
    this.untilStutter = STUTTER_EVERY * (0.3 + random() * 1.7);
    this.stutter = STUTTER_FOR * (0.5 + random());
    this.hum?.stutter();
  }

  private render(level: number): void {
    this.glows.set(level);
    if (this.light) this.light.intensity = this.lightLevel * level;
  }
}
