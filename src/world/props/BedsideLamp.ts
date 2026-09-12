import * as THREE from 'three';
import { cylinderMesh, invisibleHitbox } from '../meshUtils';
import { SwitchableLamp } from './SwitchableLamp';

export interface BedsideLampOptions {
  /** Light intensity when on (a small bulb: a fraction of a floor lamp's). */
  intensity?: number;
  /** Starts lit? */
  on?: boolean;
  /** Colour of the fabric shade. */
  shade?: number;
}

const SEGMENTS = 24;
const BASE_RADIUS = 0.06;
const BASE_HEIGHT = 0.02;
const STEM_RADIUS = 0.01;
const STEM_HEIGHT = 0.2;
const SHADE_TOP_RADIUS = 0.08;
const SHADE_BOTTOM_RADIUS = 0.11;
const SHADE_HEIGHT = 0.13;
const DIFFUSER_GLOW = 1.0;
const BULB_GLOW = 2.5;
/** Faint glow of the fabric while lit, and while hovered so a switched-off lamp still reacts. */
const FABRIC_GLOW = 0.25;
const HOVER_GLOW = 0.3;

const CERAMIC = new THREE.MeshStandardMaterial({ color: 0x3f4a55, roughness: 0.3 });
const BRASS = new THREE.MeshStandardMaterial({ color: 0xc9a75b, metalness: 0.85, roughness: 0.3 });

/**
 * A small table lamp for a bedside: a ceramic base, a brass stem and a short tapered fabric shade
 * with a glowing bulb inside, and its own cheap (shadow-less) point light. Local origin is the
 * bottom of the base: place it on the top of whatever it stands on. Decoration on a table, so it
 * never collides (see `Prop`). Clicking the shade switches it.
 */
export class BedsideLamp extends SwitchableLamp {
  readonly options: Required<BedsideLampOptions>;
  /** The lamp's own light. */
  readonly light: THREE.PointLight;
  readonly hitboxes: THREE.Object3D[];
  private readonly fabric: THREE.MeshStandardMaterial;
  private readonly diffuser: THREE.MeshStandardMaterial;
  private readonly bulb: THREE.MeshStandardMaterial;

  constructor(options: BedsideLampOptions = {}) {
    super('bedside lamp');
    this.name = 'BedsideLamp';
    this.options = { intensity: 1.6, on: false, shade: 0xefe4d0, ...options };

    const base = cylinderMesh(BASE_RADIUS, BASE_HEIGHT, CERAMIC, { y: BASE_HEIGHT / 2 }, { radiusBottom: BASE_RADIUS * 1.05, segments: SEGMENTS });
    const body = cylinderMesh(0.035, 0.08, CERAMIC, { y: BASE_HEIGHT + 0.04 }, { radiusBottom: 0.045, segments: SEGMENTS });
    const stem = cylinderMesh(STEM_RADIUS, STEM_HEIGHT, BRASS, { y: BASE_HEIGHT + 0.08 + STEM_HEIGHT / 2 }, { segments: 10 });
    const shadeY = BASE_HEIGHT + 0.08 + STEM_HEIGHT + SHADE_HEIGHT / 2 - 0.03;

    // Own materials: the emissive state is per lamp.
    this.fabric = new THREE.MeshStandardMaterial({ color: this.options.shade, roughness: 1, side: THREE.DoubleSide, emissive: 0xffe2b0, emissiveIntensity: 0 });
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(SHADE_TOP_RADIUS, SHADE_BOTTOM_RADIUS, SHADE_HEIGHT, SEGMENTS, 1, true), this.fabric);
    shade.position.y = shadeY;
    shade.receiveShadow = true;

    this.diffuser = new THREE.MeshStandardMaterial({ color: 0xfff6e8, emissive: 0xffe4bc, emissiveIntensity: DIFFUSER_GLOW, roughness: 1, side: THREE.DoubleSide });
    const top = new THREE.Mesh(new THREE.CircleGeometry(SHADE_TOP_RADIUS - 0.003, SEGMENTS), this.diffuser);
    top.position.y = shadeY + SHADE_HEIGHT / 2 - 0.002;
    top.rotation.x = -Math.PI / 2;

    this.bulb = new THREE.MeshStandardMaterial({ color: 0xfff4e0, emissive: 0xffe2b0, emissiveIntensity: BULB_GLOW, roughness: 0.3 });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.02, 14, 10), this.bulb);
    bulb.position.y = shadeY;

    this.light = new THREE.PointLight(0xffd9a8, this.options.intensity, 0, 2);
    this.light.position.y = shadeY;
    this.light.castShadow = false;

    const hitbox = invisibleHitbox(SHADE_BOTTOM_RADIUS * 2 + 0.03, SHADE_HEIGHT + 0.06, SHADE_BOTTOM_RADIUS * 2 + 0.03, { y: shadeY });
    this.hitboxes = [hitbox];

    for (const m of [shade, top, bulb]) m.castShadow = false;
    this.add(base, body, stem, shade, top, bulb, this.light, hitbox);
    this.setOn(this.options.on);
  }

  protected render(on: boolean, hovered: boolean): void {
    this.light.intensity = on ? this.options.intensity : 0;
    this.diffuser.emissiveIntensity = on ? DIFFUSER_GLOW : 0;
    this.bulb.emissiveIntensity = on ? BULB_GLOW : 0;
    this.fabric.emissiveIntensity = (on ? FABRIC_GLOW : 0) + (hovered ? HOVER_GLOW : 0);
  }
}
