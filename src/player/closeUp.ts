import * as THREE from 'three';
import type { FirstPersonController } from './FirstPersonController';
import { lookTowards } from './lookTowards';
import { zoomView } from './zoomView';

/*
 * A close look at something in the room without picking it up (the fridge door's keepsakes, docs/household.md "The
 * fridge door and the corkboard"): the view turns to it and draws in, as a conversation's framing does, and lets go
 * by itself as soon as the player walks off, looks well away or leaves the pointer lock (Esc, a panel). Never a hard
 * lock: the mouse still turns the view the whole time. One close look at a time. The rig (the player, the camera) is
 * handed over once at start-up (`setCloseUpRig`, `bootstrap/social`).
 */

interface CloseUpRig {
  player: Pick<FirstPersonController, 'getLook' | 'setLook' | 'getEyePosition'>;
  camera: THREE.PerspectiveCamera;
}

/** How a close look frames its target and when it lets go. */
interface CloseUpOptions {
  /** How far the view draws in (`zoomView`'s factor). */
  zoom: number;
  /** Metres above the target's centre the view aims (negative: below). */
  lift?: number;
  /** It lets go when the view turns further than this off the target (radians)… */
  leaveAngle: number;
  /** …or the eye moves this far from where it started (metres). */
  leaveDistance: number;
  /** Called once it has let go, however. */
  onEnd?: () => void;
}

/** The turn to the target settles before the view may count as looking away (s). */
const SETTLE = 0.6;

let rig: CloseUpRig | null = null;
let release: (() => void) | null = null;

/** Hands over what a close look turns and draws in. */
export function setCloseUpRig(r: CloseUpRig): void {
  rig = r;
}

/** The camera the close looks frame (null before the rig is handed over): what holds a pad in view follows it too. */
export function closeUpCamera(): THREE.PerspectiveCamera | null {
  return rig?.camera ?? null;
}

/** Whether a close look is on. */
export function closeUpOn(): boolean {
  return release !== null;
}

const eye = new THREE.Vector3();
const start = new THREE.Vector3();
const at = new THREE.Vector3();
const toTarget = new THREE.Vector3();
const facing = new THREE.Vector3();

/** Takes a close look at `target` (the one going lets go first). Returns the letting go, or null without a rig. */
export function closeUp(target: THREE.Object3D, options: CloseUpOptions): (() => void) | null {
  if (!rig) return null;
  release?.();
  const { player, camera } = rig;
  const lift = options.lift ?? 0;
  const cancelTurn = lookTowards(player, target, lift);
  zoomView(camera, options.zoom);
  player.getEyePosition(start);
  const locked = document.pointerLockElement !== null;
  const began = performance.now();
  let frame = 0;
  const end = (): void => {
    if (release !== end) return;
    release = null;
    cancelAnimationFrame(frame);
    cancelTurn();
    zoomView(camera, 1);
    options.onEnd?.();
  };
  release = end;
  const watch = (now: number): void => {
    if (release !== end) return;
    player.getEyePosition(eye);
    if (eye.distanceTo(start) > options.leaveDistance || (locked && document.pointerLockElement === null)) return end();
    if (now - began > SETTLE * 1000) {
      target.getWorldPosition(at);
      at.y += lift;
      toTarget.subVectors(at, eye).normalize();
      // Camera looks down -z: yaw maps (0,0,-1) to (-sin yaw, 0, -cos yaw), pitch lifts y by sin(pitch).
      const { yaw, pitch } = player.getLook();
      facing.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      if (facing.angleTo(toTarget) > options.leaveAngle) return end();
    }
    frame = requestAnimationFrame(watch);
  };
  frame = requestAnimationFrame(watch);
  return end;
}
