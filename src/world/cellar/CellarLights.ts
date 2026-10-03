import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import type { OccupancyAware } from '../Furniture';
import { mainsOn } from '@/building/mains';
import { playRelay } from '../stairwell/stairSounds';
import { LAMP_LIGHT } from '../lighting/lampColours';
import { basic, paint } from '../materials/palette';
import { boxMesh, cylinderMesh, invisibleHitbox } from '../meshUtils';
import { Prop } from '../props/Prop';
import { CELL, CELLAR_PLAN as plan, CROWN, cellAt, cellCentre, isOpen } from './cellarPlan';

/** The bare bulbs: how far under the crown, how bright the two real lights over the lit ones are, how far they reach. */
const BULB_DROP = 0.32;
const BULB_INTENSITY = 5;
const BULB_REACH = 5.5;
const LIGHTS = 2;
/** Seconds a bulb takes to come up and to go out. */
const WARM_S = 0.2;
const COOL_S = 0.6;
/** The timer buttons' height on the wall (m). */
const BUTTON_Y = 1.3;
const BULB_WARM = LAMP_LIGHT.incandescent.clone();
const PILOT = new THREE.Color(0xff7a1a);
const scratch = new THREE.Vector3();
const forward = new THREE.Vector3();
const turn = new THREE.Quaternion();

/**
 * The cellars' light: the player's torch (a shadowless spot held a little to the right and below the eye, aimed
 * where they look: always on, it runs on batteries, so it is the light in a power cut too), the bare bulbs on the
 * building's timer (one in a few cells, `CELLAR_PLAN.bulbs`; any wall button lights them all for `timerS`, then they
 * go out with a clack; no power, no light), two shadowless point lights over the lit bulbs nearest the player, and a
 * faint hemisphere while the player is down here so the dark is not black. Zone-local; the buttons are placed by the
 * builder (`buttons`, clickable).
 */
export class CellarLights extends Prop implements Updatable, OccupancyAware {
  readonly contactShadow = false;
  readonly buttons: TimerButton[] = [];
  private readonly torch: THREE.SpotLight;
  private readonly bulbs: THREE.PointLight[] = [];
  private readonly spots: THREE.Vector3[];
  private readonly globes: THREE.InstancedMesh;
  private readonly colour = new THREE.Color();
  private readonly ambient: THREE.HemisphereLight;
  private readonly eye = new THREE.Vector3();
  private left = 0;
  private glow = 0;
  private occupied = false;

  constructor(private readonly viewer: THREE.Object3D) {
    super();
    this.name = 'CellarLights';
    this.spots = plan.bulbs.map(([c, r]) => {
      const [x, z] = cellCentre(c, r);
      return new THREE.Vector3(x, CROWN - BULB_DROP, z);
    });
    this.globes = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }), this.spots.length);
    const cord = paint(0x1a1a1a, 0.6);
    this.spots.forEach((at, i) => {
      this.globes.setMatrixAt(i, new THREE.Matrix4().makeTranslation(at.x, at.y, at.z));
      this.globes.setColorAt(i, this.colour.copy(BULB_WARM).multiplyScalar(0.1));
      this.add(cylinderMesh(0.004, BULB_DROP - 0.04, cord, { x: at.x, y: at.y + BULB_DROP / 2, z: at.z }, { segments: 4 }));
      const button = new TimerButton(() => this.press());
      const wall = wallFor(plan.bulbs[i]!);
      button.position.set(wall.x, BUTTON_Y, wall.z);
      button.rotation.y = wall.yaw;
      this.buttons.push(button);
    });
    this.globes.castShadow = false;
    this.globes.computeBoundingSphere();
    this.add(this.globes);
    for (let i = 0; i < LIGHTS; i++) {
      const light = new THREE.PointLight(BULB_WARM, 0, BULB_REACH, 2);
      light.castShadow = false;
      light.position.copy(this.spots[i]!);
      this.bulbs.push(light);
      this.add(light);
    }
    const { torch } = plan;
    this.torch = new THREE.SpotLight(0xfff2dc, 0, torch.distance, torch.angle, torch.penumbra, 2);
    this.torch.castShadow = false;
    this.add(this.torch, this.torch.target);
    this.ambient = new THREE.HemisphereLight(0x8a8478, 0x2a2420, 0);
    this.add(this.ambient);
  }

  setOccupied(occupied: boolean): void {
    this.occupied = occupied;
  }

  /** How lit it is where the player stands: the bulbs on, else only the torch. */
  lightLevel(): number {
    return 0.12 + 0.45 * this.glow;
  }

  /** A timer button: every bulb on for the timer's time; false without power. */
  press(): boolean {
    if (!mainsOn()) return false;
    if (this.left <= 0) this.clack(true);
    this.left = plan.timerS;
    return true;
  }

  update(dt: number): void {
    this.viewer.getWorldPosition(this.eye);
    this.worldToLocal(this.eye);
    if (!mainsOn() && this.left > 0) this.left = 0;
    if (this.left > 0) {
      this.left -= dt;
      if (this.left <= 0) this.clack(false);
    }
    const target = this.left > 0 ? 1 : 0;
    const before = this.glow;
    this.glow = THREE.MathUtils.clamp(this.glow + (target > this.glow ? dt / WARM_S : -dt / COOL_S), 0, 1);
    if (this.glow !== before) {
      for (let i = 0; i < this.spots.length; i++) this.globes.setColorAt(i, this.colour.copy(BULB_WARM).multiplyScalar(0.1 + 1.6 * this.glow));
      if (this.globes.instanceColor) this.globes.instanceColor.needsUpdate = true;
      for (const button of this.buttons) button.setPilot(1 - this.glow);
    }
    // The two real lights over the bulbs nearest the player.
    // The i-th nearest spot by rank (how many are nearer, ties to the lower index): no array sorted every frame.
    for (let s = 0; s < this.spots.length; s++) {
      const d = this.spots[s]!.distanceToSquared(this.eye);
      let rank = 0;
      for (let o = 0; o < this.spots.length; o++) {
        const e = this.spots[o]!.distanceToSquared(this.eye);
        if (e < d || (e === d && o < s)) rank++;
      }
      if (rank < this.bulbs.length) this.bulbs[rank]!.position.copy(this.spots[s]!);
    }
    for (const light of this.bulbs) light.intensity = this.occupied ? BULB_INTENSITY * this.glow : 0;
    this.aimTorch();
    this.ambient.intensity = this.occupied ? 0.05 + 0.12 * this.glow : 0;
  }

  /** The torch in the right hand, a little below the eye, aimed where the player looks. */
  private aimTorch(): void {
    const camera = this.viewer;
    camera.getWorldQuaternion(turn);
    forward.set(0, 0, -1).applyQuaternion(turn);
    scratch.set(0.18, -0.28, 0).applyQuaternion(turn);
    this.viewer.getWorldPosition(this.torch.position).add(scratch);
    this.worldToLocal(this.torch.position);
    this.viewer.getWorldPosition(this.torch.target.position).addScaledVector(forward, 6);
    this.worldToLocal(this.torch.target.position);
    this.torch.target.updateMatrixWorld();
    this.torch.intensity = this.occupied ? plan.torch.intensity : 0;
  }

  /** The timer's relay, somewhere up the stairs, heard down here. */
  private clack(on: boolean): void {
    if (this.occupied) playRelay(0.0006, on);
  }
}

