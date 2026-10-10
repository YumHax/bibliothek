import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { playRockerClick } from '@/audio/furnitureSounds';
import { Prop } from './Prop';
import { HoverGlint } from './hoverGlint';
import { poweredAt } from '@/building/mains';
import { QUALITY } from '@/graphics/quality';
import { LampHalo } from '../lighting/LampHalo';

/** Seconds a switched lamp takes to come up (a filament warming) and to go dark (it cools a touch faster). */
const WARM_SECONDS = 0.14;
const COOL_SECONDS = 0.09;
/** Colour a bulb's glow starts from as it warms up: the filament's first dull orange. */
const EMBER = new THREE.Color(0xff8a3a);
const tint = new THREE.Color();

/**
 * A lamp the player switches by clicking it. Owns the on/off and hovered state, the eased level
 * (a switch brings the lamp up over `WARM_SECONDS`, never in one frame) and the `Interactable`
 * plumbing (caption, activation, the switch's click, the glint of the lamp's fittings on hover);
 * subclasses build the geometry, list their `hitboxes` and implement `render()` to push the level
 * into their lights and emissive materials. Subclasses call `setOn(initial)` at the end of their
 * constructor, once their materials exist: that first state is shown at once.
 */
export abstract class SwitchableLamp extends Prop implements Interactable, Updatable {
  abstract readonly hitboxes: THREE.Object3D[];
  /** What glints on hover: the lamp's small metal fittings unless a subclass names its own. */
  protected glint: HoverGlint = HoverGlint.fittings(this);
  private on = false;
  private hovered = false;
  /** 0 dark .. 1 fully lit, following `on`; null until the first `setOn`, which is shown at once. */
  private level: number | null = null;
  /** Where there is no bloom (`low`): a soft halo at each of the lamp's lights, following its level. */
  private halos: LampHalo[] | null = null;

  /** `what` names the lamp in its caption: "floor lamp", "ceiling light"… */
  protected constructor(private readonly what: string) {
    super();
  }

  get isOn(): boolean {
    return this.on;
  }

  setOn(on: boolean): void {
    this.on = on;
    if (this.level === null) {
      this.level = on ? 1 : 0;
      if (!QUALITY.bloom) this.halos = this.makeHalos();
      this.show(this.level);
    }
  }

  toggle(): void {
    this.setOn(!this.on);
  }

  /** Eases the level towards the switch (dark while the building's power is cut, `building/mains`); `render` runs only while it moves. */
  update(dt: number): void {
    const target = this.on && poweredAt(this) ? 1 : 0;
    if (this.level === null || this.level === target) return;
    const step = dt / (target ? WARM_SECONDS : COOL_SECONDS);
    this.level = target ? Math.min(1, this.level + step) : Math.max(0, this.level - step);
    this.show(this.level);
  }

  /** Renders the current level again: something else `render` reads changed (a parked spot). */
  protected refresh(): void {
    this.show(this.level ?? (this.on ? 1 : 0));
  }

  private show(level: number): void {
    this.render(level, this.hovered);
    if (this.halos) for (const halo of this.halos) halo.set(level);
  }

  /** A halo at each light the subclass built (point and spot: the bulbs), in the light's colour. */
  private makeHalos(): LampHalo[] {
    const lights: THREE.Light[] = [];
    this.traverse((obj) => {
      const light = obj as THREE.PointLight & THREE.SpotLight;
      if (light.isPointLight || light.isSpotLight) lights.push(light);
    });
    return lights.map((light) => {
      const halo = new LampHalo(light.color);
      halo.position.copy(light.position);
      light.parent!.add(halo);
      return halo;
    });
  }

  // --- Interactable -------------------------------------------------------------------------

  setHovered(hovered: boolean): void {
    this.hovered = hovered;
    this.glint.set(hovered);
    this.refresh();
  }

  label(): string {
    return `${this.what[0]!.toUpperCase()}${this.what.slice(1)} · switch ${this.on ? 'off' : 'on'}`;
  }

  activate(session: SessionActions): void {
    playRockerClick();
    this.toggle();
    if (this.on && !poweredAt(this)) session.react('Click. Nothing: the power is off in the whole building.');
  }

  /**
   * Applies the level (0 dark .. 1 lit, eased) to lights and materials; `hovered` is there for a
   * lamp whose cue is not its fittings' glint (most ignore it).
   */
  protected abstract render(level: number, hovered: boolean): void;

  /** Sets a bulb's glow colour for `level`: `base` when lit, from an ember's orange while it warms up. */
  protected static warmGlow(material: THREE.MeshStandardMaterial, base: THREE.ColorRepresentation, level: number): void {
    material.emissive.copy(tint.set(base)).lerp(EMBER, (1 - level) * 0.8);
  }
}
