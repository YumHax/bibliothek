import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { Prop } from '../../props/Prop';
import { paint } from '../../materials/palette';
import { invisibleHitbox } from '../../meshUtils';
import { mainsOn } from '@/building/mains';
import { playRelay } from '../stairSounds';

const PLATE = paint(0x2a2420, 0.35);
const KNOB = paint(0xe9e2d2, 0.4);
/** The pilot's orange: bright while the landing is dark (to find the button by), faint once lit. */
const PILOT = new THREE.Color(0xff8a1e);

interface TimerButtonOptions {
  /** The landing it is on (0 ours .. the hall's). */
  k: number;
  /** Switches the building's timer on; false when it did nothing (no power). */
  press: () => boolean;
  /** How lit its landing's globe is (0 .. 1). */
  glow: () => number;
  /** Told of every press (the concierge's errand); what the button did under the finger. */
  pressed?: (k: number) => 'sticks' | 'fine';
}

/**
 * The timer light's push button on a landing's wall (the old minuterie): a round bakelite plate, a cream button, an
 * orange pilot that glows while the landing is dark so it is found in the dark. Pressed, every globe of the building
 * comes on for the timer's time (`StairLights.pressTimer`). One of them sticks (the concierge's errand). Wall-hung:
 * origin at its middle, +z out of the wall.
 */
export class TimerButton extends Prop implements Interactable, Updatable {
  readonly contactShadow = false;
  readonly hitboxes: THREE.Object3D[];
  private readonly pilot: THREE.MeshBasicMaterial;
  private readonly knob: THREE.Mesh;
  private pushed = 0;

  constructor(private readonly options: TimerButtonOptions) {
    super();
    this.name = 'TimerButton';
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.045, 0.012, 16).rotateX(Math.PI / 2), PLATE);
    plate.position.z = 0.006;
    this.add(plate);
    this.knob = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.012, 12).rotateX(Math.PI / 2), KNOB);
    this.knob.position.z = 0.016;
    this.add(this.knob);
    this.pilot = new THREE.MeshBasicMaterial({ color: PILOT.clone() });
    const pilot = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.004, 4, 20), this.pilot);
    pilot.position.z = 0.0125;
    this.add(pilot);
    const hit = invisibleHitbox(0.14, 0.14, 0.08, { z: 0.03 });
    this.add(hit);
    this.hitboxes = [hit];
    this.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = false;
    });
  }

  override get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  setHovered(): void {}

  label(): string {
    return 'Timer light · press';
  }

  activate(session: SessionActions): void {
    const lit = this.options.press();
    const how = this.options.pressed?.(this.options.k) ?? 'fine';
    this.pushed = how === 'sticks' ? 1.6 : 0.25;
    playRelay(0.0012, true);
    if (!lit) session.refuse('Click. Nothing: no power.');
    else if (how === 'sticks') session.react('It stays in, then springs back with a clack. This one sticks.');
  }

  update(dt: number): void {
    const dark = 1 - this.options.glow();
    // On the building's circuit: in a power cut the pilot is out too.
    this.pilot.color.copy(PILOT).multiplyScalar(mainsOn() ? 0.25 + 0.75 * dark : 0.02);
    this.pushed = Math.max(0, this.pushed - dt);
    this.knob.position.z = this.pushed > 0 ? 0.011 : 0.016;
  }
}
