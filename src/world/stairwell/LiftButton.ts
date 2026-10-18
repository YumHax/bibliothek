import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { createCanvas } from '@/covers/generated/canvasUtils';
import { boxMesh, cylinderMesh, invisibleHitbox, type MeshPosition } from '../meshUtils';
import { markShared, sharedCanvasTexture } from '../materials/sharedResources';
import { standard } from '../materials/palette';
import { INSET } from '../props/joinery';
import { WALL, layMesh } from '../surface/layers';
import { Prop } from '../props/Prop';
import { BRASS } from './liftBody';

/**
 * How a button looks, built on the face it is mounted on (local z 0, facing +z): its brass (which glows on hover),
 * its own lamp (lit by `setLit`), and the box it is clicked in.
 */
interface ButtonLook {
  hit: { size: [number, number, number]; at: MeshPosition };
  build?(into: THREE.Object3D, brass: THREE.Material): THREE.MeshStandardMaterial | null;
}

/** The ivory of a push. */
const IVORY = standard({ color: 0xece2cc, roughness: 0.35, metalness: 0 });
const PUSH = { r: 0.015, h: 0.012 };
const BEZEL = { r: 0.021, h: 0.008 };
/** The call button's plate (width, height, thickness) and the keyhole's escutcheon (radius, thickness). */
const PLATE = { w: 0.07, h: 0.2, t: 0.012 };
const ESCUTCHEON = { r: 0.018, t: 0.006 };

/** A round push in its brass bezel at (x, y) on the face: returns the push's front (local z). */
function push(into: THREE.Object3D, brass: THREE.Material, x: number, y: number): number {
  const bezel = cylinderMesh(BEZEL.r, BEZEL.h, brass, { x, y, z: BEZEL.h / 2 - INSET });
  bezel.rotation.x = Math.PI / 2;
  into.add(bezel);
  const knob = cylinderMesh(PUSH.r, PUSH.h, IVORY, { x, y, z: PUSH.h / 2 });
  knob.rotation.x = Math.PI / 2;
  into.add(knob);
  return PUSH.h;
}

/**
 * The call button on a landing, on the cage's front post by the gate: a brass plate, a round ivory push, and over it
 * a little amber lamp that lights while the car is on its way to this landing.
 */
const CALL_BUTTON: ButtonLook = {
  hit: { size: [0.12, 0.26, 0.12], at: { z: 0.03 } },
  build(into, brass) {
    into.add(boxMesh(PLATE.w, PLATE.h, PLATE.t, brass, { z: PLATE.t / 2 - INSET }));
    const front = PLATE.t - INSET;
    const button = new THREE.Group();
    button.position.set(0, -0.025, front);
    push(button, brass, 0, 0);
    into.add(button);
    const lamp = new THREE.MeshStandardMaterial({ color: 0x7a4a1a, roughness: 0.2, emissive: 0xffa040, emissiveIntensity: 0 });
    const glass = new THREE.Mesh(lampGeometry(), lamp);
    glass.position.set(0, 0.055, front);
    glass.rotation.x = Math.PI / 2;
    into.add(glass);
    return lamp;
  },
};

/** One of the car panel's buttons, marked with its floor (`mark`, on the push's face): the face glows while it is where the car goes. */
export function panelButton(mark: string): ButtonLook {
  return {
    hit: { size: [0.08, 0.08, 0.06], at: { z: 0.02 } },
    build(into, brass) {
      const front = push(into, brass, 0, 0);
      const map = sharedCanvasTexture(`lift-key-${mark}`, () => keyFace(mark), { anisotropy: 'facing' });
      const lamp = new THREE.MeshStandardMaterial({ map, roughness: 0.35, emissive: 0xffb060, emissiveMap: map, emissiveIntensity: 0 });
      const face = new THREE.Mesh(faceGeometry(), lamp);
      face.position.z = front + WALL.print.lift;
      into.add(layMesh(face, WALL.print));
      return lamp;
    },
  };
}

/** The roof's keyhole on the car's panel: a brass escutcheon with its dark slot. */
export const KEYHOLE: ButtonLook = {
  hit: { size: [0.07, 0.07, 0.05], at: { z: 0.02 } },
  build(into, brass) {
    const plate = cylinderMesh(ESCUTCHEON.r, ESCUTCHEON.t, brass, { z: ESCUTCHEON.t / 2 - INSET });
    plate.rotation.x = Math.PI / 2;
    into.add(plate);
    const slot = new THREE.Mesh(new THREE.PlaneGeometry(0.005, 0.016), standard({ color: 0x0d0b08, roughness: 0.9 }));
    slot.position.z = ESCUTCHEON.t - INSET + WALL.notice.lift;
    into.add(layMesh(slot, WALL.notice));
    return null;
  },
};

/** A landing's gate, clicked anywhere: nothing drawn, only the box it is clicked in (`width` by `height`, its foot at y 0). */
export function gateHit(width: number, height: number): ButtonLook {
  return { hit: { size: [width, height, 0.1], at: { y: height / 2 } } };
}

/**
 * A button of the lift: the call button on a landing, the panel's in the car, the roof's keyhole, or a landing's gate
 * itself (a call, clicked anywhere on it). A caption and a click; `through` lets the crosshair pass it (an open gate).
 */
export class LiftButton extends Prop implements Interactable {
  readonly contactShadow = false;
  readonly hitboxes: THREE.Object3D[];
  private readonly brass = BRASS.clone();
  private readonly lamp: THREE.MeshStandardMaterial | null;
  private lit = false;

  constructor(
    private readonly caption: () => string,
    private readonly press: (session: SessionActions) => void,
    look: ButtonLook = CALL_BUTTON,
    private readonly through?: () => boolean,
  ) {
    super();
    this.name = 'LiftButton';
    this.lamp = look.build?.(this, this.brass) ?? null;
    const hitbox = invisibleHitbox(...look.hit.size, look.hit.at);
    this.hitboxes = [hitbox];
    this.add(hitbox);
  }

  /** Its lamp (the landing's amber one, the panel button's face) lit or not. */
  setLit(lit: boolean): void {
    if (lit === this.lit || !this.lamp) return;
    this.lit = lit;
    this.lamp.emissiveIntensity = lit ? 1.1 : 0;
  }

  setHovered(hovered: boolean): void {
    this.brass.emissiveIntensity = hovered ? 0.5 : 0;
  }

  label(): string {
    return this.caption();
  }

  activate(session: SessionActions): void {
    this.press(session);
  }

  passesThrough(): boolean {
    return this.through?.() ?? false;
  }
}

let lampShape: THREE.BufferGeometry | null = null;
/** The landing lamp's glass: a little dome, its flat side on the plate. */
function lampGeometry(): THREE.BufferGeometry {
  lampShape ??= markShared(new THREE.SphereGeometry(0.011, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2));
  return lampShape;
}

let faceShape: THREE.BufferGeometry | null = null;
/** A push's marked face, clear of its rounded rim. */
function faceGeometry(): THREE.BufferGeometry {
  faceShape ??= markShared(new THREE.CircleGeometry(PUSH.r * 0.78, 24));
  return faceShape;
}

/** A push's face: ivory, the floor's mark in black serif. */
function keyFace(mark: string): HTMLCanvasElement {
  const [canvas, ctx] = createCanvas(64, 64);
  ctx.fillStyle = '#ece2cc';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#1e160e';
  ctx.font = 'bold 40px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(mark, 32, 35);
  return canvas;
}
