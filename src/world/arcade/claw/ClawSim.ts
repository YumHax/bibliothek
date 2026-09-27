import * as THREE from 'three';
import { seededRandom } from '@/graphics/canvas';
import type { ArcadeControls } from '../games/ArcadeGame';
import type { MachineState } from '../MachineRun';

/*
 * The crane game's rules and motion, machine-local in metres (origin on the floor under the
 * case's centre, +z towards the player). Pure: vectors and numbers, no scene objects; the
 * `ClawMachine` builds the model to these sizes and moves it to match every frame.
 */

/** The machine's size: the base, the glass case on it, the lit top. */
export const WIDTH = 0.8;
export const DEPTH = 0.75;
export const BASE_H = 0.8;
export const CASE_H = 0.9;
export const TOP_H = 0.22;
export const TOTAL_H = BASE_H + CASE_H + TOP_H;
/** Where the gantry rails run, where the carriage hangs under them, and how far it may travel. */
export const RAIL_Y = BASE_H + CASE_H - 0.06;
export const CARRIAGE_Y = RAIL_Y - 0.05;
const TRAVEL_X = WIDTH / 2 - 0.14;
const TRAVEL_Z = DEPTH / 2 - 0.14;
/** The chute: the corner the claw returns to and lets go over. */
const CHUTE = new THREE.Vector3(-TRAVEL_X, 0, TRAVEL_Z);
const CLAW_UP = 0.1;
const CLAW_DOWN = CASE_H - 0.3;
/** Seconds to steer before the claw drops by itself, and how fast it moves. */
const AIM_SECONDS = 15;
const CARRIAGE_SPEED = 0.22;
/** Chance to close on a plush this far from the claw's centre (m), and how often a grabbed one slips out on the way. */
const GRIP = [
  { within: 0.035, chance: 0.6 },
  { within: 0.07, chance: 0.25 },
];
const SLIP_CHANCE = 0.3;
/** After this many misses in a row the claw grips properly once (fairground law, more or less). */
const PITY_AFTER = 6;
/** Where the top of a plush sits below the hub when it hangs in the claw. */
const HANG = 0.1;
const PLUSH_COUNT = 11;
const PASTELS = [0xffb3c6, 0xa8d8ff, 0xfff1a8, 0xc8f7c5, 0xe0c3ff, 0xffd6a8, 0xffffff];

export type ClawPhase = 'aim' | 'drop' | 'lift' | 'return' | 'release' | 'rest';
export type ClawSound = 'whir' | 'drop' | 'clunk' | 'lose' | 'thud' | 'win';

/** One plush in the case. */
export interface ClawPlush {
  color: number;
  /** Where it is now (its origin), machine-local. */
  readonly pos: THREE.Vector3;
  /** Where it lies in the heap. */
  readonly home: THREE.Vector3;
  readonly r: number;
  /** Which way its face looks. */
  readonly yaw: number;
}

/** A try the player paid for, over: the prize won, if any. */
export interface ClawOutcome {
  prize: string | undefined;
}

/**
 * The claw's play: steer the carriage for fifteen seconds (or until fire), drop, close, lift, go
 * back over the chute and open. Whether it held anything is up to where it came down (`GRIP`),
 * a third of grabs slip out on the way home, six misses in a row and it grips properly once. A
 * plush down the chute is the player's prize and a fresh one takes its place on the heap. A
 * regular's hand wanders, drops and never wins. Seeded, so the heap is the same every visit.
 */
export class ClawSim {
  readonly plush: ClawPlush[] = [];
  /** The carriage on the gantry. */
  readonly carriage = new THREE.Vector3(CHUTE.x, CARRIAGE_Y, CHUTE.z);
  /** How far the claw hangs under the carriage, and how closed it is (0 open .. 1 shut). */
  drop = CLAW_UP;
  grip = 0;
  /** The joystick's lean: `z` to the sides, `x` forwards and back (radians). */
  readonly stick = { x: 0, z: 0 };
  private currentPhase: ClawPhase = 'rest';
  private phaseLeft = 0;
  private aimLeft = 0;
  private clock = 0;
  private carried: ClawPlush | null = null;
  /** A plush on its way down: back to the heap (slipped) or down the chute (won). */
  private falling: { plush: ClawPlush; to: number; won: boolean } | null = null;
  private misses = 0;
  private won: string | undefined;
  private whirClock = 0;
  private readonly random: () => number;
  private readonly prizeFor: (color: number) => string | undefined;
  private readonly from = new THREE.Vector3();
  private readonly scratch = new THREE.Vector3();
  private sounds: ClawSound[] = [];
  private shown: string | null = null;
  private outcome: ClawOutcome | null = null;

