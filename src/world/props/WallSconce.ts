import * as THREE from 'three';
import { cylinderMesh, invisibleHitbox } from '../meshUtils';
import { part } from './Prop';
import { SwitchableLamp } from './SwitchableLamp';

export interface WallSconceOptions {
  /** Intensity of its (shadow-less) spot. Default 2.5. */
  intensity?: number;
  /** How far the spot reaches, metres; it fades out to nothing there. Default 1.4. */
  reach?: number;
  /** Starts lit? Default true. */
  on?: boolean;
  /** Called with the new state on every switch, right away with the initial state. */
  onSwitch?: (on: boolean) => void;
}

/** Half-angle of the spot's cone; the axis leans out from the wall by the same angle, so the cone never reaches behind the wall. */
const CONE = 0.5;
const ARM = 0.13;
const SHADE_Y = -0.02;
const SHADE_R = 0.065;
const SHADE_H = 0.11;
const GLOW = 1.2;
const HOVER_GLOW = 0.3;

const BRASS = new THREE.MeshStandardMaterial({ color: 0xb8955a, metalness: 0.85, roughness: 0.35 });

/**
 * A brass wall light: a round back plate, a swan-neck arm and an opal tulip shade opening down,
 * with a warm, cheap spot (no shadow) pooling on the wall and the floor under it. Lights ignore
 * walls, so the spot is kept off the wall behind (its cone leans out) and short (`reach`), so it
 * does not light the next room through the one opposite. It exists from the start, like every
 * light (switching only dims it). Wall-hung: origin at the plate's centre on the wall, +z into
 * the room. Clicking the shade switches it. Decoration: never collides.
 */
export class WallSconce extends SwitchableLamp {
  readonly hitboxes: THREE.Object3D[];
  readonly light: THREE.SpotLight;
  private readonly intensity: number;
  private readonly opal: THREE.MeshStandardMaterial;
  private readonly onSwitch?: (on: boolean) => void;

  constructor(options: WallSconceOptions = {}) {
    super('wall light');
    this.name = 'WallSconce';
    this.onSwitch = options.onSwitch;
    this.intensity = options.intensity ?? 2.5;

    const plate = cylinderMesh(0.045, 0.012, BRASS, { z: 0.006 }, { segments: 20 });
    plate.rotation.x = Math.PI / 2;
    // The arm: out from the plate, then a bend down to the shade's collar.
    const arm = cylinderMesh(0.006, ARM, BRASS, { y: 0.04, z: ARM / 2 }, { segments: 8 });
    arm.rotation.x = Math.PI / 2;
    const drop = cylinderMesh(0.006, 0.05, BRASS, { y: 0.015, z: ARM }, { segments: 8 });
    const collar = cylinderMesh(0.018, 0.02, BRASS, { y: SHADE_Y + SHADE_H / 2 + 0.005, z: ARM }, { segments: 12 });
    part(this, 0.012, 0.03, 0.012, BRASS, { y: 0.04, z: 0.012 });
    this.opal = new THREE.MeshStandardMaterial({ color: 0xf8f2e6, emissive: 0xffdcaa, emissiveIntensity: 0, roughness: 0.5, side: THREE.DoubleSide });
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.02, SHADE_R, SHADE_H, 20, 1, true), this.opal);
    shade.position.set(0, SHADE_Y, ARM);
    for (const m of [plate, arm, drop, collar, shade]) {
      m.castShadow = false;
      m.receiveShadow = false;
    }
    this.add(plate, arm, drop, collar, shade);

    this.light = new THREE.SpotLight(0xffd9a8, 0, options.reach ?? 1.4, CONE, 0.7, 2);
    this.light.castShadow = false;
    this.light.position.set(0, SHADE_Y - SHADE_H * 0.2, ARM);
    this.light.target.position.set(0, this.light.position.y - Math.cos(CONE), ARM + Math.sin(CONE));
    this.add(this.light, this.light.target);

    const hitbox = invisibleHitbox(SHADE_R * 2 + 0.04, SHADE_H + 0.12, ARM + SHADE_R + 0.03, { y: SHADE_Y + 0.03, z: (ARM + SHADE_R + 0.03) / 2 });
    this.hitboxes = [hitbox];
    this.add(hitbox);
    this.setOn(options.on ?? true);
  }

  override setOn(on: boolean): void {
    super.setOn(on);
    this.onSwitch?.(on);
  }

  protected render(on: boolean, hovered: boolean): void {
    this.light.intensity = on ? this.intensity : 0;
    this.opal.emissiveIntensity = (on ? GLOW : 0) + (hovered ? HOVER_GLOW : 0);
  }
}
