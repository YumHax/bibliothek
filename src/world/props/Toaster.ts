import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { ToasterSound } from '@/audio/kitchenSounds';
import { cylinderMesh, invisibleHitbox } from '../meshUtils';
import { Prop, part, matte } from './Prop';

/** Seconds the slices stay down. */
const TOAST_SECONDS = 8;
/** How far the slices sink into the slots, and how fast the lever and the pop move (s). */
const SINK = 0.085;
const PRESS_SECONDS = 0.15;
const POP_SECONDS = 0.35;

const STEEL = new THREE.MeshStandardMaterial({ color: 0xc4c7cb, metalness: 0.7, roughness: 0.35 });
const BLACK = matte(0x1e1f22, 0.6);
const BREAD = new THREE.Color(0xe8d2a4);
const TOAST = new THREE.Color(0xc48a4a);

/**
 * A two-slot steel toaster with two slices standing in it, the lever and browning dial on its
 * front. A click pushes the lever down: the slices sink, the slots glow orange, the timer ticks
 * (`sound`, a `ToasterSound` the builder hands a `PointSound`), and after a few seconds the spring
 * throws them back up, browner. A click while it toasts pops them early. Worktop prop: base at
 * local y = 0, front towards +z, never collides.
 */
export class Toaster extends Prop implements Interactable, Updatable {
  readonly hitboxes: THREE.Object3D[];
  /** Its voice, placed by the builder with a `PointSound` next to the toaster. */
  readonly sound = new ToasterSound();
  private readonly slices = new THREE.Group();
  private readonly lever = new THREE.Group();
  private readonly crumb = matte(BREAD.getHex(), 0.9);
  private readonly glow = new THREE.MeshStandardMaterial({ color: 0x0b0b0d, emissive: 0xff5a1a, emissiveIntensity: 0, roughness: 0.9 });
  private toasting = false;
  private left = 0;
  /** 0 up .. 1 down; eased towards `down`. */
  private depth = 0;
  /** Seconds since the pop, for the overshoot of the spring (-1 when settled). */
  private sincePop = -1;
  /** 0 pale bread .. 1 golden toast. */
  private brown = 1;

  constructor() {
    super();
    this.name = 'Toaster';
    const w = 0.27;
    const h = 0.17;
    const d = 0.16;
    const feet = 0.01; // the body stands this far up on four rubber feet
    part(this, w, h, d, STEEL, { y: feet + h / 2 });
    part(this, w - 0.02, 0.01, d - 0.02, BLACK, { y: feet + h + 0.005 }).castShadow = false;
    for (const dz of [-0.03, 0.03]) part(this, 0.15, 0.004, 0.022, this.glow, { y: feet + h + 0.011, z: dz }).castShadow = false;
    // Two slices standing in the slots; they sink into the body while toasting.
    this.slices.position.y = feet + h + 0.03;
    for (const dz of [-0.03, 0.03]) part(this.slices, 0.11, 0.1, 0.012, this.crumb, { z: dz });
    this.add(this.slices);
    this.crumb.color.copy(TOAST);
    // Front: the lever on its slot, and the dial.
    part(this, 0.008, 0.06, 0.004, matte(0x0b0b0d, 0.9), { x: w / 2 - 0.035, y: feet + h * 0.6, z: d / 2 + 0.002 }).castShadow = false;
    this.lever.position.set(w / 2 - 0.035, feet + h * 0.74, d / 2 + 0.01);
    part(this.lever, 0.03, 0.012, 0.016, BLACK);
    this.add(this.lever);
    const dial = cylinderMesh(0.014, 0.012, BLACK, { x: w / 2 - 0.035, y: feet + h * 0.28, z: d / 2 + 0.006 }, { segments: 14 });
    dial.rotation.x = Math.PI / 2;
    this.add(dial);
    for (const dz of [-0.05, 0.05]) for (const dx of [-0.1, 0.1]) this.add(cylinderMesh(0.01, feet, BLACK, { x: dx, y: feet / 2, z: dz }, { segments: 8 }));

    const hitbox = invisibleHitbox(w + 0.02, h + 0.1, d + 0.04, { y: feet + (h + 0.1) / 2 });
    this.hitboxes = [hitbox];
    this.add(hitbox);
  }

  update(dt: number): void {
    if (this.toasting) {
      this.left -= dt;
      this.depth = Math.min(1, this.depth + dt / PRESS_SECONDS);
      this.brown = Math.min(1, this.brown + dt / TOAST_SECONDS);
      this.crumb.color.copy(BREAD).lerp(TOAST, this.brown);
      this.glow.emissiveIntensity = Math.min(1.6, this.glow.emissiveIntensity + dt * 1.2);
      if (this.left <= 0) this.pop();
    } else if (this.depth > 0 || this.sincePop >= 0) {
      this.depth = Math.max(0, this.depth - dt / POP_SECONDS * 3);
      this.sincePop += dt;
      if (this.sincePop > POP_SECONDS * 2) this.sincePop = -1;
      this.glow.emissiveIntensity = Math.max(0, this.glow.emissiveIntensity - dt * 2);
    }
    // Down in the slots; thrown up past the rest on the pop, then settling.
    const bounce = this.sincePop >= 0 ? Math.sin(Math.min(1, this.sincePop / POP_SECONDS) * Math.PI) * 0.025 : 0;
    this.slices.position.y = 0.21 - SINK * THREE.MathUtils.smoothstep(this.depth, 0, 1) + bounce;
    this.lever.position.y = 0.01 + 0.17 * THREE.MathUtils.lerp(0.74, 0.46, this.depth);
  }

  private pop(): void {
    this.toasting = false;
    this.sincePop = 0;
    this.sound.pop();
  }

  // --- Interactable -------------------------------------------------------------------------

  setHovered(_hovered: boolean): void {}

  label(): string {
    return this.toasting ? 'Click to pop the toast' : 'Click to make toast';
  }

  activate(_session: SessionActions): void {
    if (this.toasting) {
      this.pop();
      return;
    }
    this.toasting = true;
    this.left = TOAST_SECONDS;
    this.brown = 0; // fresh slices
    this.sincePop = -1;
    this.sound.press();
    this.sound.setTicking(true);
  }
}
