import * as THREE from 'three';
import { cylinderMesh, invisibleHitbox } from '../meshUtils';
import { matte } from './Prop';
import { SwitchableLamp } from './SwitchableLamp';

export interface IndustrialPendantOptions {
  /** Length of the cord from the ceiling to the top of the shade. Default 0.9. */
  drop?: number;
  /** Enamel colour of the shade. Default a dark green. */
  color?: number;
  /** Intensity of the lamp's own (shadow-less) point light. Default 6. */
  intensity?: number;
  /** Starts lit? Default true. */
  on?: boolean;
  /** Called with the new state on every switch, right away with the initial state: chain the other pendants and the room's light here. */
  onSwitch?: (on: boolean) => void;
}

const SHADE_R = 0.24;
const SHADE_TOP_R = 0.045;
const SHADE_H = 0.2;
const SEGMENTS = 28;
const INNER_GLOW = 1.1;
const BULB_GLOW = 2.6;
const HOVER_GLOW = 0.3;

const CORD = matte(0x1e1c1a, 0.8);
const CAP = new THREE.MeshStandardMaterial({ color: 0x3a3632, roughness: 0.4, metalness: 0.6 });

/**
 * A factory pendant: a long cord, a wide enamelled cone with a white inside, a bare bulb at its
 * mouth, and its own cheap point light so it pools light on what stands under it. The room's
 * shadow-casting lamp stays the `Room`'s; a builder chains a row of these to it through `onSwitch`.
 * Origin at the ceiling, hangs down -y. Clicking the shade switches it. Decoration: never collides.
 */
export class IndustrialPendant extends SwitchableLamp {
  readonly hitboxes: THREE.Object3D[];
  readonly light: THREE.PointLight;
  private readonly intensity: number;
  private readonly inner: THREE.MeshStandardMaterial;
  private readonly bulb: THREE.MeshStandardMaterial;
  private readonly onSwitch?: (on: boolean) => void;

  constructor(options: IndustrialPendantOptions = {}) {
    super('lamp');
    this.name = 'IndustrialPendant';
    this.onSwitch = options.onSwitch;
    this.intensity = options.intensity ?? 6;
    const drop = options.drop ?? 0.9;
    const enamel = new THREE.MeshStandardMaterial({ color: options.color ?? 0x2f4f3f, roughness: 0.35, metalness: 0.25 });

    const rose = cylinderMesh(0.05, 0.02, CAP, { y: -0.01 }, { segments: 16 });
    const cord = cylinderMesh(0.005, drop, CORD, { y: -drop / 2 }, { segments: 6 });
    const cap = cylinderMesh(SHADE_TOP_R, 0.04, CAP, { y: -drop - 0.02 }, { segments: 16 });
    const shadeY = -drop - 0.04 - SHADE_H / 2;
    const outer = new THREE.Mesh(new THREE.CylinderGeometry(SHADE_TOP_R, SHADE_R, SHADE_H, SEGMENTS, 1, true), enamel);
    outer.position.y = shadeY;
    this.inner = new THREE.MeshStandardMaterial({ color: 0xfaf6ee, roughness: 0.8, side: THREE.BackSide, emissive: 0xffe6c0, emissiveIntensity: 0 });
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(SHADE_TOP_R - 0.004, SHADE_R - 0.004, SHADE_H, SEGMENTS, 1, true), this.inner);
    inner.position.y = shadeY;
    this.bulb = new THREE.MeshStandardMaterial({ color: 0xfff4e0, emissive: 0xffe2b0, emissiveIntensity: 0, roughness: 0.3 });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), this.bulb);
    bulb.position.y = shadeY - SHADE_H / 2 + 0.05;

    this.light = new THREE.PointLight(0xffd9a8, 0, 0, 2);
    this.light.position.y = bulb.position.y - 0.02;
    this.light.castShadow = false;

    const hitbox = invisibleHitbox(SHADE_R * 2 + 0.04, SHADE_H + 0.1, SHADE_R * 2 + 0.04, { y: shadeY });
    this.hitboxes = [hitbox];
    for (const m of [rose, cord, cap, outer, inner, bulb]) {
      m.castShadow = false;
      m.receiveShadow = true;
    }
    this.add(rose, cord, cap, outer, inner, bulb, this.light, hitbox);
    this.setOn(options.on ?? true);
  }

  override setOn(on: boolean): void {
    super.setOn(on);
    this.onSwitch?.(on);
  }

  protected render(on: boolean, hovered: boolean): void {
    this.light.intensity = on ? this.intensity : 0;
    this.inner.emissiveIntensity = (on ? INNER_GLOW : 0) + (hovered ? HOVER_GLOW : 0);
    this.bulb.emissiveIntensity = on ? BULB_GLOW : hovered ? HOVER_GLOW : 0;
  }
}
