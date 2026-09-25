import * as THREE from 'three';
import { boxMesh, cylinderMesh } from '../meshUtils';
import { matte } from '../props/Prop';
import type { AttachmentFrame, CabinetAttachment } from './CabinetAttachment';

export interface LightGunOptions {
  /** The camera: the player's gun is held just below and right of it. */
  listener: THREE.Object3D;
  /** Body colour. Default a toy-gun orange. */
  color?: number;
  /** Where the holster hangs, cabinet-local (default on the right side, by the panel). */
  holster?: THREE.Vector3;
  /** Where a regular's gun hand is, cabinet-local. */
  regularHand?: THREE.Vector3;
}

/** Where the held gun sits relative to the eye (right, down, forward), metres. */
const HELD = new THREE.Vector3(0.12, -0.17, -0.3);
const EASE = 14;
const RECOIL = 0.03;
const CABLE_POINTS = 16;

/**
 * The light gun on its cable: a toy pistol that rests in a holster on the cabinet's side, rises into the
 * player's hand while they play (held low and right of the eye, pointing where they aim, kicking
 * back on every shot) and into a regular's hand when one plays. A coiled cable runs from the
 * panel to the grip. A `CabinetAttachment` for `ArcadeCabinet` (the cabinet aims the game from
 * the camera; this is only the gun you see).
 */
export class LightGun implements CabinetAttachment {
  readonly object = new THREE.Group();
  private readonly gun = new THREE.Group();
  private readonly grip = new THREE.Object3D();
  private readonly cable: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private readonly anchor: THREE.Vector3;
  private readonly holster: THREE.Vector3;
  private readonly regularHand: THREE.Vector3;
  private readonly listener: THREE.Object3D;
  private readonly targetPos = new THREE.Vector3();
  private readonly targetQuat = new THREE.Quaternion();
  private readonly look = new THREE.Object3D();
  private readonly scratch = new THREE.Vector3();
  private readonly camQuat = new THREE.Quaternion();
  private kick = 0;
  private holder: AttachmentFrame['who'] = null;

