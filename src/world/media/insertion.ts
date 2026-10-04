import * as THREE from 'three';
import type { MediaSpec } from '@/catalog/media';
import { easeInOutQuad } from '@/math/easing';
import type { MediaSlot } from '../props/consoleStyles';
import type { Step } from './Timeline';

/** Seconds for each move: the flight from the hand, the slide in, the press down, a door. */
const FLY_SECONDS = 0.75;
const SLIDE_SECONDS = 0.3;
const PRESS_SECONDS = 0.14;
const DOOR_SECONDS = 0.22;
const AWAY_SECONDS = 0.55;
/** How far out of the slot a cartridge lines up before it goes in (m), and how high a disc hovers over the spindle. */
const LINE_UP = 0.006;
const DISC_HOVER = 0.03;
/** A console that takes the whole cartridge has it this far past its mouth (m), behind the door. */
const SWALLOWED = 0.004;
/** A cartridge coming in flies at the slot from the front, this far out (m), so it never cuts through the shelf above. */
const APPROACH = 0.12;

/** Where the media is once in (`seated`), where it lines up to go in (`entry`), in the slot parent's space. */
export interface SeatPoses {
  seated: THREE.Vector3;
  entry: THREE.Vector3;
  pressed: THREE.Vector3;
}

export function seatPoses(slot: MediaSlot, spec: MediaSpec): SeatPoses {
  const out = slot.inward.clone().negate();
  let seated: THREE.Vector3;
  let entry: THREE.Vector3;
  if (spec.shape === 'disc') {
    seated = slot.mouth.clone().addScaledVector(out, spec.size.depth / 2);
    entry = seated.clone().addScaledVector(out, DISC_HOVER);
  } else {
    // Contacts first: the bottom edge goes `insert` deep, the middle is half the height back from it.
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(slot.rotation);
    const insert = slot.swallows ? spec.size.height + SWALLOWED : spec.insert;
    seated = slot.mouth.clone().addScaledVector(slot.inward, insert).addScaledVector(up, spec.size.height / 2);
    entry = seated.clone().addScaledVector(out, Math.min(insert, slot.lineUp ?? Infinity) + LINE_UP);
  }
  return { seated, entry, pressed: slot.press ? seated.clone().add(slot.press) : seated.clone() };
}

/** The moves that take `media` from where it is (already in the slot parent's space) into the slot. */
export function insertSteps(media: THREE.Object3D, slot: MediaSlot, poses: SeatPoses, onClick: (step: 'door' | 'in' | 'shut') => void): Step[] {
  const from = media.position.clone();
  const fromQ = media.quaternion.clone();
  const front = new THREE.Vector3(0, 0, 1);
  // A cubic from the hand: up a little first, then in towards the slot along the console's front.
  const c1 = from.clone().add(new THREE.Vector3(0, 0.04, 0));
  const c2 = poses.entry.clone().addScaledVector(front, APPROACH).addScaledVector(slot.inward, -0.01);
  const curve = new THREE.CubicBezierCurve3(from, c1, c2, poses.entry);
  const door = slot.door;
  let opened = false;
  // A door already open (the cartridge before this one is on its way out) opens on from where it is.
  let doorFrom: number | null = null;
  const steps: Step[] = [
    {
      seconds: FLY_SECONDS,
      linear: true,
      run: (t) => {
        // The flight is quadratic in and out (the timeline's own cubic ease would linger at the slot).
        curve.getPoint(easeInOutQuad(t), media.position);
        media.quaternion.slerpQuaternions(fromQ, slot.rotation, THREE.MathUtils.smoothstep(t, 0, 0.8));
        if (door) {
          doorFrom ??= door.pivot.rotation.x;
          door.pivot.rotation.x = THREE.MathUtils.lerp(doorFrom, door.angle, THREE.MathUtils.smoothstep(t, 0.35, 0.9));
          if (!opened && t > 0.35) {
            opened = true;
            onClick('door');
          }
        }
      },
    },
    { seconds: SLIDE_SECONDS, run: (t) => void media.position.lerpVectors(poses.entry, poses.seated, t) },
  ];
  if (slot.press) steps.push({ seconds: PRESS_SECONDS, run: (t) => void media.position.lerpVectors(poses.seated, poses.pressed, t) });
  steps.push({ seconds: 0, run: () => onClick('in') });
  if (door) {
    steps.push({ seconds: DOOR_SECONDS, run: (t) => (door.pivot.rotation.x = door.angle * (1 - t)) });
    steps.push({ seconds: 0, run: () => onClick('shut') });
  }
  return steps;
}

/**
 * The moves that take it out again and away to `home` (a point in the slot parent's space: its box
 * on the shelf, or up out of view), shrinking a little as it goes.
 */
export function ejectSteps(
  media: THREE.Object3D,
  slot: MediaSlot,
  poses: SeatPoses,
  home: () => THREE.Vector3,
  onClick: (step: 'door' | 'out') => void,
  /** Another cartridge is coming in: the door is left open for it. */
  keepDoorOpen: () => boolean = () => false,
): Step[] {
  const door = slot.door;
  const steps: Step[] = [];
  if (door) {
    steps.push({ seconds: 0, run: () => onClick('door') });
    steps.push({ seconds: DOOR_SECONDS, run: (t) => (door.pivot.rotation.x = door.angle * t) });
  }
  if (slot.press) steps.push({ seconds: PRESS_SECONDS, run: (t) => void media.position.lerpVectors(poses.pressed, poses.seated, t) });
  steps.push({ seconds: 0, run: () => onClick('out') });
  steps.push({ seconds: SLIDE_SECONDS, run: (t) => void media.position.lerpVectors(poses.seated, poses.entry, t) });
  let from: THREE.Vector3 | null = null;
  let to: THREE.Vector3 | null = null;
  steps.push({
    seconds: AWAY_SECONDS,
    run: (t) => {
      from ??= media.position.clone();
      to ??= home();
      const lift = new THREE.Vector3(0, 0.05, 0).multiplyScalar(Math.sin(t * Math.PI));
      media.position.lerpVectors(from, to, t).add(lift);
      media.scale.setScalar(1 - 0.35 * t);
      if (door && !keepDoorOpen()) door.pivot.rotation.x = door.angle * (1 - THREE.MathUtils.smoothstep(t, 0, 0.5));
    },
  });
  return steps;
}
