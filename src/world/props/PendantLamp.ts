import * as THREE from 'three';
import { cylinderMesh, invisibleHitbox } from '../meshUtils';
import { matte } from './Prop';
import { SwitchableLamp } from './SwitchableLamp';

export interface PendantLampOptions {
  /** Total hang from the ceiling to the bottom rim of the shade (m). */
  dropLength?: number;
  /** Starts lit? */
  on?: boolean;
  /** Called with the new state on every switch, right away with the initial state: wire the room's light here. */
  onSwitch?: (on: boolean) => void;
}

const SEGMENTS = 32;
const CANOPY_RADIUS = 0.06;
const CANOPY_HEIGHT = 0.02;
const SHADE_TOP_RADIUS = 0.1;
const SHADE_BOTTOM_RADIUS = 0.24;
const SHADE_HEIGHT = 0.22;
/** The bulb hangs in the upper part of the cone: this far above the shade's bottom rim. */
const BULB_ABOVE_RIM = 0.13;
const BULB_RADIUS = 0.03;
/** Default hang chosen so the bulb centre lands at y = -0.2, where `Room` puts its ceiling lamp. */
const DEFAULT_DROP = 0.2 + BULB_ABOVE_RIM;
/** Emissive levels while lit: light bleeding through the fabric, the bulb, the diffuser disc. */
const FABRIC_GLOW = 0.2;
const BULB_GLOW = 3;
const DIFFUSER_GLOW = 1.2;
const HOVER_GLOW = 0.3;

const BRUSHED_METAL = new THREE.MeshStandardMaterial({ color: 0xb9b3a8, roughness: 0.35, metalness: 0.8 });
const CORD = matte(0x2a2623, 0.8);

/**
 * The visible fixture for the room's ceiling lamp: canopy, cord and a conical fabric shade with a
 * glowing bulb and a diffuser disc closing its bottom. Local origin is the ceiling attachment
 * point; the lamp hangs down along -y. Nothing here casts a shadow, so the room's point light
 * (meant to sit at `bulbOffset`, inside the shade) still lights the whole room. Overhead, so it
 * never collides (empty footprint, see `Prop`). Clicking the shade switches it: the fixture's glow
 * follows here, the actual light is whoever listens to `onSwitch` (the `Room`).
 */
export class PendantLamp extends SwitchableLamp {
  readonly options: Required<Omit<PendantLampOptions, 'onSwitch'>> & Pick<PendantLampOptions, 'onSwitch'>;
  /** Local y of the bulb centre; the room's light should be placed here. */
  readonly bulbOffset: number;
  readonly hitboxes: THREE.Object3D[];
  private readonly fabric: THREE.MeshStandardMaterial;
  private readonly bulb: THREE.MeshStandardMaterial;
  private readonly diffuser: THREE.MeshStandardMaterial;

  constructor(options: PendantLampOptions = {}) {
    super('ceiling light');
    this.name = 'PendantLamp';
    this.options = { dropLength: DEFAULT_DROP, on: false, ...options };
    const rim = -this.options.dropLength;
    this.bulbOffset = rim + BULB_ABOVE_RIM;

    const canopy = cylinderMesh(CANOPY_RADIUS, CANOPY_HEIGHT, BRUSHED_METAL, { y: -CANOPY_HEIGHT / 2 }, { segments: SEGMENTS });
    const cordLength = Math.max(0.01, -this.bulbOffset - CANOPY_HEIGHT);
    const cord = cylinderMesh(0.004, cordLength, CORD, { y: -CANOPY_HEIGHT - cordLength / 2 }, { segments: 8 });
    const socket = cylinderMesh(0.014, 0.035, BRUSHED_METAL, { y: this.bulbOffset + BULB_RADIUS + 0.012 }, { radiusBottom: 0.012, segments: 12 });

    this.bulb = new THREE.MeshStandardMaterial({ color: 0xfff4e0, emissive: 0xffe2b0, emissiveIntensity: BULB_GLOW, roughness: 0.3 });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(BULB_RADIUS, 16, 12), this.bulb);
    bulb.position.y = this.bulbOffset;

    this.fabric = new THREE.MeshStandardMaterial({ color: 0xf2ead9, roughness: 1, side: THREE.DoubleSide, emissive: 0xffe2b0, emissiveIntensity: FABRIC_GLOW });
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(SHADE_TOP_RADIUS, SHADE_BOTTOM_RADIUS, SHADE_HEIGHT, SEGMENTS, 1, true), this.fabric);
    shade.position.y = rim + SHADE_HEIGHT / 2;
    shade.receiveShadow = true;

    this.diffuser = new THREE.MeshStandardMaterial({ color: 0xfff6e8, emissive: 0xffe9c9, emissiveIntensity: DIFFUSER_GLOW, roughness: 1, side: THREE.DoubleSide });
    const diffuser = new THREE.Mesh(new THREE.CircleGeometry(SHADE_BOTTOM_RADIUS - 0.005, SEGMENTS), this.diffuser);
    diffuser.rotation.x = -Math.PI / 2;
    diffuser.position.y = rim + 0.003;

    // Around the shade, so looking up at it from anywhere below works.
    const hitbox = invisibleHitbox(SHADE_BOTTOM_RADIUS * 2 + 0.04, SHADE_HEIGHT + 0.06, SHADE_BOTTOM_RADIUS * 2 + 0.04, { y: rim + SHADE_HEIGHT / 2 });
    this.hitboxes = [hitbox];

    for (const m of [shade, diffuser, bulb, socket, cord]) m.castShadow = false;
    this.add(canopy, cord, socket, bulb, shade, diffuser, hitbox);
    this.setOn(this.options.on);
  }

  /** Switches the fixture's glow and tells the listener to do the same with the real light. */
  override setOn(on: boolean): void {
    super.setOn(on);
    this.options.onSwitch?.(on);
  }

  protected render(on: boolean, hovered: boolean): void {
    this.bulb.emissiveIntensity = on ? BULB_GLOW : 0;
    this.diffuser.emissiveIntensity = on ? DIFFUSER_GLOW : 0;
    this.fabric.emissiveIntensity = (on ? FABRIC_GLOW : 0) + (hovered ? HOVER_GLOW : 0);
  }
}
