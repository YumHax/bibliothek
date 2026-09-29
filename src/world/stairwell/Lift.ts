import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Collisions } from '@/core/Collider';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { audioBus, startedAudioContext } from '@/audio/audioContext';
import { QUALITY } from '@/graphics/quality';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { boxMesh, invisibleHitbox } from '../meshUtils';
import { markShared } from '../materials/sharedResources';
import { Prop } from '../props/Prop';
import { PROUD } from '../props/joinery';
import { coverageKeepsAlpha, paint, standard } from '../materials/palette';
import type { OccupancyAware } from '../Furniture';
import { STAIRWELL_PLAN as plan, STOREYS, landingY } from './stairwellPlan';
import { liftGate } from './stairRoutes';

export interface LiftOptions {
  /** The zone's collision set: the gates' boxes come and go as they open and shut (world space). */
  collisions: Collisions;
  /** The ears (the camera): the motor and the gates are heard from where it is. */
  listener: THREE.Object3D;
}

type Phase = 'shut' | 'opening' | 'open' | 'closing' | 'moving';

/** What a rider's trip in the lift hooks into (`Lift.carry`): all optional. */
export interface LiftRide {
  /** Whether they are at the gate, ready to step in once it stands open (default at once). */
  ready?: () => boolean;
  /** The gate is open for them at the first landing: they step in (a walker fades into the car). */
  board?: () => void;
  /** The gate is open at the other landing: they step out. */
  arrive?: () => void;
}

/** The lift as the residents and the postman use it: a real ride when it is free. */
export interface LiftRides {
  carry(from: number, to: number, ride: LiftRide): boolean;
}

/** The floors it stops at: every landing, ours (0) down to the entrance hall's (`STOREYS`). */
const STOPS = Array.from({ length: STOREYS + 1 }, (_, k) => k);
/** The two ends of its run, the only floors it comes to and sets off from by itself. */
const isEnd = (k: number): boolean => k === 0 || k === STOREYS;
/** The car's panel: one button a floor, this far apart (m), round this height in the car. */
const PANEL_PITCH = 0.075;
const PANEL_Y = 1.2;
const GATE_SECONDS = 0.45;
/** Standing in the car this long with its gate open sends it to the other stop (s). */
const DEPART_AFTER = 0.6;
/** The gate folds open by itself for anyone this close to it with the car behind it (m). */
const OPEN_NEAR = 1.8;
/** Seconds a rider takes to step in before the gate folds shut behind them. */
const BOARD_S = 1.1;
/** A ride not done in this long (the player took the car elsewhere) is given up: its rider just gets there. */
const RIDE_GIVE_UP_S = 45;
/** The eye over the feet (the player's), to know which landing they stand on. */
const EYE = 1.7;
const GATE_HEIGHT = 2.15;
const CAGE = { x0: plan.car.x0 - 0.05, x1: plan.car.x1 + 0.05, z0: plan.car.z0 - 0.05, z1: plan.car.z1 + 0.05 };
const TOP = landingY(0) + 2.8;
const WOOD = paint(0x5a3120, 0.45);
/** The lift's brass (each button lights a copy of its own on hover): kept across the stairwell's unloads. */
const BRASS = markShared(new THREE.MeshStandardMaterial({ color: 0xc9a75b, metalness: 1, roughness: 0.32, emissive: 0xffb050, emissiveIntensity: 0 }));
// Painted wrought iron: a dielectric (metalness 0).
const IRON = standard({ color: 0x1c1d20, roughness: 0.45, metalness: 0 });

/**
 * The old lift in the stairwell's well: an iron cage the full height of the building, a wooden car
 * riding in it between our landing and the entrance hall, stopping on every landing, folding
 * lattice gates on every landing. At the two ends it mostly runs itself (`autoPilot`): it comes to
 * the player on our landing or in the hall, opens for them, and leaves for the other end a beat
 * after they step in; on the floors between, the brass button on the landing calls it and the
 * gate opens as they walk up. The panel in the car sends it to any floor at once, even on its way. The gate folds shut, the car hums down (or up) the shaft with the player in it
 * (`floorAt` is their ground while inside), the gate folds open. The gates are colliders while
 * shut; while the car moves a box across its open front keeps the player in. Heard where it is.
 */