  constructor(options: LightGunOptions) {
    this.listener = options.listener;
    this.holster = options.holster ?? new THREE.Vector3(0.37, 0.95, 0.22);
    this.regularHand = options.regularHand ?? new THREE.Vector3(0.14, 1.25, 0.32);
    this.anchor = this.holster.clone().add(new THREE.Vector3(0, -0.02, -0.06));
    this.object.name = 'LightGun';
    const body = matte(options.color ?? 0xff7a1a, 0.45);
    const dark = matte(0x1e1e24, 0.5);
    // The pistol, barrel along +z: grip, frame, barrel with an orange tip, a trigger in its guard.
    const grip = boxMesh(0.028, 0.08, 0.035, dark, { y: -0.035, z: -0.02 });
    grip.rotation.x = 0.25;
    this.gun.add(grip);
    this.gun.add(boxMesh(0.032, 0.035, 0.12, body, { y: 0.008, z: 0.02 }));
    const barrel = cylinderMesh(0.01, 0.07, dark, { y: 0.012, z: 0.105 }, { segments: 10 });
    barrel.rotation.x = Math.PI / 2;
    this.gun.add(barrel);
    const tip = cylinderMesh(0.011, 0.012, matte(0xff3a1a, 0.4), { y: 0.012, z: 0.142 }, { segments: 10 });
    tip.rotation.x = Math.PI / 2;
    this.gun.add(tip, boxMesh(0.006, 0.02, 0.012, dark, { y: -0.02, z: 0.02 }));
    this.grip.position.set(0, -0.07, -0.03);
    this.gun.add(this.grip);
    this.gun.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    this.object.add(this.gun);
    // The holster: an open box on the cabinet's side the gun drops into.
    const holster = boxMesh(0.06, 0.05, 0.16, dark, { x: this.holster.x, y: this.holster.y - 0.03, z: this.holster.z - 0.01 });
    holster.rotation.x = -0.25;
    this.object.add(holster);
    this.cable = new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({ length: CABLE_POINTS }, () => new THREE.Vector3())), new THREE.LineBasicMaterial({ color: 0x151518 }));
    this.cable.frustumCulled = false;
    this.object.add(this.cable);
    this.restPose(this.targetPos, this.targetQuat);
    this.gun.position.copy(this.targetPos);
    this.gun.quaternion.copy(this.targetQuat);
  }

  update(dt: number, frame: AttachmentFrame): void {
    this.holder = frame.who;
    if (frame.controls.firePressed && frame.who) this.kick = 1;
    this.kick = Math.max(0, this.kick - dt * 10);
    if (frame.who === 'player') this.heldPose(frame.aim);
    else if (frame.who === 'regular') this.regularPose(frame.aim);
    else this.restPose(this.targetPos, this.targetQuat);
    const t = frame.who === 'player' ? 1 : Math.min(1, dt * EASE);
    this.gun.position.lerp(this.targetPos, t);
    this.gun.quaternion.slerp(this.targetQuat, t);
    // Recoil: back along the barrel and the muzzle up.
    if (this.kick > 0) {
      this.gun.translateZ(-RECOIL * this.kick);
      this.gun.rotateX(-0.2 * this.kick);
    }
    this.updateCable();
  }

  handsAt(hands: [THREE.Vector3, THREE.Vector3]): boolean {
    if (this.holder !== 'regular') return false;
    this.grip.getWorldPosition(hands[0]);
    this.grip.getWorldPosition(hands[1]).add(this.scratch.set(0, 0.02, 0));
    return true;
  }

  private restPose(pos: THREE.Vector3, quat: THREE.Quaternion): void {
    pos.copy(this.holster);
    // Muzzle down into the holster, grip up.
    quat.setFromEuler(new THREE.Euler(Math.PI / 2 - 0.25, 0, 0));
  }

  /** Just below and right of the eye, the muzzle on the aim point (or straight ahead when aimed off the screen). */
  private heldPose(aim: THREE.Vector3 | null): void {
    const cabinet = this.object.parent;
    if (!cabinet) return;
    this.listener.getWorldQuaternion(this.camQuat);
    const world = this.listener.getWorldPosition(this.scratch).add(HELD.clone().applyQuaternion(this.camQuat));
    this.targetPos.copy(cabinet.worldToLocal(world.clone()));
    const target = aim ? aim.clone() : cabinet.worldToLocal(this.listener.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0, -3).applyQuaternion(this.camQuat)));
    this.aimFrom(this.targetPos, target);
  }

  /** In a regular's hand, pointing at the glass. */
  private regularPose(aim: THREE.Vector3 | null): void {
    this.targetPos.copy(this.regularHand);
    this.aimFrom(this.targetPos, aim ?? new THREE.Vector3(0, 1.36, 0.3));
  }

  /** Orientation (cabinet-local) with the barrel (+z) from `from` towards `to`. */
  private aimFrom(from: THREE.Vector3, to: THREE.Vector3): void {
    this.look.position.copy(from);
    this.look.up.set(0, 1, 0);
    this.look.lookAt(to);
    this.targetQuat.copy(this.look.quaternion);
  }

  /** The cable: from the panel to the grip, sagging in between. */
  private updateCable(): void {
    const end = this.grip.getWorldPosition(new THREE.Vector3());
    this.object.worldToLocal(end);
    const positions = this.cable.geometry.attributes.position as THREE.BufferAttribute;
    const length = this.anchor.distanceTo(end);
    for (let i = 0; i < CABLE_POINTS; i++) {
      const t = i / (CABLE_POINTS - 1);
      const x = THREE.MathUtils.lerp(this.anchor.x, end.x, t);
      const y = THREE.MathUtils.lerp(this.anchor.y, end.y, t) - Math.sin(t * Math.PI) * Math.min(0.25, length * 0.35);
      const z = THREE.MathUtils.lerp(this.anchor.z, end.z, t);
      positions.setXYZ(i, x, y, z);
    }
    positions.needsUpdate = true;
  }
}
