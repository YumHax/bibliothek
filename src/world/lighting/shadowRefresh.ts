import type * as THREE from 'three';
import { QUALITY } from '@/graphics/quality';

/**
 * When a live light's shadow map is redrawn: a lit lamp or sun of the player's room (what moves in
 * it, the cat, a door, the box in hand, must cast as it moves). Every frame at `QUALITY.shadowRefreshHz`
 * 0, else that many times a second: each refresh draws the room again from the light, six times for
 * a point light, and at 60 fps that was most of the frame's draw calls. Not live (the player
 * elsewhere, the lamp off, the sun behind the wall), the owner refreshes the map itself now and then,
 * or not at all. Owners call `update` from their own tick.
 */
export class ShadowRefresh {
  private live = false;
  private readonly period = QUALITY.shadowRefreshHz > 0 ? 1 / QUALITY.shadowRefreshHz : 0;
  /** Starts at a random phase so several live lights do not all redraw on the same frame. */
  private timer = Math.random() * this.period;

  constructor(private readonly light: THREE.Light & { shadow: THREE.LightShadow }) {
    light.shadow.autoUpdate = false;
  }

  get isLive(): boolean {
    return this.live;
  }

  /** Starts or stops the regular refresh; a change redraws the map once now. */
  setLive(live: boolean): void {
    if (live === this.live) return;
    this.live = live;
    this.light.shadow.autoUpdate = live && this.period === 0;
    this.light.shadow.needsUpdate = true;
  }

  update(dt: number): void {
    if (!this.live || this.period === 0) return;
    this.timer += dt;
    if (this.timer < this.period) return;
    this.timer = Math.min(this.timer - this.period, this.period);
    this.light.shadow.needsUpdate = true;
  }
}
