import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { invisibleHitbox } from '../meshUtils';
import { Prop, part } from './Prop';
import { paint } from '../materials/palette';
import { HoverGlint } from './hoverGlint';
import { playIntercomLine } from '@/audio/furnitureSounds';

export interface IntercomOptions {
  /** Colour of the plastic. Default an old beige. */
  color?: number;
}

const W = 0.09;
const H = 0.22;
/** How long the handset is off its hook for a listen (s), and how it goes: lifted out and tipped towards the ear. */
const LISTEN_SECONDS = 1.6;
const LIFT = 0.025;
const TILT = 0.35;
const LINES = ['Only the hum of the line. Nobody at the street door.', 'A crackle, then nothing. Wrong button downstairs.', 'Silence. The courier will come back tomorrow, says the note.'];

/**
 * The flat's door phone by the entrance: a beige wall box with the handset hung on its hook, a
 * coiled cord down to the base, the door-release button and a speaker grille. Clicking it lifts
 * the handset off its hook for a listen (the line's hum and crackle; nobody is ever there), then
 * hangs it back. Wall-hung: origin at the centre of the base on the wall, +z into the room.
 * Decoration: never collides.
 */
export class Intercom extends Prop implements Interactable, Updatable {
  readonly hitboxes: THREE.Object3D[];
  /** The handset, turning about its hook at the foot of the base. */
  private readonly handset = new THREE.Group();
  private readonly glint: HoverGlint;
  private calls = 0;
  /** Seconds left of the listen (0: on its hook). */
  private listening = 0;

  constructor(options: IntercomOptions = {}) {
    super();
    this.name = 'Intercom';
    const plastic = paint(options.color ?? 0xd9d0bc, 0.55);
    const dark = paint(0x3a3834, 0.6);
    part(this, W, H, 0.03, plastic, { z: 0.015 });
    // Speaker grille and the door-release button at the bottom of the base.
    for (let i = 0; i < 4; i++) part(this, 0.04, 0.003, 0.002, dark, { y: -H / 2 + 0.05 + i * 0.008, z: 0.031 });
    const button = part(this, 0.018, 0.012, 0.008, dark, { y: -H / 2 + 0.02, z: 0.034 });
    this.glint = HoverGlint.of(button);
    // The handset on its hook, standing proud of the base: earpiece and mouthpiece bulges. Its
    // pivot is the hook, low on the base's face.
    const hook = -H * 0.34;
    this.handset.position.set(0, hook, 0.035);
    this.handset.userData.live = true;
    this.add(this.handset);
    part(this.handset, 0.045, H * 0.78, 0.035, plastic, { y: 0.01 - hook, z: 0.015 });
    part(this.handset, 0.055, 0.045, 0.045, plastic, { y: H * 0.36 - hook, z: 0.02 });
    part(this.handset, 0.055, 0.045, 0.045, plastic, { y: -H * 0.3 - hook, z: 0.02 });
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
    this.glint.set(hovered);
  }

  label(): string {
    return 'Intercom · answer';
  }

  activate(session: SessionActions): void {
    session.react(LINES[this.calls++ % LINES.length]!);
    if (this.listening > 0) return;
    this.listening = LISTEN_SECONDS;
    playIntercomLine(LISTEN_SECONDS - 0.2);
  }

  /** The handset comes off its hook, tipped out, stays a moment, and is hung back. */
  update(dt: number): void {
    if (this.listening <= 0) return;
    this.listening = Math.max(0, this.listening - dt);
    const t = LISTEN_SECONDS - this.listening;
    const off = Math.min(THREE.MathUtils.smoothstep(t, 0, 0.25), 1 - THREE.MathUtils.smoothstep(t, LISTEN_SECONDS - 0.3, LISTEN_SECONDS));
    this.handset.position.z = 0.035 + LIFT * off;
    this.handset.rotation.x = TILT * off;
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