  constructor(seed: number, prizeFor: (color: number) => string | undefined) {
    this.random = seededRandom(seed * 4099);
    this.prizeFor = prizeFor;
    // The heap: soft blobs in pastels on the floor of the case, clear of the chute.
    for (let i = 0; i < PLUSH_COUNT; i++) {
      const r = 0.06 + this.random() * 0.04;
      const home = this.heapSpot(r, i > 7);
      const color = PASTELS[Math.floor(this.random() * PASTELS.length)]!;
      const yaw = this.random() * Math.PI * 2;
      this.plush.push({ color, pos: home.clone(), home, r, yaw });
    }
  }

  get phase(): ClawPhase {
    return this.currentPhase;
  }

  /** A coin in: fifteen seconds to steer. */
  start(): void {
    this.won = undefined;
    this.enter('aim', 0);
    this.aimLeft = AIM_SECONDS;
  }

  /** The player walked off: whatever it holds falls, and it goes home on its own. */
  abandon(): void {
    if (this.carried) this.slip();
    this.home();
  }

  /** A regular stepped up: a moment's thought before their first try. */
  occupied(): void {
    this.enter('rest', 1 + this.random() * 2);
  }

  /** Back over the chute from wherever it is. */
  home(): void {
    this.from.copy(this.carriage);
    this.enter('return', 1.8);
  }

  /** The sounds of this frame, oldest first. */
  takeSounds(): ClawSound[] {
    const sounds = this.sounds;
    this.sounds = [];
    return sounds;
  }

  /** What the panel's display should now say, once, or null when unchanged. */
  takeDisplay(): string | null {
    const text = this.shown;
    this.shown = null;
    return text;
  }

  /** The player's try, once it is over (the claw open over the chute), or null. */
  takeOutcome(): ClawOutcome | null {
    const outcome = this.outcome;
    this.outcome = null;
    return outcome;
  }

  /** One frame. `keys` are the player's, read only while they steer (`mode` 'playing', phase 'aim'). */
  update(dt: number, mode: MachineState, keys: ArcadeControls | null): void {
    this.clock += dt;
    this.phaseLeft -= dt;
    const c = this.carriage;
    switch (this.currentPhase) {
      case 'aim':
        this.aim(dt, mode, keys);
        break;
      case 'rest':
        this.grip += (0 - this.grip) * Math.min(1, dt * 3);
        if (mode === 'demo' && this.phaseLeft <= 0) this.enter('aim', 4 + this.random() * 4);
        break;
      case 'drop':
        this.drop += ((CLAW_DOWN - this.drop) * dt) / Math.max(0.05, this.phaseLeft);
        if (this.phaseLeft <= 0.3) this.grip += (1 - this.grip) * Math.min(1, dt * 6);
        if (this.phaseLeft <= 0) {
          this.tryGrab(mode);
          this.enter('lift', 1.4);
        }
        break;
      case 'lift':
        this.drop += ((CLAW_UP - this.drop) * dt) / Math.max(0.05, this.phaseLeft);
        if (this.phaseLeft <= 0) {
          this.from.copy(c);
          this.enter('return', 1.8);
          this.sounds.push('whir');
        }
        break;
      case 'return': {
        const t = 1 - Math.max(0, this.phaseLeft / 1.8);
        c.x = THREE.MathUtils.lerp(this.from.x, CHUTE.x, t);
        c.z = THREE.MathUtils.lerp(this.from.z, CHUTE.z, t);
        this.drop += (CLAW_UP - this.drop) * Math.min(1, dt * 4);
        // The rigged bit: halfway home, a grabbed plush may slip out.
        if (this.carried && t > 0.45 && t < 0.5 && this.random() < SLIP_CHANCE * dt * 20) this.slip();
        if (this.phaseLeft <= 0) this.enter('release', 1.2);
        break;
      }
      case 'release':
        this.grip += (0 - this.grip) * Math.min(1, dt * 4);
        if (this.carried && this.grip < 0.5) {
          const plush = this.carried;
          this.carried = null;
          this.falling = { plush, to: BASE_H - 0.25, won: true };
          this.sounds.push('clunk');
        }
        // Wait for a plush on its way down the chute before telling anyone.
        if (this.phaseLeft <= 0 && !this.falling?.won) this.endTry(mode);
        break;
    }
    this.carry(dt, mode);
  }

