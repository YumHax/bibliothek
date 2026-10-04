import type { Updatable } from '@/core/Engine';
import { Prop } from '../../props/Prop';
import { PooledLight } from '../../lighting/LightPool';
import { WALL, decal } from '../../surface/layers';
import { Glows, type ShopFitting } from './fitting';
import { random } from '@/random';

export interface GlowPanelOptions {
  /** Size of the glowing face. Default 0.6 x 0.4. */
  width?: number;
  height?: number;
  /** The glow's colour: an aquarium's blue-green, a chiller's cold white, a lightbox's. Default a cold white. */
  color?: number;
  /** Emissive strength when lit. Default 1.6. */
  strength?: number;
  /** A slow shimmer, as water under a tank's lamp. Default false. */
  shimmer?: boolean;
  /** Light thrown in front of it (a `PooledLight` `reach` out along +z), 0 for none. Default 0.6. */
  light?: number;
  reach?: number;
  /** Follows the shop's switch (a tank's own lamp does not: default false, always on). */
  switched?: boolean;
}

/**
 * A glowing face to set in or on something: the back of an aquarium lit from above, the lit inside of a chiller's
 * glass door, a lightbox: an emissive quad a hair proud of its surface (`WALL.print`), and the light it spills into the
 * room as a `PooledLight` (no shadow). A shimmer makes it breathe like water. A `ShopFitting` when `switched`.
 * Origin at its centre on the surface it glows from, +z out. Decoration: never collides.
 */
export class GlowPanel extends Prop implements ShopFitting, Updatable {
  private readonly glows = new Glows();
  private readonly light: PooledLight | null;
  private readonly level: number;
  private readonly shimmer: boolean;
  private readonly switched: boolean;
  private lit = true;
  private time = random() * 10;

  constructor(options: GlowPanelOptions = {}) {
    super();
    this.name = 'GlowPanel';
    const color = options.color ?? 0xe8f4ff;
    const face = this.glows.add({ color, emissive: color, strength: options.strength ?? 1.6, roughness: 0.4 });
    const panel = decal(options.width ?? 0.6, options.height ?? 0.4, face, WALL.print);
    panel.receiveShadow = false;
    this.add(panel);
    this.level = options.light ?? 0.6;
    this.light = this.level > 0 ? new PooledLight(color, this.level, 3, 2) : null;
    if (this.light) {
      this.light.position.z = options.reach ?? 0.5;
      this.add(this.light);
    }
    this.shimmer = options.shimmer ?? false;
    this.switched = options.switched ?? false;
    this.render(1);
  }

  setLit(on: boolean): void {
    if (!this.switched) return;
    this.lit = on;
    this.render(on ? 1 : 0);
  }

  update(dt: number): void {
    if (!this.shimmer || !this.lit) return;
    this.time += dt;
    this.render(0.88 + 0.08 * Math.sin(this.time * 1.3) + 0.04 * Math.sin(this.time * 3.7 + 1));
  }

  private render(level: number): void {
    this.glows.set(level);
    if (this.light) this.light.intensity = this.level * level;
  }
}