/** Where a bulb's timer button goes: on the first wall of its cell (a solid neighbour), its middle and yaw facing in. */
function wallFor([c, r]: [number, number]): { x: number; z: number; yaw: number } {
  const [x, z] = cellCentre(c, r);
  const h = CELL / 2 - 0.012;
  const sides: [number, number, number, number, number][] = [
    [0, 1, 0.35, h, Math.PI],
    [1, 0, h, 0.35, -Math.PI / 2],
    [0, -1, -0.35, -h, 0],
    [-1, 0, -h, -0.35, Math.PI / 2],
  ];
  for (const [dc, dr, ox, oz, yaw] of sides) {
    const n = cellAt(c + dc, r + dr);
    if (!isOpen(c + dc, r + dr) && !/\d/.test(n)) return { x: x + ox, z: z + oz, yaw };
  }
  return { x, z, yaw: 0 };
}

/**
 * A timer push button on the cellar's brick: a bakelite box with a round button, an orange pilot glowing while the
 * bulbs are out. Click: the bulbs come on for a minute (no power: nothing). Origin on the wall, facing +z.
 */
export class TimerButton extends Prop implements Interactable {
  readonly contactShadow = false;
  readonly hitboxes: THREE.Object3D[];
  private readonly pilot: THREE.MeshBasicMaterial;

  constructor(private readonly onPress: () => boolean) {
    super();
    this.name = 'TimerButton';
    this.add(boxMesh(0.08, 0.1, 0.03, paint(0x1c1a18, 0.4), { z: 0.015 }));
    this.pilot = new THREE.MeshBasicMaterial({ color: PILOT });
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.018, 14), this.pilot);
    dot.position.z = 0.032;
    this.add(dot);
    this.add(cylinderMesh(0.004, 0.004, basic({ color: 0x111111 }), { y: 0.035, z: 0.033 }, { segments: 6 }));
    const hitbox = invisibleHitbox(0.14, 0.16, 0.08, { z: 0.03 });
    this.hitboxes = [hitbox];
    this.add(hitbox);
  }

  /** The pilot's glow, 0 .. 1 (on while the bulbs are dark). */
  setPilot(amount: number): void {
    this.pilot.color.copy(PILOT).multiplyScalar(0.15 + 0.85 * amount);
  }

  setHovered(): void {}

  label(): string {
    return 'Light timer · press';
  }

  activate(session: SessionActions): void {
    if (!this.onPress()) session.refuse('Click. Nothing: the power is off.');
  }
}
