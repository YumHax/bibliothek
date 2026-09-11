import type * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { Prop } from './Prop';

/**
 * A lamp the player switches by clicking it. Owns the on/off and hovered state and the
 * `Interactable` plumbing (caption, activation); subclasses build the geometry, list their
 * `hitboxes` and implement `render()` to push the state into their lights and emissive materials.
 * Subclasses call `setOn(initial)` at the end of their constructor, once their materials exist.
 */
export abstract class SwitchableLamp extends Prop implements Interactable {
  abstract readonly hitboxes: THREE.Object3D[];
  private on = false;
  private hovered = false;

  /** `what` names the lamp in its caption: "floor lamp", "ceiling light"… */
  protected constructor(private readonly what: string) {
    super();
  }

  get isOn(): boolean {
    return this.on;
  }

  setOn(on: boolean): void {
    this.on = on;
    this.render(on, this.hovered);
  }

  toggle(): void {
    this.setOn(!this.on);
  }

  // --- Interactable -------------------------------------------------------------------------

  setHovered(hovered: boolean): void {
    this.hovered = hovered;
    this.render(this.on, hovered);
  }

  label(): string {
    return this.on ? `Click to switch the ${this.what} off` : `Click to switch the ${this.what} on`;
  }

  activate(_session: SessionActions): void {
    this.toggle();
  }

  /** Applies the state to lights and materials; `hovered` lamps glow a little so a switched-off one still reacts. */
  protected abstract render(on: boolean, hovered: boolean): void;
}
