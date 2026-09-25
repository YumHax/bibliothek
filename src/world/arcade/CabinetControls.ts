import * as THREE from 'three';
import { cylinderMesh } from '../meshUtils';
import { matte } from '../props/Prop';
import type { ArcadeControls } from './games/ArcadeGame';
import { BASE_H, CABINET_CHROME, DEPTH } from './cabinetModel';

/** How far a joystick leans with a held direction (radians). */
const STICK_TILT = 0.35;
const BUTTON_REST = BASE_H + 0.085;

/** One set of controls on the panel: a joystick on a pivot, its knob, two buttons. */
interface ControlSet {
  stick: THREE.Group;
  knob: THREE.Mesh;
  buttons: THREE.Mesh[];
}

/**
 * A cabinet's joysticks and buttons: one set, or one per player on a two-player game (the buttons
 * then closer to their stick). The sticks lean towards the held direction and the buttons go down
 * with fire, eased; a hand rests on a knob and the first button.
 */
export class CabinetControls {
  private readonly sets: ControlSet[];

  /** Adds the controls to `cabinet`'s panel. */
  constructor(cabinet: THREE.Group, twoPlayer: boolean) {
    this.sets = twoPlayer ? [addControls(cabinet, -0.2, 0xd23a3a, true), addControls(cabinet, 0.12, 0x3a7ad2, true)] : [addControls(cabinet, -0.14, 0xd23a3a, false)];
  }

  /** Where the hands of the player at set `player` (0 or 1) are: on the knob as it leans, on the first button. */
  handsAt(player: number, hands: [THREE.Vector3, THREE.Vector3]): [THREE.Vector3, THREE.Vector3] {
    const set = this.sets[player]!;
    set.knob.getWorldPosition(hands[0]).y += 0.015;
    set.buttons[0]!.getWorldPosition(hands[1]).y += 0.02;
    return hands;
  }

  /** The first set follows `controls`, the second (when there is one) `second`. */
  move(dt: number, controls: ArcadeControls, second: ArcadeControls): void {
    const ease = Math.min(1, dt * 18);
    this.sets.forEach((set, i) => {
      const c = i === 0 ? controls : second;
      const tz = ((c.left ? 1 : 0) - (c.right ? 1 : 0)) * STICK_TILT;
      const tx = ((c.down ? 1 : 0) - (c.up ? 1 : 0)) * STICK_TILT;
      set.stick.rotation.z += (tz - set.stick.rotation.z) * ease;
      set.stick.rotation.x += (tx - set.stick.rotation.x) * ease;
      const pressed = c.fire || c.firePressed;
      for (const button of set.buttons) button.position.y += ((pressed ? BUTTON_REST - 0.006 : BUTTON_REST) - button.position.y) * ease;
    });
  }
}

/** A joystick (a pivot at its base, so it tilts with the keys) and two buttons that go down with fire, `x` along the panel. */
function addControls(cabinet: THREE.Group, x: number, knobColor: number, twoPlayer: boolean): ControlSet {
  const stick = new THREE.Group();
  stick.position.set(x, BASE_H + 0.07, DEPTH / 2 - 0.1);
  stick.add(cylinderMesh(0.008, 0.08, CABINET_CHROME, { y: 0.04 }, { segments: 10 }));
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 10), matte(knobColor, 0.4));
  knob.position.y = 0.09;
  knob.castShadow = true;
  stick.add(knob);
  const a = cylinderMesh(0.018, 0.015, matte(0xffd23a, 0.4), { x: x + 0.2, y: BUTTON_REST, z: DEPTH / 2 - 0.1 }, { segments: 14 });
  const b = cylinderMesh(0.018, 0.015, matte(0x3ad2a0, 0.4), { x: x + 0.27, y: BUTTON_REST, z: DEPTH / 2 - 0.13 }, { segments: 14 });
  // On a two-player panel the buttons sit closer to their stick.
  if (twoPlayer) {
    a.position.x = x + 0.1;
    b.position.x = x + 0.16;
  }
  cabinet.add(stick, a, b);
  return { stick, knob, buttons: [a, b] };
}
