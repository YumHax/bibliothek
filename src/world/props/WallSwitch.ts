import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { invisibleHitbox } from '../meshUtils';
import { Prop, part, matte } from './Prop';
import type { SwitchableLamp } from './SwitchableLamp';

export interface WallSwitchOptions {
  /** The lamp this switch drives (the room's pendant or flush light): clicking the switch toggles it. */
  lamp: SwitchableLamp;
  /** Colour of the plate. Default the doors' off-white. */
  plateColor?: number;
}

const PLATE = 0.086;
const PLATE_DEPTH = 0.009;
const ROCKER = 0.05;
const ROCKER_DEPTH = 0.007;
/** Tilt of the rocker about its horizontal axis: top pressed in when on, bottom when off. */
const ROCKER_TILT = 0.14;
const HOVER_GLOW = 0.25;

/**
 * A rocker light switch on a wall, by a door, at hand height: the everyday way to switch a room's
 * ceiling light without looking up at the fixture. It owns no light: it toggles the `SwitchableLamp`
 * it is given, so the lamp's own switch (clicking the shade) and this one stay in step. The rocker
 * is re-read from the lamp whenever the player looks at it. Wall-hung: origin at the centre of
 * the plate on the wall, +z into the room. Decoration: never collides.
 */
export class WallSwitch extends Prop implements Interactable {
  readonly hitboxes: THREE.Object3D[];
  private readonly lamp: SwitchableLamp;
  private readonly rocker: THREE.Mesh;
  private readonly rockerMat: THREE.MeshStandardMaterial;

  constructor(options: WallSwitchOptions) {
    super();
    this.name = 'WallSwitch';
    this.lamp = options.lamp;
    const plate = matte(options.plateColor ?? 0xf1ede6, 0.5);
    part(this, PLATE, PLATE, PLATE_DEPTH, plate, { z: PLATE_DEPTH / 2 }).castShadow = false;
    this.rockerMat = new THREE.MeshStandardMaterial({ color: 0xf6f3ee, roughness: 0.35, emissive: 0xfff1d6, emissiveIntensity: 0 });
    this.rocker = part(this, ROCKER, ROCKER, ROCKER_DEPTH, this.rockerMat, {});
    this.rocker.castShadow = false;
    this.rocker.position.z = PLATE_DEPTH + ROCKER_DEPTH / 2;
    // Two screw heads either side of the rocker.
    const screw = matte(0xc9c4ba, 0.4);
    for (const dx of [-PLATE * 0.38, PLATE * 0.38]) part(this, 0.006, 0.006, 0.002, screw, { x: dx, z: PLATE_DEPTH + 0.001 }).castShadow = false;
    const hitbox = invisibleHitbox(PLATE + 0.04, PLATE + 0.04, 0.05, { z: 0.025 });
    this.hitboxes = [hitbox];
    this.add(hitbox);
    this.sync();
  }

  /** Tips the rocker the way the lamp's state says. */
  private sync(): void {
    this.rocker.rotation.x = this.lamp.isOn ? -ROCKER_TILT : ROCKER_TILT;
  }

  setHovered(hovered: boolean): void {
    this.rockerMat.emissiveIntensity = hovered ? HOVER_GLOW : 0;
    this.sync();
  }

  label(): string {
    this.sync();
    return this.lamp.isOn ? 'Click to switch the light off' : 'Click to switch the light on';
  }

  activate(_session: SessionActions): void {
    this.lamp.toggle();
    this.sync();
  }
}
