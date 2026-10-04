import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Collisions } from '@/core/Collider';
import type { SessionActions } from '@/game/SessionActions';
import { audioBus, startedAudioContext } from '@/audio/audioContext';
import type { OccupancyAware } from '../Furniture';
import { boxMesh } from '../meshUtils';
import { paint, standard } from '../materials/palette';
import { PROUD } from '../props/joinery';
import { Prop } from '../props/Prop';
import { arriveNextAt } from '../travel/nextArrival';
import { LiftButton } from '../stairwell/LiftButton';
import { STAIRWELL_PLAN } from '../stairwell/stairwellPlan'; // imports-ok: the attic's lift stop stands over the stairwell's car
import { landingY } from '@/world/measures/building';
import { ATTIC_PLAN as plan } from './atticPlan';

const GATE_SECONDS = 0.45;
/** Seconds between the gate shutting and the view going dark on the way down. */
const SINK_DELAY = 0.7;
const WOOD = paint(0x5a3120, 0.45);
const IRON = standard({ color: 0x1c1d20, roughness: 0.45, metalness: 0 });
/** The gate's bars: this many, folding towards the west post. */
const BARS = 9;

type Phase = 'shut' | 'opening' | 'open' | 'closing' | 'leaving';

/**
 * The top of the old lift, in the attic: the iron cage's last few metres, the wooden car the
 * stairwell's lift became on the way up (`stairwell/Lift`'s code), its folding gate onto the
 * corridor. It opens for the player as they arrive; its panel has one button that still answers,
 * the 5th floor's: the gate folds shut, the motor groans, and the stairwell takes over behind a fade
 * (the player set down in the stairwell's car on our landing, whose gate opens for them). Zone-local,
 * placed at the attic's origin.
 */
export class AtticLift extends Prop implements Updatable, OccupancyAware {
  readonly contactShadow = false;
  readonly colliders: THREE.Box3[] = [];
  readonly button: LiftButton;
  private readonly gate = new THREE.Group();
  private readonly lamp = new THREE.MeshBasicMaterial({ color: 0xffe2b0 });
  private phase: Phase = 'shut';
  private open = 0;
  private wait = 0;
  private session: SessionActions | null = null;
  private gateBox: THREE.Box3 | null = null;
  private gateLive = false;
  private clock = 0;