export class Lift extends Prop implements Updatable, OccupancyAware, LiftRides {
  readonly contactShadow = false;
  /** The call buttons on every landing, and the panel's in the car: for the builder to place. */
  readonly buttons: LiftButton[] = [];
  /** The panel's buttons, one a floor, and the floor each sends the car to. */
  private readonly panel: { button: LiftButton; k: number }[] = [];
  private readonly car = new THREE.Group();
  private readonly gates = new Map<number, THREE.Mesh>();
  private readonly lamp: THREE.MeshBasicMaterial;
  private phase: Phase = 'shut';
  private stop = 0;
  private target = 0;
  private y = landingY(0);
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
  /** The player's eye in the lift's (the zone's) frame, for the automatic calls and departures. */
  private readonly eye = new THREE.Vector3();
  /** Sent off by itself with the player in it (not by a button): if they step back out, it stays. */
  private autoDeparture = false;
  /** Whether standing in the car may send it: not again until the rider who came in it has stepped out. */
  private armed = true;
  private insideFor = 0;
  /** The player is in the car (from `autoPilot`): no resident is carried then. */
  private playerAboard = false;
  /** A resident's ride under way (`carry`). */
  private errand: (LiftRide & { from: number; to: number; stage: 'fetch' | 'board' | 'ride'; wait: number; left: number }) | null = null;

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
    // The panel's buttons ride with the car (`render`), on the east wall facing in: the top floor's highest.
    for (const k of STOPS) {
      const button = new LiftButton(() => this.rideLabel(k), (session) => this.ride(k, session), PANEL_BUTTON);
      button.rotation.y = -Math.PI / 2;
      this.panel.push({ button, k });
      this.buttons.push(button);
    }
    this.render();
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  /**
   * The car's floor (local) under (x, z) when the feet are in it, else null. Its shaft is walled all
   * the way up (the well's boxes, the gates), so whoever stands in it is in the car, however far the
   * feet are from its floor: the car moves on while the player's controller is paused (Esc, a panel,
   * a long frame), and the feet must catch it up rather than float in the shaft. Only the gateway's
   * lip, which is also the landing's edge, asks for the feet to be near the car.
   */
  floorAt(x: number, z: number, feet: number): number | null {
    const { car } = plan;
    if (x < car.x0 || x > car.x1 || z < car.z0 || z > car.z1 + 0.05) return null;
    if (z <= car.z1) return this.y;
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

  /**
   * A resident (or the postman) rides for real from landing `from` to `to`: the car is called to `from` (its clank,
   * its hum down the shaft), and once it stands open there and they are `ready`, `board`; a beat later the gate folds
   * shut and the car rides; open at `to`, `arrive`. Only while the lift idles with nobody in it: false otherwise (the
   * caller does without, fading them at the gate). Given up after a while (the player called the car away): the hooks
   * still run, so nobody is left waiting at a gate.
   */
  carry(from: number, to: number, ride: LiftRide): boolean {
    if (this.errand || from === to || this.phase === 'moving' || this.target !== this.stop || this.playerAboard) return false;
    this.errand = { ...ride, from, to, stage: 'fetch', wait: 0, left: RIDE_GIVE_UP_S };
    if (this.stop !== from) this.send(from, false);
    else if (this.phase === 'shut' || this.phase === 'closing') this.phase = 'opening';
    return true;
  }

  update(dt: number): void {
    if (!this.laidOut) this.layOut();
    this.autoPilot(dt);
    this.runErrand(dt);
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
        // Easing off near either end (the last 1.6 m), a lift's gentle start and stop.
        const speed = plan.liftSpeed * Math.min(1, 0.2 + Math.min(left, done) / 2);
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
    if (this.target === k && (this.phase === 'moving' || this.target !== this.stop)) return 'The lift is on its way';
    if (this.phase === 'moving' || this.target !== this.stop) return 'The lift is busy';
    if (this.stop === k) return 'The lift is here';
    return 'The lift · call';
  }

  private rideLabel(k: number): string {
    const floor = floorName(k);
    if (this.target === k && (this.phase === 'moving' || this.target !== this.stop)) return `Going to ${floor}…`;
    if (this.stop === k && this.phase !== 'moving') return `This is ${floor}`;
    return `${floor[0]!.toUpperCase()}${floor.slice(1)} · go`;
  }

  private call(k: number, session: SessionActions): void {
    if (this.phase === 'moving') {
      session.react(this.target === k ? 'The lift is on its way.' : `The lift is busy, off to ${floorName(this.target)}.`);
      return;
    }
    if (this.stop === k) {
      this.target = k;
      this.autoDeparture = false;
      if (this.phase === 'shut' || this.phase === 'closing') this.phase = 'opening';
      return;
    }
    this.send(k, false);
    session.react('Somewhere above or below, the lift wakes up with a clank.');
  }

  /** The panel in the car: off to floor `k` at once, even on the way elsewhere (then it turns there). */
  private ride(k: number, session: SessionActions): void {
    this.armed = false;
    this.autoDeparture = false;
    if (this.phase === 'moving') {
      if (this.target === k) return;
      this.target = k;
    } else if (k === this.stop) {
      this.target = k;
      if (this.phase === 'shut' || this.phase === 'closing') this.phase = 'opening';
      return;
    } else {
      this.send(k, false);
    }
    session.react(`${landingY(k) > this.y ? 'Up' : 'Down'} to ${floorName(k)}.`);
  }

  /** The resident's ride, stage by stage: the car fetched, them stepping in, the ride, them stepping out. */
  private runErrand(dt: number): void {
    const e = this.errand;
    if (!e) return;
    e.left -= dt;
    if (e.left <= 0) {
      this.errand = null;
      if (e.stage === 'fetch') e.board?.();
      e.arrive?.();
      return;
    }
    switch (e.stage) {
      case 'fetch':
        if (this.stop === e.from && this.phase === 'open' && (e.ready?.() ?? true)) {
          e.board?.();
          e.stage = 'board';
          e.wait = BOARD_S;
        }
        return;
      case 'board':
        if ((e.wait -= dt) > 0) return;
        e.stage = 'ride';
        if (this.target === this.stop && this.stop !== e.to) this.send(e.to, false);
        return;
      case 'ride':
        if (this.stop === e.to && this.phase === 'open') {
          this.errand = null;
          e.arrive?.();
        } else if (this.phase !== 'moving' && this.target === this.stop && this.stop !== e.to) {
          // Sent elsewhere meanwhile and idle again: on to where the rider was going.
          this.send(e.to, false);
        }
        return;
    }
  }

  /** Off to stop `k`: the gate folds shut (once the gateway is clear), then the car goes. */
  private send(k: number, auto: boolean): void {
    this.target = k;
    this.autoDeparture = auto;
    this.phase = 'closing';
  }

  /**
   * What the lift does by itself, so nobody waits on it: it comes to whoever stands on our landing
   * or in the entrance hall while it idles elsewhere (the flat's front door opening, the street's
   * sas crossed, and it is already on its way), folds its gate open for whoever walks up to it on
   * any landing, and at either end leaves for the other a beat after the player steps in (the panel
   * still sends it anywhere at once). Not on the floors between: the stairs run past them, and it
   * would chase the player down the building; there the landing's button calls it. Sent off by
   * itself and the rider steps back out: it stays. It never sends the rider it just brought
   * straight back: they have to step out first.
   */
  private autoPilot(dt: number): void {
    this.options.listener.getWorldPosition(this.eye);
    this.worldToLocal(this.eye);
    const feet = this.eye.y - EYE;
    const inCar = this.floorAt(this.eye.x, this.eye.z, feet) !== null;
    this.playerAboard = inCar;
    if (!inCar) {
      this.armed = true;
      this.insideFor = 0;
    }
    const at = inCar ? null : this.landingOf(this.eye.x, this.eye.z, feet);
    if (this.target !== this.stop) {
      // Leaving by itself, and the rider stepped back out onto the landing: it stays for them.
      if (this.autoDeparture && at === this.stop && (this.phase === 'open' || this.phase === 'closing')) {
        this.target = this.stop;
        this.autoDeparture = false;
        if (this.phase === 'closing') this.phase = 'opening';
      }
      return;
    }
    if (this.phase === 'opening' || this.phase === 'closing' || this.phase === 'moving') return;
    // Carrying a resident: the ride goes where they go (the player may ride along), nowhere else meanwhile.
    if (this.errand) return;
    if (at !== null && at !== this.stop && isEnd(at)) {
      this.send(at, false);
      return;
    }
    if (this.phase === 'shut' && at === this.stop) {
      const gate = liftGate();
      if (Math.hypot(this.eye.x - gate.x, this.eye.z - gate.z) < OPEN_NEAR) this.phase = 'opening';
      return;
    }
    if (this.phase === 'open' && inCar && this.armed && isEnd(this.stop) && !this.inGateway(this.stop)) {
      this.insideFor += dt;
      if (this.insideFor >= DEPART_AFTER) {
        this.armed = false;
        this.send(this.stop === 0 ? STOREYS : 0, true);
      }
    } else {
      this.insideFor = 0;
    }
  }

  /** Which floor landing the feet stand on (ours with its strip, the entrance hall with the hall), zone-local; null elsewhere. */
  private landingOf(x: number, z: number, feet: number): number | null {
    const { strip, shaft, floorLanding, hall } = plan;
    if (Math.abs(feet - landingY(0)) < 0.5 && x > strip.x0 - 0.1 && x < shaft.x1 && z > floorLanding.z0 - 0.05 && z < floorLanding.z1 + 0.05) return 0;
    if (Math.abs(feet - landingY(STOREYS)) < 0.5 && x > shaft.x0 && x < hall.x1 && z > floorLanding.z0 - 0.05 && z < hall.z1) return STOREYS;
    if (x < shaft.x0 || x > shaft.x1 || z < floorLanding.z0 - 0.05 || z > floorLanding.z1 + 0.05) return null;
    for (let k = 1; k < STOREYS; k++) if (Math.abs(feet - landingY(k)) < 0.5) return k;
    return null;
  }

  private render(): void {
    this.car.position.y = this.y;
    for (const { button, k } of this.panel) button.position.set(plan.car.x1 - 0.047, this.y + panelY(k), panelZ(0.03));
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
      osc.connect(filter).connect(gain).connect(audioBus(ctx, 'world'));
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
    osc.connect(gain).connect(audioBus(ctx, 'world'));
    osc.start(t);
    osc.stop(t + 0.18);
  }

  /** The iron cage the full height of the shaft: four posts, lattice on three sides, a gate on every landing and lattice between. */
  private buildCage(): void {
    const height = TOP;
    for (const x of [CAGE.x0, CAGE.x1]) {
      for (const z of [CAGE.z0, CAGE.z1]) {
        this.add(boxMesh(0.05, height, 0.05, IRON, { x, y: height / 2, z }));
      }
    }
    const lattice = coverageKeepsAlpha(new THREE.MeshStandardMaterial({ map: latticeTexture(), color: 0x2a2b2e, metalness: 0, roughness: 0.5, alphaTest: 0.5, alphaToCoverage: QUALITY.msaa > 0, side: THREE.DoubleSide }));
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
    const add = (g: THREE.BufferGeometry, material: THREE.Material | THREE.Material[], x: number, y: number, z: number): THREE.Mesh => {
      const mesh = new THREE.Mesh(g, material);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.car.add(mesh);
      return mesh;
    };
    // The floor stands PROUD of the floor it stops at: at the bottom, the hall's stone runs under the car.
    // The wooden boxes, bevelled on the better qualities (`boxMesh`): their edges catch the car's lamp.
    const board = (bw: number, bh: number, bd: number, x: number, y: number, z: number): void => {
      const mesh = boxMesh(bw, bh, bd, WOOD, { x, y, z });
      mesh.castShadow = true;
      this.car.add(mesh);
    };
    board(w, 0.08, d, cx, -0.04 + PROUD, cz);
    board(0.03, car.height, d, car.x0 + 0.015, car.height / 2, cz);
    board(0.03, car.height, d, car.x1 - 0.015, car.height / 2, cz);
    board(w, car.height, 0.03, cx, car.height / 2, car.z0 + 0.015);
    board(w, 0.06, d, cx, car.height + 0.03, cz);
    add(new THREE.PlaneGeometry(w * 0.6, 1.1), standard({ color: 0xc8d2d8, metalness: 1, roughness: 0.06 }), cx, 1.35, car.z0 + 0.03 + PROUD); // the mirror, on the back panel's face
    const lamp = add(new THREE.CylinderGeometry(0.12, 0.12, 0.04, 16), this.lamp, cx, car.height - 0.02, cz);
    lamp.castShadow = false;
    const plate = new THREE.MeshStandardMaterial({ map: panelTexture(), metalness: 1, roughness: 0.4 });
    add(new THREE.BoxGeometry(0.02, PANEL_H, PANEL_D), [BRASS, plate, BRASS, BRASS, BRASS, BRASS], car.x1 - 0.035, PANEL_Y, cz);
  }
}

/** A brass button (the call button on a landing, the panel in the car): a caption and a click. */
export class LiftButton extends Prop implements Interactable {
  readonly contactShadow = false;
  readonly hitboxes: THREE.Object3D[];
  private readonly brass = BRASS.clone();

