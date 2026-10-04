import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { invisibleHitbox } from '../meshUtils';
import { paint } from '../materials/palette';
import { Prop, part } from './Prop';
import type { SwitchableLamp } from './SwitchableLamp';
import { HoverGlint } from './hoverGlint';
import { playRockerClick } from '@/audio/furnitureSounds';

interface WallSwitchOptions {
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
  /** The rocker is what glints on hover. */
  private readonly glint: HoverGlint;

  constructor(options: WallSwitchOptions) {
    super();
    this.name = 'WallSwitch';
    this.lamp = options.lamp;
    const plate = paint(options.plateColor ?? 0xf1ede6, 0.5);
    part(this, PLATE, PLATE, PLATE_DEPTH, plate, { z: PLATE_DEPTH / 2 }).castShadow = false;
    this.rocker = part(this, ROCKER, ROCKER, ROCKER_DEPTH, paint(0xf6f3ee, 0.35), {});
    this.glint = HoverGlint.of(this.rocker);
    this.rocker.castShadow = false;
    this.rocker.position.z = PLATE_DEPTH + ROCKER_DEPTH / 2;
    // Two screw heads either side of the rocker.
    const screw = paint(0xc9c4ba, 0.4);
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
    this.glint.set(hovered);
    this.sync();
  }

  label(): string {
    this.sync();
    return `Light switch · switch ${this.lamp.isOn ? 'off' : 'on'}`;
  }

  activate(_session: SessionActions): void {
    playRockerClick();
    this.lamp.toggle();
    this.sync();
  }
}
