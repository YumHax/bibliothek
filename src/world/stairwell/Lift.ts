import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Collisions } from '@/core/Collider';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { startedAudioContext } from '@/audio/audioContext';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { invisibleHitbox } from '../meshUtils';
import { Prop } from '../props/Prop';
import type { OccupancyAware } from '../Furniture';
import { STAIRWELL_PLAN as plan, STOREYS, landingY } from './stairwellPlan';

export interface LiftOptions {
  /** The zone's collision set: the gates' boxes come and go as they open and shut (world space). */
  collisions: Collisions;
  /** The ears (the camera): the motor and the gates are heard from where it is. */
  listener: THREE.Object3D;
}

type Phase = 'shut' | 'opening' | 'open' | 'closing' | 'moving';

/** The two floors it stops at: ours (0) and the entrance hall's (`STOREYS`). */
const STOPS = [0, STOREYS] as const;
const GATE_SECONDS = 0.9;
const GATE_HEIGHT = 2.15;
const CAGE = { x0: plan.car.x0 - 0.05, x1: plan.car.x1 + 0.05, z0: plan.car.z0 - 0.05, z1: plan.car.z1 + 0.05 };
const TOP = landingY(0) + 2.8;
const WOOD = new THREE.MeshStandardMaterial({ color: 0x5a3120, roughness: 0.45 });
const BRASS = new THREE.MeshStandardMaterial({ color: 0xc9a75b, metalness: 0.85, roughness: 0.3, emissive: 0xffb050, emissiveIntensity: 0 });
const IRON = new THREE.MeshStandardMaterial({ color: 0x1c1d20, roughness: 0.45, metalness: 0.6 });

/**
 * The old lift in the stairwell's well: an iron cage the full height of the building, a wooden car
 * riding in it between our landing and the entrance hall (the only two floors it stops at), folding
 * lattice gates on every landing. Click the brass button on the landing to call it, the panel in
 * the car to ride: the gate folds shut, the car hums down (or up) the shaft with the player in it
 * (`floorAt` is their ground while inside), the gate folds open. The gates are colliders while
 * shut; while the car moves a box across its open front keeps the player in. Heard where it is.
 */
export class Lift extends Prop implements Updatable, OccupancyAware {
  readonly contactShadow = false;
  /** The gates on the floors it never stops at: always shut. */
  readonly colliders: THREE.Box3[] = [];
  /** The call buttons on our landing and in the hall, and the panel in the car: for the builder to place. */
  readonly buttons: LiftButton[] = [];
  private readonly rideButton: LiftButton;
  private readonly car = new THREE.Group();
  private readonly gates = new Map<number, THREE.Mesh>();
  private readonly lamp: THREE.MeshBasicMaterial;
  private phase: Phase = 'shut';
  private stop: number = STOPS[0];
  private target: number = STOPS[0];
  private y = landingY(STOPS[0]);
  private gate = 0;
  /** World boxes: the gate at each stop, and the car's open front while it moves. */
  private gateBoxes = new Map<number, THREE.Box3>();
  private readonly frontBox = new THREE.Box3();
  private readonly scratchMin = new THREE.Vector3();
  private readonly scratchMax = new THREE.Vector3();
  private readonly live = new Set<THREE.Box3>();
  /** Scratch for `inGateway`: a gate's box grown by the player's body (and up to the eye). */
  private readonly gateway = new THREE.Box3();
  private readonly reach = new THREE.Vector3(0.35, 0.3, 0.35);
  private laidOut = false;
  private occupied = false;
  private hum: { ctx: AudioContext; gain: GainNode; osc: OscillatorNode } | null = null;
  private readonly ear = new THREE.Vector3();
  private readonly here = new THREE.Vector3();