  constructor(private readonly caption: () => string, private readonly press: (session: SessionActions) => void, size: ButtonSize = CALL_BUTTON) {
    super();
    this.name = 'LiftButton';
    const plate = boxMesh(size.plate[0], size.plate[1], 0.02, this.brass);
    plate.castShadow = true;
    this.add(plate);
    const hitbox = invisibleHitbox(...size.hit);
    this.hitboxes = [hitbox];
    this.add(hitbox);
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
}

/** A button's plate (width, height) and the box it is clicked in (width, height, depth), local. */
interface ButtonSize {
  plate: [number, number];
  hit: [number, number, number];
}

/** The call button on a landing's cage post; one of the car panel's, small enough for a row a floor. */
const CALL_BUTTON: ButtonSize = { plate: [0.1, 0.16], hit: [0.22, 0.3, 0.2] };
const PANEL_BUTTON: ButtonSize = { plate: [0.04, 0.04], hit: [0.07, PANEL_PITCH, 0.08] };
/** The panel's brass plate on the car's east wall (height, depth along the wall). */
const PANEL_H = PANEL_PITCH * (STOREYS + 1) + 0.05;
const PANEL_D = 0.16;

/** "the 3rd floor", "the ground floor". */
function floorName(k: number): string {
  return k === STOREYS ? 'the ground floor' : `the ${plan.floorNames[k]!} floor`;
}

/** Floor `k`'s button on the panel, over the car's floor: ours at the top, the hall's at the bottom. */
function panelY(k: number): number {
  return PANEL_Y + (STOREYS / 2 - k) * PANEL_PITCH;
}

/** A point `along` the panel from its middle, towards the car's gate (+z), local z. */
function panelZ(along: number): number {
  return (plan.car.z0 + plan.car.z1) / 2 + along;
}

/** The panel's face: each floor's name engraved left of its button (the face looks -x: its left is -z). */
function panelTexture(): THREE.CanvasTexture {
  const px = 400;
  const [canvas, ctx] = createCanvas(Math.round((PANEL_D / PANEL_H) * px), px);
  ctx.fillStyle = '#c9a75b';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#3a2a14';
  ctx.font = 'bold 22px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const k of STOPS) {
    const top = PANEL_Y + PANEL_H / 2 - panelY(k);
    ctx.fillText(plan.floorNames[k]!, canvas.width * 0.28, (top / PANEL_H) * px, canvas.width * 0.5);
  }
  return toTexture(canvas, 4);
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
