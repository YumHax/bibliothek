import * as THREE from 'three';
import { cylinderMesh, invisibleHitbox } from '../meshUtils';
import { SwitchableLamp } from './SwitchableLamp';
import { standard } from '../materials/palette';
import { LAMP_GLOW, LAMP_LIGHT } from '../lighting/lampColours';

export interface FloorLampOptions {
  /** Height of the pole top (the drum shade is centred on it), m. */
  poleHeight?: number;
  /** Light intensity when on. */
  intensity?: number;
  /** Starts lit? */
  on?: boolean;
  /**
   * Where its cord runs to, a lamp-local floor point `[x, z]` (under the armchair beside it, to the wall): it leaves the
   * base and snakes across the floor there. None by default.
   */
  cord?: [x: number, z: number];
}

const SEGMENTS = 32;
const BASE_RADIUS = 0.14;
const BASE_HEIGHT = 0.03;
const POLE_RADIUS = 0.012;
const SHADE_RADIUS = 0.17;
const SHADE_HEIGHT = 0.24;
const DIFFUSER_GLOW = 1.2;
const BULB_GLOW = 2.5;
/** Faint glow of the fabric shade while lit. */
const FABRIC_GLOW = 0.15;

// Blackened metal: a dark finish, so a dielectric (metalness 0).
const DARK_METAL = standard({ color: 0x3a3632, roughness: 0.4, metalness: 0 });

/**
 * A slim floor lamp: weighted base, pole, drum shade closed by soft glowing diffusers, with its
 * own cheap (shadow-less) point light inside. Local origin on the floor under the base. The base
 * is a real collider so the player cannot walk through it. Clicking the shade switches it.
 */
export class FloorLamp extends SwitchableLamp {
  readonly options: Required<FloorLampOptions>;
  /** The lamp's own light. */
  readonly light: THREE.PointLight;
  readonly hitboxes: THREE.Object3D[];
  private readonly fabric: THREE.MeshStandardMaterial;
  private readonly diffuser: THREE.MeshStandardMaterial;
  private readonly bulb: THREE.MeshStandardMaterial;

  constructor(options: FloorLampOptions = {}) {
    super('floor lamp');
    this.name = 'FloorLamp';
    this.options = { poleHeight: 1.5, intensity: 6, on: false, cord: [0, 0], ...options };
    const { poleHeight } = this.options;

    const base = cylinderMesh(BASE_RADIUS, BASE_HEIGHT, DARK_METAL, { y: BASE_HEIGHT / 2 }, { segments: SEGMENTS });
    const poleLength = poleHeight - BASE_HEIGHT;
    const pole = cylinderMesh(POLE_RADIUS, poleLength, DARK_METAL, { y: BASE_HEIGHT + poleLength / 2 }, { segments: 12 });

    this.fabric = new THREE.MeshStandardMaterial({ color: 0xefe4d0, roughness: 1, side: THREE.DoubleSide, emissive: LAMP_GLOW.incandescent, emissiveIntensity: 0 });
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(SHADE_RADIUS, SHADE_RADIUS, SHADE_HEIGHT, SEGMENTS, 1, true), this.fabric);
    shade.position.y = poleHeight;
    shade.receiveShadow = true;

    this.diffuser = new THREE.MeshStandardMaterial({ color: 0xfff6e8, emissive: LAMP_GLOW.incandescent, emissiveIntensity: DIFFUSER_GLOW, roughness: 1, side: THREE.DoubleSide });
    const top = new THREE.Mesh(new THREE.CircleGeometry(SHADE_RADIUS - 0.004, SEGMENTS), this.diffuser);
    top.position.y = poleHeight + SHADE_HEIGHT / 2 - 0.003;
    // The bottom disc is a ring so the pole passes through it.
    const bottom = new THREE.Mesh(new THREE.RingGeometry(POLE_RADIUS + 0.004, SHADE_RADIUS - 0.004, SEGMENTS), this.diffuser);
    bottom.position.y = poleHeight - SHADE_HEIGHT / 2 + 0.003;
    for (const disc of [top, bottom]) disc.rotation.x = -Math.PI / 2;

    this.bulb = new THREE.MeshStandardMaterial({ color: 0xfff4e0, emissive: LAMP_GLOW.incandescent, emissiveIntensity: BULB_GLOW, roughness: 0.3 });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.025, 16, 12), this.bulb);
    bulb.position.y = poleHeight + 0.04;

    // A reach: with distance 0 every fragment of the scene evaluates the light (at 8 m its inverse-square light is under 2 % of its intensity).
    this.light = new THREE.PointLight(LAMP_LIGHT.incandescent, this.options.intensity, 8, 2);
    this.light.position.y = poleHeight + 0.04;
    this.light.castShadow = false;

    // The switch is where the hand would reach: around the shade.
    const hitbox = invisibleHitbox(SHADE_RADIUS * 2 + 0.04, SHADE_HEIGHT + 0.08, SHADE_RADIUS * 2 + 0.04, { y: poleHeight });
    this.hitboxes = [hitbox];

    for (const m of [shade, top, bottom, bulb]) m.castShadow = false;
    this.add(base, pole, shade, top, bottom, bulb, this.light, hitbox);
    if (options.cord) this.add(cord(options.cord));
    this.setOn(this.options.on);
  }

  override get footprint(): THREE.Box3 {
    const r = BASE_RADIUS;
    return new THREE.Box3(new THREE.Vector3(-r, 0, -r), new THREE.Vector3(r, 0.35, r));
  }

  /** Hover glints the weighted base (the base class), never the shade. */
  protected render(level: number): void {
    this.light.intensity = level * this.options.intensity;
    this.diffuser.emissiveIntensity = level * DIFFUSER_GLOW;
    SwitchableLamp.warmGlow(this.bulb, LAMP_GLOW.incandescent, level);
    this.bulb.emissiveIntensity = level * BULB_GLOW;
    this.fabric.emissiveIntensity = level * FABRIC_GLOW;
  }
}

/** A cord lies a hair over the floor (clear of the contact shadows), this thick. */
const CORD_Y = 0.013;
const CORD_RADIUS = 0.0028;
/** How far up the base's side the cord comes out of it. */
const CORD_RISE = 0.006;
const CORD = standard({ color: 0x1c1c1e, roughness: 0.55, metalness: 0 });

/** The lamp's cord: out of the base's side at the floor, a lazy S across the boards to `to`. */
function cord(to: [number, number]): THREE.Mesh {
  const end = new THREE.Vector3(to[0], CORD_Y, to[1]);
  const dir = end.clone().setY(0).normalize();
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const start = dir.clone().multiplyScalar(BASE_RADIUS * 0.9).setY(CORD_Y + CORD_RISE);
  const along = (t: number, sway: number): THREE.Vector3 => start.clone().lerp(end, t).addScaledVector(side, sway).setY(CORD_Y);
  const curve = new THREE.CatmullRomCurve3([start, along(0.15, 0.03), along(0.45, -0.05), along(0.75, 0.04), end], false, 'centripetal');
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, CORD_RADIUS, 6, false), CORD);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
