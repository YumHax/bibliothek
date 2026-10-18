import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Collisions } from '@/core/Collider';
import type { SessionActions } from '@/game/SessionActions';
import { audioBus, startedAudioContext } from '@/audio/audioContext';
import type { OccupancyAware } from '../Furniture';
import { boxMesh } from '../meshUtils';
import { standard } from '../materials/palette';
import { Prop } from '../props/Prop';
import { arriveNextAt } from '../travel/nextArrival';
import { LiftButton, panelButton } from '../stairwell/LiftButton';
import { FoldingGate } from '../stairwell/FoldingGate';
import { buildCarShell, floorMark, panelSpot } from '../stairwell/liftBody';
import { STAIRWELL_PLAN } from '../stairwell/stairwellPlan'; // imports-ok: the attic's lift stop stands over the stairwell's car
import { landingY } from '@/world/measures/building';
import { ATTIC_PLAN as plan } from './atticPlan';

const GATE_SECONDS = 0.45;
/** Seconds between the gate shutting and the view going dark on the way down. */
const SINK_DELAY = 0.7;
const IRON = standard({ color: 0x1c1d20, roughness: 0.45, metalness: 0 });

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
  private readonly gate: FoldingGate;
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
    const h = car.height;
    // The car, the stairwell's own (`stairwell/liftBody`): panelled walls, mirror, dome lamp, brass panel.
    buildCarShell(this, car, this.lamp);
    // The cage's posts and its top, up into the dark of the winding room.
    for (const x of [car.x0 - 0.05, car.x1 + 0.05]) this.add(boxMesh(0.05, plan.corridorHeight, 0.05, IRON, { x, y: plan.corridorHeight / 2, z: car.z1 + 0.04 }));
    // The folding gate, from its west post.
    this.gate = new FoldingGate(w, h);
    this.gate.position.set(car.x0, 0, car.z1 + 0.04);
    this.add(this.gate);
    // The car's walls hold the player in; the gate is its own collider, there while it is not open.
    const box = (x0: number, z0: number, x1: number, z1: number): void => {
      this.colliders.push(new THREE.Box3(new THREE.Vector3(x0, 0, z0), new THREE.Vector3(x1, h, z1)));
    };
    box(car.x0 - 0.06, car.z0 - 0.06, car.x0 + 0.03, car.z1);
    box(car.x1 - 0.03, car.z0 - 0.06, car.x1 + 0.06, car.z1);
    box(car.x0 - 0.06, car.z0 - 0.06, car.x1 + 0.06, car.z0 + 0.03);
    // Its one live button, the 5th floor's, where it is on the stairwell car's panel.
    this.button = new LiftButton(
      () => (this.phase === 'leaving' || this.phase === 'closing' ? 'Going down…' : 'The 5th floor · go down'),
      (session) => this.goDown(session),
      panelButton(floorMark(0)),
    );
    this.button.rotation.y = -Math.PI / 2;
    const spot = panelSpot(car, 0);
    this.button.position.set(spot.x, spot.y, spot.z);
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
    this.gate.setOpen(this.open);
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
