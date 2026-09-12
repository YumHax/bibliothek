import * as THREE from 'three';
import { cylinderMesh, invisibleHitbox } from '../meshUtils';
import { matte } from './Prop';
import { SwitchableLamp } from './SwitchableLamp';

export interface FlushLampOptions {
  /** Radius of the ceiling plate. Default 0.17. */
  radius?: number;
  /** Starts lit? Default true (it usually hangs where there is no window). */
  on?: boolean;
  /** Called with the new state on every switch, right away with the initial state: wire the room's light here. */
  onSwitch?: (on: boolean) => void;
}

const DOME_GLOW = 1.4;
const HOVER_GLOW = 0.3;
const PLATE = matte(0xf6f3ee, 0.7);

/**
 * A flush ceiling fixture: a plate against the ceiling and a frosted half-dome under it. The
 * visible fixture of a `Room`'s ceiling lamp in a corridor or a bathroom, where a pendant would
 * be in the way. Origin at the ceiling; hangs down along -y; casts nothing so the room's point
 * light shines through it. Clicking it switches it: the dome's glow follows here, the real light
 * is whoever listens to `onSwitch` (the `Room`).
 */
export class FlushLamp extends SwitchableLamp {
  readonly hitboxes: THREE.Object3D[];
  private readonly glass: THREE.MeshStandardMaterial;
  private readonly onSwitch?: (on: boolean) => void;

  constructor(options: FlushLampOptions = {}) {
    super('ceiling light');
    this.name = 'FlushLamp';
    this.onSwitch = options.onSwitch;
    const radius = options.radius ?? 0.17;
    const domeRadius = radius * 0.76;

    const plate = cylinderMesh(radius, 0.03, PLATE, { y: -0.015 }, { segments: 24 });
    this.glass = new THREE.MeshStandardMaterial({ color: 0xfff6e6, emissive: 0xffe3b4, emissiveIntensity: 0, roughness: 0.4 });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(domeRadius, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), this.glass);
    dome.position.y = -0.03;
    const hitbox = invisibleHitbox(radius * 2 + 0.04, domeRadius + 0.08, radius * 2 + 0.04, { y: -domeRadius / 2 - 0.02 });
    this.hitboxes = [hitbox];
    for (const m of [plate, dome]) m.castShadow = false;
    this.add(plate, dome, hitbox);
    this.setOn(options.on ?? true);
  }

  override setOn(on: boolean): void {
    super.setOn(on);
    this.onSwitch?.(on);
  }

  protected render(on: boolean, hovered: boolean): void {
    this.glass.emissiveIntensity = (on ? DOME_GLOW : 0) + (hovered ? HOVER_GLOW : 0);
  }
}
