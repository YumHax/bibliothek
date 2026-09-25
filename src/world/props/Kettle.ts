import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { KettleBoil } from '@/audio/kitchenSounds';
import { cylinderMesh, invisibleHitbox } from '../meshUtils';
import { Prop, part, matte } from './Prop';
import { Steam } from './Steam';

/** Seconds from a click to the boil; then the steam dies away over `COOL_SECONDS`. */
const BOIL_SECONDS = 12;
const COOL_SECONDS = 5;
/** The voice's pitch and loudness are re-aimed this often while it boils (s). */
const VOICE_EVERY = 0.2;

const STEEL = new THREE.MeshStandardMaterial({ color: 0xc4c7cb, metalness: 0.7, roughness: 0.35 });
const BLACK = matte(0x1e1f22, 0.6);

/**
 * A brushed-steel jug kettle on its base: spout to the right, handle to the left, a little blue
 * window on the side. A click switches it on: the switch glows, it hisses up to the boil
 * (`sound`, a `KettleBoil` the builder hands a `PointSound`), steam starts curling from the spout
 * and the lid rattles, then the thermostat clicks off and the steam dies away. A click while it
 * boils switches it off early. Worktop prop: base at local y = 0, front towards +z, never collides.
 */
export class Kettle extends Prop implements Interactable, Updatable {
  readonly hitboxes: THREE.Object3D[];
  /** Its voice, placed by the builder with a `PointSound` next to the kettle. */
  readonly sound = new KettleBoil();
  private readonly steam = new Steam({ count: 28 });
  private readonly led = new THREE.MeshStandardMaterial({ color: 0x2a2c30, emissive: 0x3aa0ff, emissiveIntensity: 0, roughness: 0.4 });
  private readonly lid = new THREE.Group();
  private boiling = false;
  /** 0 cold .. 1 at the boil. */
  private progress = 0;
  /** Seconds of steam left after it switched off. */
  private cooling = 0;
  private voiceIn = 0;
  private time = 0;

  constructor() {
    super();
    this.name = 'Kettle';
    this.add(cylinderMesh(0.085, 0.015, BLACK, { y: 0.0075 }, { segments: 24 }));
    this.add(cylinderMesh(0.075, 0.19, STEEL, { y: 0.015 + 0.095 }, { radiusBottom: 0.08, segments: 24 }));
    this.lid.position.y = 0.205;
    this.lid.add(cylinderMesh(0.055, 0.02, BLACK, { y: 0.01 }, { radiusBottom: 0.07, segments: 20 }));
    this.lid.add(cylinderMesh(0.012, 0.02, BLACK, { y: 0.03 }, { segments: 10 }));
    this.add(this.lid);
    // The spout leans out of the top right; the handle is a loop on the left, the switch at its foot.
    const spout = cylinderMesh(0.011, 0.13, STEEL, { x: 0.095, y: 0.17 }, { radiusBottom: 0.016, segments: 10 });
    spout.rotation.z = -0.55;
    this.add(spout);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.009, 8, 18, Math.PI), BLACK);
    handle.position.set(-0.078, 0.13, 0);
    handle.rotation.z = Math.PI / 2;
    handle.castShadow = true;
    this.add(handle);
    part(this, 0.022, 0.012, 0.018, this.led, { x: -0.098, y: 0.06 }).castShadow = false;
    part(this, 0.012, 0.09, 0.02, new THREE.MeshStandardMaterial({ color: 0x9ecbe8, roughness: 0.2, transparent: true, opacity: 0.8 }), { x: 0, y: 0.1, z: 0.075 }).castShadow = false;

    // The steam comes out of the spout's tip.
    const tip = 0.065;
    this.steam.position.set(0.095 + Math.sin(0.55) * tip, 0.17 + Math.cos(0.55) * tip, 0);
    this.add(this.steam);

    const hitbox = invisibleHitbox(0.3, 0.26, 0.2, { x: 0.01, y: 0.13 });
    this.hitboxes = [hitbox];
    this.add(hitbox);
  }

  update(dt: number): void {
    this.time += dt;
    if (this.boiling) {
      this.progress = Math.min(1, this.progress + dt / BOIL_SECONDS);
      if (this.progress >= 1) this.switchOff();
    } else if (this.cooling > 0) {
      this.cooling = Math.max(0, this.cooling - dt);
    }
    // Steam from halfway to the boil; after the click it thins out.
    this.steam.rate = this.boiling ? THREE.MathUtils.smoothstep(this.progress, 0.4, 1) : 0.7 * (this.cooling / COOL_SECONDS) * this.progress;
    this.steam.update(dt);
    // The lid rattles on its seat near the boil.
    const rattle = this.boiling ? THREE.MathUtils.smoothstep(this.progress, 0.8, 1) : 0;
    this.lid.position.y = 0.205 + rattle * 0.0015 * Math.abs(Math.sin(this.time * 47));
    this.lid.rotation.z = rattle * 0.012 * Math.sin(this.time * 31);
    if (this.boiling) {
      this.voiceIn -= dt;
      if (this.voiceIn <= 0) {
        this.voiceIn = VOICE_EVERY;
        this.sound.setBoiling(true, this.progress);
      }
    }
  }

  private switchOff(): void {
    this.boiling = false;
    this.cooling = COOL_SECONDS;
    this.led.emissiveIntensity = 0;
    this.sound.switchOff();
  }

  // --- Interactable -------------------------------------------------------------------------

  setHovered(_hovered: boolean): void {}

  label(): string {
    return this.boiling ? 'Click to switch the kettle off' : 'Click to boil the kettle';
  }

  activate(_session: SessionActions): void {
    if (this.boiling) {
      this.switchOff();
      return;
    }
    this.boiling = true;
    // Still hot from the last boil: it gets there quicker.
    this.progress = this.cooling > 0 ? Math.max(0.5, this.progress * 0.8) : 0;
    this.cooling = 0;
    this.voiceIn = 0;
    this.led.emissiveIntensity = 1.4;
  }
}