  constructor(
    private readonly collisions: Collisions,
    /** The camera: the player must stand in the car for its button to send it. */
    private readonly viewer: THREE.Object3D,
    private readonly onArrive: () => void,
  ) {
    super();
    this.name = 'AtticLift';
    const { car } = plan;
    const w = car.x1 - car.x0;
    const d = car.z1 - car.z0;
    const cx = (car.x0 + car.x1) / 2;
    const cz = (car.z0 + car.z1) / 2;
    const h = car.height;
    // The car: floor, three wooden walls, its ceiling and lamp, the mirror, the brass panel.
    this.add(boxMesh(w, 0.08, d, WOOD, { x: cx, y: -0.04 + PROUD, z: cz }));
    this.add(boxMesh(0.03, h, d, WOOD, { x: car.x0 + 0.015, y: h / 2, z: cz }));
    this.add(boxMesh(0.03, h, d, WOOD, { x: car.x1 - 0.015, y: h / 2, z: cz }));
    this.add(boxMesh(w, h, 0.03, WOOD, { x: cx, y: h / 2, z: car.z0 + 0.015 }));
    // The roof up to the lintel's plaster (5 cm over the car, `AtticShell`), not into its plane.
    this.add(boxMesh(w, 0.05, d, WOOD, { x: cx, y: h + 0.025, z: cz }));
    const mirror = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.6, 1.1), standard({ color: 0xa8b0b4, metalness: 1, roughness: 0.25 }));
    mirror.position.set(cx, 1.35, car.z0 + 0.03 + PROUD);
    this.add(mirror);
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.04, 16), this.lamp);
    lamp.position.set(cx, h - 0.02, cz);
    this.add(lamp);
    this.add(boxMesh(0.02, 0.5, 0.16, standard({ color: 0xc9a75b, metalness: 1, roughness: 0.32 }), { x: car.x1 - 0.035, y: 1.2, z: cz }));
    // The cage's posts and its top, up into the dark of the winding room.
    for (const x of [car.x0 - 0.05, car.x1 + 0.05]) this.add(boxMesh(0.05, plan.corridorHeight, 0.05, IRON, { x, y: plan.corridorHeight / 2, z: car.z1 + 0.04 }));
    // The folding gate: bars from its west post, squeezed together as it opens.
    this.gate.position.set(car.x0, 0, car.z1 + 0.04);
    for (let i = 0; i < BARS; i++) {
      const bar = boxMesh(0.012, h, 0.012, IRON, { x: ((i + 0.5) / BARS) * w, y: h / 2 });
      this.gate.add(bar);
    }
    for (const y of [0.1, h / 2, h - 0.08]) this.gate.add(boxMesh(w, 0.02, 0.01, IRON, { x: w / 2, y }));
    this.add(this.gate);
    // The car's walls hold the player in; the gate is its own collider, there while it is not open.
    const box = (x0: number, z0: number, x1: number, z1: number): void => {
      this.colliders.push(new THREE.Box3(new THREE.Vector3(x0, 0, z0), new THREE.Vector3(x1, h, z1)));
    };
    box(car.x0 - 0.06, car.z0 - 0.06, car.x0 + 0.03, car.z1);
    box(car.x1 - 0.03, car.z0 - 0.06, car.x1 + 0.06, car.z1);
    box(car.x0 - 0.06, car.z0 - 0.06, car.x1 + 0.06, car.z0 + 0.03);
    // Its one live button, on the panel facing in.
    this.button = new LiftButton(
      () => (this.phase === 'leaving' || this.phase === 'closing' ? 'Going down…' : 'The 5th floor · go down'),
      (session) => this.goDown(session),
    );
    this.button.rotation.y = -Math.PI / 2;
    this.button.position.set(car.x1 - 0.047, 1.3, cz + 0.03);
  }

  override get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  setOccupied(occupied: boolean): void {
    if (!occupied) return;
    // Just come up: the gate folds open onto the corridor.
    if (this.phase === 'shut' || this.phase === 'leaving') {
      this.phase = 'opening';
      this.onArrive();
    }
  }

  update(dt: number): void {
    this.clock += dt;
    if (!this.gateBox) this.gateBox = new THREE.Box3(new THREE.Vector3(plan.car.x0, 0, plan.car.z1 - 0.02), new THREE.Vector3(plan.car.x1, plan.car.height, plan.car.z1 + 0.08)).applyMatrix4(this.matrixWorld);
    switch (this.phase) {
      case 'opening':
        this.open = Math.min(1, this.open + dt / GATE_SECONDS);
        if (this.open >= 1) {
          this.phase = 'open';
          clank();
        }
        break;
      case 'closing':
        this.open = Math.max(0, this.open - dt / GATE_SECONDS);
        if (this.open <= 0) {
          clank();
          this.phase = 'leaving';
          this.wait = SINK_DELAY;
          groan();
        }
        break;
      case 'leaving':
        this.wait -= dt;
        if (this.wait <= 0 && this.session) {
          this.leave(this.session);
          this.session = null;
        }
        break;
      default:
        break;
    }
    this.gate.scale.x = 1 - 0.85 * this.open;
    const flicker = this.phase === 'leaving' && Math.sin(this.clock * 31) > 0.4 ? 0.3 : 1;
    this.lamp.color.setRGB(flicker, 0.89 * flicker, 0.69 * flicker);
    const shut = this.phase !== 'open';
    if (shut !== this.gateLive) {
      if (shut) this.collisions.add(this.gateBox);
      else this.collisions.remove(this.gateBox);
      this.gateLive = shut;
    }
  }

  dispose(): void {
    if (this.gateLive && this.gateBox) this.collisions.remove(this.gateBox);
  }

  private goDown(session: SessionActions): void {
    if (this.phase === 'closing' || this.phase === 'leaving') return;
    const eye = this.worldToLocal(this.viewer.getWorldPosition(new THREE.Vector3()));
    const { car } = plan;
    if (eye.x < car.x0 || eye.x > car.x1 || eye.z < car.z0 || eye.z > car.z1 + 0.1) {
      session.refuse('Step into the car first.');
      return;
    }
    this.session = session;
    this.phase = 'closing';
    session.react('Down to the 5th. The car shudders, then sinks.');
  }

  /** The view goes dark; the stairwell's car brings the player out on our landing. */
  private leave(session: SessionActions): void {
    const s = STAIRWELL_PLAN;
    const at = new THREE.Vector3(s.origin[0] + (s.car.x0 + s.car.x1) / 2, s.origin[1] + landingY(0), s.origin[2] + (s.car.z0 + s.car.z1) / 2 + plan.arrival.towardGate);
    arriveNextAt('stairwell', at, plan.arrival.yaw);
    session.travel('stairwell');
  }
}

/** The gate folding home: an iron clack. */
function clank(): void {
  const ctx = startedAudioContext();
  if (!ctx) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(420, t);
  osc.frequency.exponentialRampToValueAtTime(90, t + 0.12);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.06, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  osc.connect(gain).connect(audioBus(ctx, 'world'));
  osc.start(t);
  osc.stop(t + 0.18);
}

/** The old motor labouring as the car sets off down. */
function groan(): void {
  const ctx = startedAudioContext();
  if (!ctx) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(34, t);
  osc.frequency.linearRampToValueAtTime(48, t + 1.2);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 220;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.05, t + 0.3);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
  osc.connect(filter).connect(gain).connect(audioBus(ctx, 'world'));
  osc.start(t);
  osc.stop(t + 1.5);
}