  constructor(private readonly options: LiftOptions) {
    super();
    this.name = 'Lift';
    this.buildCage();
    this.lamp = new THREE.MeshBasicMaterial({ color: 0xffe2b0 });
    this.buildCar();
    this.add(this.car);
    // The buttons are placed in the zone on their own (to be clickable); the one in the car rides with it (`render`).
    for (const k of STOPS) {
      const call = new LiftButton(() => this.callLabel(k), (session) => this.call(k, session));
      // On the cage's front post, east of the gate, facing the landing.
      call.position.set(CAGE.x1 + 0.02, landingY(k) + 1.15, CAGE.z1 + 0.04);
      this.buttons.push(call);
    }
    this.rideButton = new LiftButton(() => this.rideLabel(), (session) => this.ride(session));
    this.rideButton.rotation.y = -Math.PI / 2;
    this.buttons.push(this.rideButton);
    // The gates it never stops at are shut for good.
    for (let k = 1; k < STOREYS; k++) {
      const y = landingY(k);
      this.colliders.push(new THREE.Box3(new THREE.Vector3(plan.car.x0, y, plan.car.z1 - 0.05), new THREE.Vector3(plan.car.x1, y + GATE_HEIGHT, plan.car.z1 + 0.05)));
    }
    this.render();
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  /** The car's floor (local) under (x, z) when the feet are in it, else null. */
  floorAt(x: number, z: number, feet: number): number | null {
    const { car } = plan;
    if (x < car.x0 || x > car.x1 || z < car.z0 || z > car.z1 + 0.05) return null;
    return Math.abs(feet - this.y) < 1.2 ? this.y : null;
  }

  setOccupied(occupied: boolean): void {
    this.occupied = occupied;
    if (!occupied) this.hum?.gain.gain.setTargetAtTime(0, this.hum.ctx.currentTime, 0.2);
  }

  dispose(): void {
    this.hum?.osc.stop();
    this.hum = null;
    for (const box of this.live) this.options.collisions.remove(box);
    this.live.clear();
  }

  update(dt: number): void {
    if (!this.laidOut) this.layOut();
    switch (this.phase) {
      case 'opening':
        this.gate = Math.min(1, this.gate + dt / GATE_SECONDS);
        if (this.gate >= 1) this.phase = 'open';
        break;
      case 'open':
        // Called away while the player stood in the gateway: it shuts once they are clear.
        if (this.target !== this.stop && !this.inGateway(this.stop)) this.phase = 'closing';
        break;
      case 'closing':
        // Somebody in the gateway: the gate folds back open rather than shut on them (and they would walk through its box).
        if (this.inGateway(this.stop)) {
          this.phase = 'opening';
          break;
        }
        this.gate = Math.max(0, this.gate - dt / GATE_SECONDS);
        if (this.gate <= 0) {
          this.clank();
          this.phase = this.target === this.stop ? 'shut' : 'moving';
        }
        break;
      case 'moving': {
        const goal = landingY(this.target);
        const from = landingY(this.stop);
        const left = Math.abs(goal - this.y);
        const done = Math.abs(from - this.y);
        // Easing off near either end, a lift's gentle start and stop.
        const speed = plan.liftSpeed * Math.min(1, 0.25 + Math.min(left, done) / 1.2);
        const step = Math.min(left, speed * dt);
        this.y += Math.sign(goal - this.y) * step;
        if (left - step < 0.002) {
          this.y = goal;
          this.stop = this.target;
          this.phase = 'opening';
          this.clank();
        }
        break;
      }
      default:
        break;
    }
    this.render();
    this.syncColliders();
    this.sound();
  }

  private callLabel(k: number): string {
    if (this.phase === 'moving') return 'The lift is on its way';
    if (this.stop === k && (this.phase === 'open' || this.phase === 'opening')) return 'The lift is here';
    return 'Click to call the lift';
  }

  private rideLabel(): string {
    if (this.phase === 'moving') return 'Going…';
    return this.stop === 0 ? 'Click to go down to the ground floor' : 'Click to go up to the fifth floor';
  }

  private call(k: number, session: SessionActions): void {
    if (this.phase === 'moving') {
      session.hint('The lift is on its way.');
      return;
    }
    if (this.stop === k) {
      if (this.phase === 'shut' || this.phase === 'closing') this.phase = 'opening';
      return;
    }
    this.target = k;
    this.phase = 'closing';
    session.hint('Somewhere above or below, the lift wakes up with a clank.');
  }

  private ride(session: SessionActions): void {
    if (this.phase === 'moving') return;
    this.target = this.stop === 0 ? STOREYS : 0;
    this.phase = 'closing';
    session.hint(this.target === 0 ? 'Up to the fifth floor. The cage creaks.' : 'Down to the ground floor. The cage creaks.');
  }

  private render(): void {
    this.car.position.y = this.y;
    this.rideButton.position.set(plan.car.x1 - 0.05, this.y + 1.2, (plan.car.z0 + plan.car.z1) / 2);
    for (const [k, gate] of this.gates) {
      const open = k === this.stop && this.phase !== 'moving' ? this.gate : 0;
      // The lattice folds towards its west post.
      gate.scale.x = 1 - 0.85 * open;
    }
    this.lamp.color.setScalar(this.phase === 'moving' ? 0.95 : 1);
  }

  /** The gate boxes in world space, once placed. */
  private layOut(): void {
    this.laidOut = true;
    for (const k of STOPS) {
      const y = landingY(k);
      const box = new THREE.Box3(new THREE.Vector3(plan.car.x0, y, plan.car.z1 - 0.05), new THREE.Vector3(plan.car.x1, y + GATE_HEIGHT, plan.car.z1 + 0.05));
      this.gateBoxes.set(k, box.applyMatrix4(this.matrixWorld));
    }
  }

  /** Whether the player (the camera) stands in stop `k`'s gateway, body and all. */
  private inGateway(k: number): boolean {
    const box = this.gateBoxes.get(k);
    if (!box) return false;
    this.options.listener.getWorldPosition(this.ear);
    this.gateway.copy(box).expandByVector(this.reach);
    return this.gateway.containsPoint(this.ear);
  }

  /** Each stop's gate blocks while it is not open with the car behind it; the car's front blocks while it moves. */
  private syncColliders(): void {
    const want = new Set<THREE.Box3>();
    for (const [k, box] of this.gateBoxes) if (!(k === this.stop && this.phase === 'open')) want.add(box);
    if (this.phase === 'moving' || this.phase === 'closing') {
      // One box moved in place with the car (the collision set holds it by reference).
      this.frontBox.set(this.scratchMin.set(plan.car.x0, this.y, plan.car.z1 - 0.12), this.scratchMax.set(plan.car.x1, this.y + GATE_HEIGHT, plan.car.z1 - 0.04)).applyMatrix4(this.matrixWorld);
      want.add(this.frontBox);
    }
    for (const box of this.live) {
      if (!want.has(box)) {
        this.options.collisions.remove(box);
        this.live.delete(box);
      }
    }
    for (const box of want) {
      if (this.live.has(box)) continue;
      this.options.collisions.add(box);
      this.live.add(box);
    }
  }

  /** The motor's hum while it moves, fainter with distance. */
  private sound(): void {
    const ctx = startedAudioContext();
    if (!ctx) return;
    if (!this.hum) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 52;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 240;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(filter).connect(gain).connect(ctx.destination);
      osc.start();
      this.hum = { ctx, gain, osc };
    }
    this.options.listener.getWorldPosition(this.ear);
    this.car.getWorldPosition(this.here);
    const d = this.ear.distanceTo(this.here);
    const level = this.occupied && this.phase === 'moving' ? 0.05 / (1 + (d * d) / 20) : 0;
    this.hum.gain.gain.setTargetAtTime(level, ctx.currentTime, 0.3);
    this.hum.osc.frequency.setTargetAtTime(this.phase === 'moving' ? 55 : 45, ctx.currentTime, 0.4);
  }

