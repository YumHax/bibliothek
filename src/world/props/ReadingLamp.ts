import * as THREE from 'three';
import { cylinderMesh, invisibleHitbox } from '../meshUtils';
import { SwitchableLamp } from './SwitchableLamp';

export interface ReadingLampOptions {
  /** Light intensity when on (a reading bulb: about a bedside lamp's). */
  intensity?: number;
  /** Starts lit? */
  on?: boolean;
  /** Colour of the enamelled shade. */
  shade?: number;
}

const BASE_R = 0.07;
const BASE_H = 0.025;
const STEM_H = 0.34;
const ARM_L = 0.2;
/** The arm leans out over the reader, the shade tips down at the end of it. */
const ARM_TILT = 0.95;
const SHADE_TIP = 0.75;
const SHADE_H = 0.11;
const SHADE_R = 0.07;
/** How far the light reaches: a pool round the chair, not into the hallway through the wall. */
const REACH = 3;
const BULB_GLOW = 2.2;
const HOVER_GLOW = 0.08;

const BRASS = new THREE.MeshStandardMaterial({ color: 0xc9a75b, metalness: 0.85, roughness: 0.3 });
const IRON = new THREE.MeshStandardMaterial({ color: 0x2b2b2e, metalness: 0.4, roughness: 0.5 });

/**
 * A reading lamp for a side table: a heavy iron base, a brass stem, an arm leaning out and an
 * enamelled cone shade tipped down at its end over the reader (+z), a bulb glowing in its mouth
 * and a cheap shadow-less point light of limited reach. Origin at the bottom of the base: place it
 * on whatever it stands on. Decoration on a table, so it never collides (see `Prop`). Clicking it
 * switches it.
 */
export class ReadingLamp extends SwitchableLamp {
  readonly options: Required<ReadingLampOptions>;
  readonly light: THREE.PointLight;
  readonly hitboxes: THREE.Object3D[];
  private readonly enamel: THREE.MeshStandardMaterial;
  private readonly bulb: THREE.MeshStandardMaterial;

  constructor(options: ReadingLampOptions = {}) {
    super('reading lamp');
    this.name = 'ReadingLamp';
    this.options = { intensity: 1.4, on: false, shade: 0x2f5446, ...options };

    const base = cylinderMesh(BASE_R, BASE_H, IRON, { y: BASE_H / 2 }, { radiusBottom: BASE_R * 1.05, segments: 24 });
    const stem = cylinderMesh(0.009, STEM_H, BRASS, { y: BASE_H + STEM_H / 2 }, { segments: 10 });
    const top = BASE_H + STEM_H;
    // The arm: from the stem's top, leaning out towards +z.
    const arm = cylinderMesh(0.007, ARM_L, BRASS, {}, { segments: 8 });
    arm.rotation.x = ARM_TILT;
    arm.position.set(0, top + (Math.cos(ARM_TILT) * ARM_L) / 2, (Math.sin(ARM_TILT) * ARM_L) / 2);
    const tip = new THREE.Vector3(0, top + Math.cos(ARM_TILT) * ARM_L, Math.sin(ARM_TILT) * ARM_L);

    // The shade hangs from the tip, its mouth tipped down and forward; the bulb and the light in the mouth.
    const head = new THREE.Group();
    head.position.copy(tip);
    head.rotation.x = -SHADE_TIP; // turns the mouth (-y) forward, towards +z
    this.enamel = new THREE.MeshStandardMaterial({ color: this.options.shade, roughness: 0.35, metalness: 0.1, side: THREE.DoubleSide, emissive: 0xffffff, emissiveIntensity: 0 });
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.02, SHADE_R, SHADE_H, 24, 1, true), this.enamel);
    shade.position.y = -SHADE_H / 2;
    this.bulb = new THREE.MeshStandardMaterial({ color: 0xfff4e0, emissive: 0xffe2b0, emissiveIntensity: 0, roughness: 0.3 });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.022, 14, 10), this.bulb);
    bulb.position.y = -SHADE_H + 0.03;
    head.add(shade, bulb);

    this.light = new THREE.PointLight(0xffd9a8, 0, REACH, 2);
    this.light.castShadow = false;
    this.light.position.copy(tip).add(new THREE.Vector3(0, -SHADE_H * 0.9, SHADE_H * 0.5));

    const hitbox = invisibleHitbox(SHADE_R * 2 + 0.04, top + 0.1, ARM_L + SHADE_R * 2, { y: (top + 0.1) / 2, z: (ARM_L * Math.sin(ARM_TILT)) / 2 });
    this.hitboxes = [hitbox];

    for (const m of [shade, bulb, arm, stem]) m.castShadow = false;
    this.add(base, stem, arm, head, this.light, hitbox);
    this.setOn(this.options.on);
  }

  protected render(on: boolean, hovered: boolean): void {
    this.light.intensity = on ? this.options.intensity : 0;
    this.bulb.emissiveIntensity = on ? BULB_GLOW : 0;
    this.enamel.emissiveIntensity = hovered ? HOVER_GLOW : 0;
  }
}
