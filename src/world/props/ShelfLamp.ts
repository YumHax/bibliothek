import * as THREE from 'three';
import { cylinderMesh, invisibleHitbox } from '../meshUtils';
import { SwitchableLamp } from './SwitchableLamp';

export interface ShelfLampOptions {
  /** Horizontal distance from the fixture to the bookcase face (m); the bookcase lies along local -z. */
  throwDistance: number;
  /** World height of the aiming point on the bookcase face (m); the fixture hangs from the ceiling at local y = 0. */
  aimHeight: number;
  /** Ceiling height (m), to express `aimHeight` in the fixture's frame. */
  ceilingHeight: number;
  /** Light intensity when on. */
  intensity?: number;
  /** Starts lit? */
  on?: boolean;
}

const METAL = 0x2e2b28;
const CANOPY_RADIUS = 0.05;
const STEM_LENGTH = 0.1;
const CAN_RADIUS = 0.045;
const CAN_LENGTH = 0.14;
const LENS_GLOW = 2.5;
const HOVER_GLOW = 0.35;

/**
 * A ceiling spot for one bookcase: a dark canopy and stem hanging from the ceiling, and a can
 * swivelled towards the covers with a warm spot inside — the whole face gets lit, top row to
 * bottom row. Local origin is the ceiling attachment point; the bookcase is `throwDistance`
 * away along local -z. Overhead, so it never collides (empty footprint, see `Prop`). Clicking
 * the can switches it. Owned by `Shelving`, one per bookcase, kept across rebuilds so a
 * switched-off spot stays off.
 */
export class ShelfLamp extends SwitchableLamp {
  readonly options: Required<ShelfLampOptions>;
  readonly light: THREE.SpotLight;
  readonly hitboxes: THREE.Object3D[];
  private readonly metal: THREE.MeshStandardMaterial;
  private readonly lens: THREE.MeshStandardMaterial;

  constructor(options: ShelfLampOptions) {
    super('shelf spot');
    this.name = 'ShelfLamp';
    this.options = { intensity: 25, on: true, ...options };
    const { throwDistance, aimHeight, ceilingHeight, intensity } = this.options;

    this.metal = new THREE.MeshStandardMaterial({ color: METAL, roughness: 0.4, metalness: 0.7, emissive: 0x6a6258, emissiveIntensity: 0 });

    const canopy = cylinderMesh(CANOPY_RADIUS, 0.015, this.metal, { y: -0.0075 }, { segments: 24 });
    const stem = cylinderMesh(0.008, STEM_LENGTH, this.metal, { y: -0.015 - STEM_LENGTH / 2 }, { segments: 10 });

    // The can pivots at the bottom of the stem and points at the aiming spot on the bookcase.
    const pivot = new THREE.Vector3(0, -0.015 - STEM_LENGTH, 0);
    const aim = new THREE.Vector3(0, aimHeight - ceilingHeight, -throwDistance);
    const direction = aim.clone().sub(pivot).normalize();
    const can = new THREE.Group();
    can.position.copy(pivot);
    can.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction); // can's local +z looks at the target
    const body = cylinderMesh(CAN_RADIUS, CAN_LENGTH, this.metal, { z: CAN_LENGTH / 2 - 0.02 }, { radiusBottom: CAN_RADIUS * 0.85, segments: 24 });
    body.rotation.x = Math.PI / 2;
    this.lens = new THREE.MeshStandardMaterial({ color: 0xfff3dc, emissive: 0xffe2b0, emissiveIntensity: LENS_GLOW, roughness: 0.3 });
    const lens = new THREE.Mesh(new THREE.CircleGeometry(CAN_RADIUS * 0.8, 24), this.lens);
    lens.position.z = CAN_LENGTH - 0.02 + 0.002;
    lens.castShadow = false;
    can.add(body, lens);

    // Same beam as the room's former automatic shelf spots: it covers the whole bookcase face.
    this.light = new THREE.SpotLight(0xfff1dc, intensity, 6, Math.PI / 5, 0.5, 1.5);
    this.light.position.copy(pivot).addScaledVector(direction, CAN_LENGTH);
    this.light.target.position.copy(aim);
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(1024, 1024);
    this.light.shadow.camera.near = 0.2;
    this.light.shadow.camera.far = 6;
    this.light.shadow.bias = -0.0002;
    this.light.shadow.normalBias = 0.02;

    const hitbox = invisibleHitbox(0.22, 0.28, 0.22);
    hitbox.position.copy(pivot).addScaledVector(direction, CAN_LENGTH / 2).add(new THREE.Vector3(0, 0.04, 0));
    this.hitboxes = [hitbox];

    this.add(canopy, stem, can, this.light, this.light.target, hitbox);
    this.setOn(this.options.on);
  }

  protected render(on: boolean, hovered: boolean): void {
    this.light.intensity = on ? this.options.intensity : 0;
    this.lens.emissiveIntensity = on ? LENS_GLOW : 0;
    this.metal.emissiveIntensity = hovered ? HOVER_GLOW : 0;
  }
}