  /** A gate folding shut or open: an iron clack. */
  private clank(): void {
    const ctx = startedAudioContext();
    if (!ctx || !this.occupied) return;
    this.options.listener.getWorldPosition(this.ear);
    this.car.getWorldPosition(this.here);
    const d = this.ear.distanceTo(this.here);
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(420, t);
    osc.frequency.exponentialRampToValueAtTime(90, t + 0.12);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.08 / (1 + (d * d) / 12), t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.18);
  }

  /** The iron cage the full height of the shaft: four posts, lattice on three sides, a gate on every landing and lattice between. */
  private buildCage(): void {
    const height = TOP;
    for (const x of [CAGE.x0, CAGE.x1]) {
      for (const z of [CAGE.z0, CAGE.z1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, height, 0.05), IRON);
        post.position.set(x, height / 2, z);
        this.add(post);
      }
    }
    const lattice = new THREE.MeshStandardMaterial({ map: latticeTexture(), color: 0x2a2b2e, metalness: 0.5, roughness: 0.5, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide });
    const panel = (width: number, h: number): THREE.PlaneGeometry => {
      const g = new THREE.PlaneGeometry(width, h);
      const uv = g.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * width * 4, uv.getY(i) * h * 4);
      return g;
    };
    const w = CAGE.x1 - CAGE.x0;
    const d = CAGE.z1 - CAGE.z0;
    const sides: [THREE.PlaneGeometry, number, number, number][] = [
      [panel(d, height), CAGE.x0, (CAGE.z0 + CAGE.z1) / 2, Math.PI / 2],
      [panel(d, height), CAGE.x1, (CAGE.z0 + CAGE.z1) / 2, Math.PI / 2],
      [panel(w, height), (CAGE.x0 + CAGE.x1) / 2, CAGE.z0, 0],
    ];
    for (const [g, x, z, yaw] of sides) {
      const mesh = new THREE.Mesh(g, lattice);
      mesh.position.set(x, height / 2, z);
      mesh.rotation.y = yaw;
      this.add(mesh);
    }
    // The front: a gate on every landing, lattice between.
    for (let k = 0; k <= STOREYS; k++) {
      const y = landingY(k);
      const g = panel(w - 0.1, GATE_HEIGHT);
      // Pivot on the west post, so scaling in x folds it towards there.
      g.translate((w - 0.1) / 2, GATE_HEIGHT / 2, 0);
      const gate = new THREE.Mesh(g, lattice);
      gate.position.set(CAGE.x0 + 0.05, y, plan.car.z1 + 0.04);
      this.add(gate);
      this.gates.set(k, gate);
      const above = k === 0 ? TOP - (y + GATE_HEIGHT) : landingY(k - 1) - (y + GATE_HEIGHT);
      if (above > 0.05) {
        const fill = new THREE.Mesh(panel(w, above), lattice);
        fill.position.set((CAGE.x0 + CAGE.x1) / 2, y + GATE_HEIGHT + above / 2, plan.car.z1 + 0.05);
        this.add(fill);
      }
    }
  }

  /** The car: floor, wooden walls on three sides, a mirror, the ceiling and its lamp, the button panel. */
  private buildCar(): void {
    const { car } = plan;
    const w = car.x1 - car.x0;
    const d = car.z1 - car.z0;
    const cx = (car.x0 + car.x1) / 2;
    const cz = (car.z0 + car.z1) / 2;
    const add = (g: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
      const mesh = new THREE.Mesh(g, material);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.car.add(mesh);
      return mesh;
    };
    add(new THREE.BoxGeometry(w, 0.08, d), WOOD, cx, -0.04, cz);
    add(new THREE.BoxGeometry(0.03, car.height, d), WOOD, car.x0 + 0.015, car.height / 2, cz);
    add(new THREE.BoxGeometry(0.03, car.height, d), WOOD, car.x1 - 0.015, car.height / 2, cz);
    add(new THREE.BoxGeometry(w, car.height, 0.03), WOOD, cx, car.height / 2, car.z0 + 0.015);
    add(new THREE.BoxGeometry(w, 0.06, d), WOOD, cx, car.height + 0.03, cz);
    add(new THREE.PlaneGeometry(w * 0.6, 1.1), new THREE.MeshStandardMaterial({ color: 0xc8d2d8, metalness: 0.9, roughness: 0.08 }), cx, 1.35, car.z0 + 0.032);
    const lamp = add(new THREE.CylinderGeometry(0.12, 0.12, 0.04, 16), this.lamp, cx, car.height - 0.02, cz);
    lamp.castShadow = false;
    add(new THREE.BoxGeometry(0.02, 0.28, 0.14), BRASS, car.x1 - 0.035, 1.2, cz);
  }
}

/** A brass button (the call button on a landing, the panel in the car): a caption and a click. */
export class LiftButton extends Prop implements Interactable {
  readonly contactShadow = false;
  readonly hitboxes: THREE.Object3D[];

  constructor(private readonly caption: () => string, private readonly press: (session: SessionActions) => void) {
    super();
    this.name = 'LiftButton';
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.02), BRASS);
    plate.castShadow = true;
    this.add(plate);
    const hitbox = invisibleHitbox(0.22, 0.3, 0.2);
    this.hitboxes = [hitbox];
    this.add(hitbox);
  }

  setHovered(hovered: boolean): void {
    BRASS.emissiveIntensity = hovered ? 0.5 : 0;
  }

  label(): string {
    return this.caption();
  }

  activate(session: SessionActions): void {
    this.press(session);
  }
}

/** Diamond lattice of flat iron: an open pattern (alpha) that tiles. */
function latticeTexture(): THREE.CanvasTexture {
  const size = 64;
  const [canvas, ctx] = createCanvas(size, size);
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(size, size);
  ctx.moveTo(size, 0);
  ctx.lineTo(0, size);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, 3);
  const texture = toTexture(canvas, 4);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}
