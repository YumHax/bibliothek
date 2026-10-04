import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Collisions } from '@/core/Collider';
import type { SessionActions } from '@/game/SessionActions';
import { audioBus, startedAudioContext } from '@/audio/audioContext';
import { Prop } from '../props/Prop';
import type { OccupancyAware } from '../Furniture';
import { STAIRWELL_PLAN as plan } from './stairwellPlan';
import { STOREYS, landingY } from '@/world/measures/building';
import { liftGate } from './stairRoutes';
import { mainsOn } from '@/building/mains';
import { coproChoice } from '@/building/coproState';
import { AtticRide, type LiftCarState, type LiftPhase } from './liftAttic';
import { CAGE, GATE_HEIGHT, STOPS, buildCage, buildCar, panelY, panelZ } from './liftBody';
import { LiftButton, PANEL_BUTTON } from './LiftButton';
import { loudness } from '@/audio/hearing';

interface LiftOptions {
  /** The zone's collision set: the gates' boxes come and go as they open and shut (world space). */
  collisions: Collisions;
  /** The ears (the camera): the motor and the gates are heard from where it is. */
  listener: THREE.Object3D;
}

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

/** The two ends of its run, the only floors it comes to and sets off from by itself. */
const isEnd = (k: number): boolean => k === 0 || k === STOREYS;
const GATE_SECONDS = 0.45;
/** The car's speed once the co-ownership voted its overhaul, times `liftSpeed`. */
const OVERHAULED_SPEED = 1.5;
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
  private readonly gates: Map<number, THREE.Mesh>;
  private readonly lamp: THREE.MeshBasicMaterial;
  /** The car: its height (local), the stop it is at or left, the one it goes to, its gate (0 shut .. 1 open), what it is doing. */
  private readonly state: LiftCarState = { y: landingY(0), stop: 0, target: 0, gate: 0, phase: 'shut' };
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
  private clock = 0;
  /** The code's ride past our landing to the attic, and the car kept for the player while they are up there. */
  private readonly attic = new AtticRide({
    car: this.state,
    send: (k) => this.send(k, false),
    settle: () => {
      this.render();
      this.syncColliders();
    },
  });

  private get phase(): LiftPhase {
    return this.state.phase;
  }
  private set phase(phase: LiftPhase) {
    this.state.phase = phase;
  }
  private get stop(): number {
    return this.state.stop;
  }
  private set stop(k: number) {
    this.state.stop = k;
  }
  private get target(): number {
    return this.state.target;
  }
  private set target(k: number) {
    this.state.target = k;
  }
  private get y(): number {
    return this.state.y;
  }
  private set y(y: number) {
    this.state.y = y;
  }
  private get gate(): number {
    return this.state.gate;
  }
  private set gate(open: number) {
    this.state.gate = open;
  }

  constructor(private readonly options: LiftOptions) {
    super();
    this.name = 'Lift';
    this.gates = buildCage(this);
    this.lamp = new THREE.MeshBasicMaterial({ color: 0xffe2b0 });
    buildCar(this.car, this.lamp);
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

  override get footprint(): THREE.Box3 {
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
    // Gone up to the attic: the car is back on our landing, shut, for whoever comes down (the attic's car brings them).
    if (!occupied) this.attic.left();
    if (occupied && this.attic.cameBack()) this.phase = 'opening';
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
    if (!mainsOn()) return false;
    if (this.errand || this.attic.active || from === to || this.running || this.target !== this.stop || this.playerAboard) return false;
    this.errand = { ...ride, from, to, stage: 'fetch', wait: 0, left: RIDE_GIVE_UP_S };
    if (this.stop !== from) this.send(from, false);
    else if (this.phase === 'shut' || this.phase === 'closing') this.phase = 'opening';
    return true;
  }

  /** The car's floor height now (local): between two landings while it is stuck. */
  get carFloor(): number {
    return this.y;
  }

  /** Whether the car stands between two landings (a power cut caught it on its way). */
  get isBetweenFloors(): boolean {
    return this.phase === 'moving';
  }

  /** Kept for the player: up in the attic (they come back down in this car, on our landing) or on the code's ride. */
  get isHeldForPlayer(): boolean {
    return this.attic.held;
  }

  /**
   * A power cut catches the car on its way from landing `k` down to `k + 1`, half way, gate shut, nobody's ride under
   * way: it stays there until the power comes back, then goes on down (`building/blackout`).
   */
  strand(k: number): void {
    this.errand = null;
    this.stop = k;
    this.target = Math.min(STOREYS, k + 1);
    this.y = (landingY(k) + landingY(this.target)) / 2;
    this.gate = 0;
    this.phase = 'moving';
    this.autoDeparture = false;
    this.render();
  }

  update(dt: number): void {
    this.clock += dt;
    if (!this.laidOut) this.layOut();
    // A power cut (`building/mains`): the car stays where it is, between two floors if it was moving, its gate as it was.
    // Except on the climb to the attic: that old motor was never on the building's circuit, and it never stops halfway.
    if (!mainsOn()) {
      if (this.phase === 'climbing') this.attic.climb(dt);
      // A gate already folding open goes on by hand (the player back down from the attic in the dark, never shut in).
      if (this.phase === 'opening') {
        this.gate = Math.min(1, this.gate + dt / GATE_SECONDS);
        if (this.gate >= 1) this.phase = 'open';
      }
      this.render();
      this.syncColliders();
      this.sound();
      return;
    }
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
          this.phase = this.target === this.stop ? this.attic.restAt('shut') : 'moving';
        }
        break;
      case 'moving': {
        const goal = landingY(this.target);
        const from = landingY(this.stop);
        const left = Math.abs(goal - this.y);
        const done = Math.abs(from - this.y);
        // Easing off near either end (the last 1.6 m), a lift's gentle start and stop.
        // Overhauled by the co-ownership (`building/coproState`): new cables and motor, a faster car.
        const speed = plan.liftSpeed * (coproChoice('lift') === 'overhaul' ? OVERHAULED_SPEED : 1) * Math.min(1, 0.2 + Math.min(left, done) / 2);
        const step = Math.min(left, speed * dt);
        this.y += Math.sign(goal - this.y) * step;
        if (left - step < 0.002) {
          this.y = goal;
          this.stop = this.target;
          this.phase = this.attic.restAt('opening');
          this.clank();
        }
        break;
      }
      case 'climbing':
        this.attic.climb(dt);
        break;
      default:
        break;
    }
    this.render();
    this.syncColliders();
    this.sound();
  }

  /** Moving between floors or climbing to the attic. */
  private get running(): boolean {
    return this.phase === 'moving' || this.phase === 'climbing';
  }

  private callLabel(k: number): string {
    if (this.target === k && (this.running || this.target !== this.stop)) return 'The lift is on its way';
    if (this.running || this.target !== this.stop) return 'The lift is busy';
    if (this.stop === k) return 'The lift is here';
    return 'The lift · call';
  }

  private rideLabel(k: number): string {
    const floor = floorName(k);
    if (this.attic.active) return 'Going up…';
    if (this.target === k && (this.running || this.target !== this.stop)) return `Going to ${floor}…`;
    if (this.stop === k && !this.running) return `This is ${floor}`;
    return `${floor[0]!.toUpperCase()}${floor.slice(1)} · go`;
  }

  private call(k: number, session: SessionActions): void {
    if (!mainsOn()) return session.refuse('Nothing: no power in the building.');
    if (this.running || this.attic.active) {
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
    if (!mainsOn()) return session.refuse('The button stays dark: no power.');
    if (this.attic.active) return;
    this.armed = false;
    this.autoDeparture = false;
    // The old code, pressed floor by floor from inside the car: it goes up past our landing, to the attic.
    if (this.playerAboard && this.attic.pressed(k, this.clock, session)) return;
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
    const { inCar, at } = this.locatePlayer();
    if (this.attic.active) return;
    if (this.target !== this.stop) {
      this.stayForRider(at);
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
      this.openForArrival();
      return;
    }
    this.departWithRider(dt, inCar);
  }

  /** Where the player stands, car-local: aboard (stepping out re-arms the departure), or on which landing. */
  private locatePlayer(): { inCar: boolean; at: number | null } {
    this.options.listener.getWorldPosition(this.eye);
    this.worldToLocal(this.eye);
    const feet = this.eye.y - EYE;
    const inCar = this.floorAt(this.eye.x, this.eye.z, feet) !== null;
    this.playerAboard = inCar;
    if (!inCar) {
      this.armed = true;
      this.insideFor = 0;
    }
    return { inCar, at: inCar ? null : this.landingOf(this.eye.x, this.eye.z, feet) };
  }

  /** Leaving by itself, and the rider stepped back out onto the landing: it stays for them. */
  private stayForRider(at: number | null): void {
    if (this.autoDeparture && at === this.stop && (this.phase === 'open' || this.phase === 'closing')) {
      this.target = this.stop;
      this.autoDeparture = false;
      if (this.phase === 'closing') this.phase = 'opening';
    }
  }

  /** Shut at the landing the player stands on: the gate folds open for whoever walks up to it. */
  private openForArrival(): void {
    const gate = liftGate();
    if (Math.hypot(this.eye.x - gate.x, this.eye.z - gate.z) < OPEN_NEAR) this.phase = 'opening';
  }

  /** Open at either end with the player aboard and clear of the gateway: off to the other end a beat later. */
  private departWithRider(dt: number, inCar: boolean): void {
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
    // Climbing to the attic, the car's lamp stutters.
    const stutter = Math.sin(this.clock * 37) > 0.55 || Math.sin(this.clock * 11.3) > 0.8 ? 0.25 : 0.85;
    this.lamp.color.setScalar(!mainsOn() ? 0.04 : this.phase === 'moving' ? 0.95 : this.phase === 'climbing' ? stutter : 1);
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
    if (this.running || this.phase === 'closing') {
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
    const level = this.occupied && this.running && mainsOn() ? 0.05 * loudness(d, { shape: 'inverseSquare', referenceDistance: Math.sqrt(20), maxDistance: Infinity }) : 0;
    this.hum.gain.gain.setTargetAtTime(level, ctx.currentTime, 0.3);
    // The climb past the top: the motor labours, lower.
    this.hum.osc.frequency.setTargetAtTime(this.phase === 'climbing' ? 38 : this.phase === 'moving' ? 55 : 45, ctx.currentTime, 0.4);
  }

  /** A gate folding shut or open: an iron clack (none once overhauled: new runners, oiled). */
  private clank(): void {
    const ctx = startedAudioContext();
    if (!ctx || !this.occupied || coproChoice('lift') === 'overhaul') return;
    this.options.listener.getWorldPosition(this.ear);
    this.car.getWorldPosition(this.here);
    const d = this.ear.distanceTo(this.here);
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(420, t);
    osc.frequency.exponentialRampToValueAtTime(90, t + 0.12);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.08 * loudness(d, { shape: 'inverseSquare', referenceDistance: Math.sqrt(12), maxDistance: Infinity }), t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(gain).connect(audioBus(ctx, 'world'));
    osc.start(t);
    osc.stop(t + 0.18);
  }
}

/** "the 3rd floor", "the ground floor". */
function floorName(k: number): string {
  return k === STOREYS ? 'the ground floor' : `the ${plan.floorNames[k]!} floor`;
}