  /** Steering: the player's keys (or a regular's drifting hand) move the carriage; fire, a regular's whim or the clock drops it. */
  private aim(dt: number, mode: MachineState, keys: ArcadeControls | null): void {
    const c = this.carriage;
    let dx = 0;
    let dz = 0;
    let drop = false;
    const playing = mode === 'playing';
    if (playing && keys) {
      dx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
      dz = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
      drop = keys.firePressed;
      this.aimLeft -= dt;
      this.shown = `${Math.max(0, Math.ceil(this.aimLeft))}`;
      if (this.aimLeft <= 0) drop = true;
    } else {
      // A regular's hand wandering over the heap.
      const tx = Math.sin(this.clock * 0.6) * TRAVEL_X;
      const tz = Math.cos(this.clock * 0.41) * TRAVEL_Z;
      dx = Math.abs(tx - c.x) > 0.01 ? Math.sign(tx - c.x) : 0;
      dz = Math.abs(tz - c.z) > 0.01 ? Math.sign(tz - c.z) : 0;
      drop = this.phaseLeft <= 0;
    }
    if (dx || dz) {
      c.x = THREE.MathUtils.clamp(c.x + dx * CARRIAGE_SPEED * dt, -TRAVEL_X, TRAVEL_X);
      c.z = THREE.MathUtils.clamp(c.z + dz * CARRIAGE_SPEED * dt, -TRAVEL_Z, TRAVEL_Z);
      this.whirClock -= dt;
      if (this.whirClock <= 0) {
        this.whirClock = 0.3;
        this.sounds.push('whir');
      }
    }
    this.stick.z += ((-dx * 0.35) - this.stick.z) * Math.min(1, dt * 18);
    this.stick.x += ((dz * 0.35) - this.stick.x) * Math.min(1, dt * 18);
    if (drop) {
      this.sounds.push('drop');
      this.enter('drop', 1.4);
      if (playing) this.shown = 'GOOD LUCK';
    }
  }

  /** At the bottom of the drop: the nearest plush under the claw, and whether the claw holds it. */
  private tryGrab(mode: MachineState): void {
    const c = this.carriage;
    let best: ClawPlush | null = null;
    let bestD = Infinity;
    for (const p of this.plush) {
      if (this.falling?.plush === p) continue;
      const d = Math.hypot(p.pos.x - c.x, p.pos.z - c.z);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    const chance = GRIP.find((g) => bestD <= g.within)?.chance ?? 0;
    const playing = mode === 'playing';
    const pity = playing && this.misses >= PITY_AFTER && bestD <= GRIP[GRIP.length - 1]!.within;
    // A regular never wins: the heap has to last.
    const holds = best && playing && (pity || this.random() < chance);
    this.sounds.push('clunk');
    if (holds && best) {
      this.carried = best;
      if (pity) this.misses = 0;
    }
  }

  private slip(): void {
    const plush = this.carried;
    if (!plush) return;
    this.carried = null;
    // It lands back on the heap where it fell.
    plush.home.set(plush.pos.x, BASE_H + plush.r, plush.pos.z);
    this.falling = { plush, to: plush.home.y, won: false };
    this.sounds.push('lose');
  }

  /** The claw is open over the chute: tell whoever paid how it went. */
  private endTry(mode: MachineState): void {
    if (mode === 'demo') {
      this.enter('rest', 2 + this.random() * 3);
      return;
    }
    this.enter('rest', 0);
    if (mode !== 'playing') return;
    const prize = this.won;
    this.misses = prize ? 0 : this.misses + 1;
    this.shown = prize ? 'WINNER!' : 'TRY AGAIN';
    if (prize) this.sounds.push('win');
    this.outcome = { prize };
  }

  /** A carried plush hangs from the claw; a falling one drops (to the heap, or down the chute and out of the case). */
  private carry(dt: number, mode: MachineState): void {
    if (this.carried) {
      this.scratch.set(0, -this.drop - HANG - this.carried.r, 0).add(this.carriage);
      this.carried.pos.lerp(this.scratch, Math.min(1, dt * 12));
    }
    const falling = this.falling;
    if (!falling) return;
    const g = falling.plush.pos;
    g.y -= dt * 1.4;
    if (g.y > falling.to) return;
    g.y = falling.to;
    this.falling = null;
    this.sounds.push('thud');
    if (!falling.won) return;
    // Down the chute: the prize is the player's; a fresh plush takes its place on the heap.
    if (mode === 'playing') this.won = this.prizeFor(falling.plush.color);
    this.restock(falling.plush);
  }

  /** The attendant tops the heap up: the plush comes back in a new colour at a new spot. */
  private restock(p: ClawPlush): void {
    p.color = PASTELS[Math.floor(this.random() * PASTELS.length)]!;
    p.home.copy(this.heapSpot(p.r, true));
    p.pos.copy(p.home);
  }

  /** A spot on the heap (away from the chute's corner), on the floor or (`high`) on top of the others. */
  private heapSpot(r: number, high: boolean): THREE.Vector3 {
    for (;;) {
      const x = (this.random() - 0.5) * (WIDTH - 0.3);
      const z = (this.random() - 0.5) * (DEPTH - 0.3);
      if (Math.hypot(x - CHUTE.x, z - CHUTE.z) < 0.14) continue;
      return new THREE.Vector3(x, BASE_H + r + (high ? r * 1.4 : 0), z);
    }
  }

  private enter(phase: ClawPhase, seconds: number): void {
    this.currentPhase = phase;
    this.phaseLeft = seconds;
  }
}
