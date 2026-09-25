import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { RadioVoice } from '@/audio/kitchenSounds';
import { cylinderMesh, invisibleHitbox } from '../meshUtils';
import { Prop, part, matte } from './Prop';

export interface RadioOptions {
  /** Body colour. Default a cream enamel. */
  color?: number;
}

const W = 0.22;
const H = 0.13;
const D = 0.08;
const CHROME = new THREE.MeshStandardMaterial({ color: 0xd4d6d9, metalness: 0.85, roughness: 0.25 });
const GRILLE = matte(0x3b352e, 0.8);

/**
 * A little retro radio for the worktop: cream body with rounded chrome trim, a slatted speaker
 * grille on the left, the tuning dial on the right behind glass, two knobs, a carrying handle and
 * a telescopic aerial. A click switches it on or off: the dial lights up amber and it plays the
 * `RadioTune` stream (`sound`, a `RadioVoice` the builder hands a `PointSound`, so it fades with
 * distance and walls). Worktop prop: base at local y = 0, front towards +z, never collides.
 */
export class Radio extends Prop implements Interactable {
  readonly hitboxes: THREE.Object3D[];
  /** Its voice, placed by the builder with a `PointSound` at the speaker. */
  readonly sound = new RadioVoice();
  private readonly dial = new THREE.MeshStandardMaterial({ color: 0xe9dcb8, emissive: 0xffb347, emissiveIntensity: 0, roughness: 0.4 });

  constructor(options: RadioOptions = {}) {
    super();
    this.name = 'Radio';
    const body = matte(options.color ?? 0xefe4c8, 0.45);
    part(this, W, H, D, body, { y: 0.008 + H / 2 });
    for (const dx of [-W / 2 + 0.02, W / 2 - 0.02]) part(this, 0.02, 0.008, D - 0.02, matte(0x1e1f22, 0.7), { x: dx, y: 0.004 }).castShadow = false;
    // Chrome trim round the front face.
    const front = D / 2 + 0.002;
    for (const dy of [0.012, H + 0.004]) part(this, W, 0.006, 0.004, CHROME, { y: dy, z: front }).castShadow = false;
    // The grille: dark slats on the left.
    const grilleW = W * 0.5;
    const gx = -W / 2 + 0.015 + grilleW / 2;
    part(this, grilleW, H - 0.035, 0.002, GRILLE, { x: gx, y: 0.008 + H / 2, z: front }).castShadow = false;
    for (let i = 0; i < 7; i++) part(this, grilleW, 0.003, 0.004, CHROME, { x: gx, y: 0.03 + i * 0.014, z: front + 0.001 }).castShadow = false;
    // The dial: a lit strip with tick marks and a red needle, under glass.
    const dx = W / 2 - 0.015 - (W * 0.36) / 2;
    part(this, W * 0.36, 0.035, 0.002, this.dial, { x: dx, y: 0.008 + H * 0.66, z: front }).castShadow = false;
    for (let i = 0; i < 9; i++) part(this, 0.001, 0.008, 0.001, matte(0x3b352e, 0.8), { x: dx - W * 0.16 + i * W * 0.04, y: 0.008 + H * 0.66 + 0.008, z: front + 0.0015 }).castShadow = false;
    part(this, 0.0015, 0.03, 0.001, matte(0xc0392b, 0.5), { x: dx + 0.01, y: 0.008 + H * 0.66, z: front + 0.002 }).castShadow = false;
    // Two knobs under the dial.
    for (const k of [-1, 1]) {
      const knob = cylinderMesh(0.012, 0.014, CHROME, { x: dx + k * 0.022, y: 0.008 + H * 0.3, z: front + 0.007 }, { segments: 14 });
      knob.rotation.x = Math.PI / 2;
      this.add(knob);
    }
    // The handle on top and the aerial leaning back.
    for (const hx of [-W / 2 + 0.03, W / 2 - 0.03]) this.add(cylinderMesh(0.004, 0.025, CHROME, { x: hx, y: 0.008 + H + 0.0125 }, { segments: 8 }));
    const bar = cylinderMesh(0.005, W - 0.06, CHROME, { y: 0.008 + H + 0.025 }, { segments: 8 });
    bar.rotation.z = Math.PI / 2;
    this.add(bar);
    const aerial = cylinderMesh(0.002, 0.3, CHROME, { x: W / 2 - 0.02, y: 0.008 + H + 0.14, z: -0.03 }, { radiusBottom: 0.003, segments: 6 });
    aerial.rotation.set(-0.35, 0, -0.3);
    aerial.castShadow = false;
    this.add(aerial);

    const hitbox = invisibleHitbox(W + 0.02, H + 0.05, D + 0.03, { y: (H + 0.05) / 2 });
    this.hitboxes = [hitbox];
    this.add(hitbox);
  }

  // --- Interactable -------------------------------------------------------------------------

  setHovered(_hovered: boolean): void {}

  label(): string {
    return this.sound.isOn ? 'Click to switch the radio off' : 'Click to switch the radio on';
  }

  activate(_session: SessionActions): void {
    const on = !this.sound.isOn;
    this.sound.setOn(on);
    this.dial.emissiveIntensity = on ? 0.9 : 0;
  }
}
