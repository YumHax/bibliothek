import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { invisibleHitbox } from '../meshUtils';
import { Prop, part, matte } from './Prop';

export interface IntercomOptions {
  /** Colour of the plastic. Default an old beige. */
  color?: number;
}

const W = 0.09;
const H = 0.22;
const HOVER_GLOW = 0.06;
const LINES = ['Only the hum of the line. Nobody at the street door.', 'A crackle, then nothing. Wrong button downstairs.', 'Silence. The courier will come back tomorrow, says the note.'];

/**
 * The flat's door phone by the entrance: a beige wall box with the handset hung on its hook, a
 * coiled cord down to the base, the door-release button and a speaker grille. Clicking it lifts
 * the handset for a listen (nobody is ever there). Wall-hung: origin at the centre of the base on
 * the wall, +z into the room. Decoration: never collides.
 */
export class Intercom extends Prop implements Interactable {
  readonly hitboxes: THREE.Object3D[];
  private readonly plastic: THREE.MeshStandardMaterial;
  private calls = 0;

  constructor(options: IntercomOptions = {}) {
    super();
    this.name = 'Intercom';
    this.plastic = new THREE.MeshStandardMaterial({ color: options.color ?? 0xd9d0bc, roughness: 0.55, emissive: 0xffffff, emissiveIntensity: 0 });
    const dark = matte(0x3a3834, 0.6);
    part(this, W, H, 0.03, this.plastic, { z: 0.015 });
    // Speaker grille and the door-release button at the bottom of the base.
    for (let i = 0; i < 4; i++) part(this, 0.04, 0.003, 0.002, dark, { y: -H / 2 + 0.05 + i * 0.008, z: 0.031 });
    part(this, 0.018, 0.012, 0.008, dark, { y: -H / 2 + 0.02, z: 0.034 });
    // The handset on its hook, standing proud of the base: earpiece and mouthpiece bulges.
    part(this, 0.045, H * 0.78, 0.035, this.plastic, { y: 0.01, z: 0.05 });
    part(this, 0.055, 0.045, 0.045, this.plastic, { y: H * 0.36, z: 0.055 });
    part(this, 0.055, 0.045, 0.045, this.plastic, { y: -H * 0.3, z: 0.055 });
    // The coiled cord from the handset's foot to the base's side.
    const path = new THREE.CatmullRomCurve3([new THREE.Vector3(0.01, -H * 0.34, 0.05), new THREE.Vector3(0.05, -H * 0.5, 0.04), new THREE.Vector3(0.05, -H * 0.3, 0.02)]);
    const coil = new THREE.Mesh(new THREE.TubeGeometry(new Coil(path), 120, 0.0022, 5), dark);
    this.add(coil);
    this.traverse((o) => (o.castShadow = false));

    const hitbox = invisibleHitbox(W + 0.04, H + 0.04, 0.09, { z: 0.045 });
    this.add(hitbox);
    this.hitboxes = [hitbox];
  }

  setHovered(hovered: boolean): void {
    this.plastic.emissiveIntensity = hovered ? HOVER_GLOW : 0;
  }

  label(): string {
    return 'Click to answer the intercom';
  }

  activate(session: SessionActions): void {
    session.hint(LINES[this.calls++ % LINES.length]!);
  }
}

/** A telephone cord: a tight helix wound round `path`. */
class Coil extends THREE.Curve<THREE.Vector3> {
  private readonly side = new THREE.Vector3();
  private readonly up = new THREE.Vector3();

  constructor(private readonly path: THREE.Curve<THREE.Vector3>) {
    super();
  }

  override getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const turns = 22;
    const radius = 0.006;
    const p = this.path.getPoint(t);
    const tangent = this.path.getTangent(t);
    this.side.set(0, 0, 1).cross(tangent).normalize();
    this.up.crossVectors(tangent, this.side).normalize();
    const a = t * turns * Math.PI * 2;
    return target.copy(p).addScaledVector(this.side, Math.cos(a) * radius).addScaledVector(this.up, Math.sin(a) * radius);
  }
}
