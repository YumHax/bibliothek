import * as THREE from 'three';
import type { SfxEvent } from '@/audio/ChipSpeaker';
import type { ArcadeControls } from '../games/ArcadeGame';
import { SoundQueue } from '../SoundQueue';
import type { MachineState } from '../MachineRun';
import { lcg } from '@/random';
import { damp, dampFactor } from '@/math/damp';

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
/** Where on the way home a slip happens (fraction of the trip), and how long before it the prongs start to give. */
const SLIP_AT: [number, number] = [0.35, 0.65];
const LOOSEN = 0.22;
/** After this many misses in a row the claw grips properly once (fairground law, more or less): that grab never slips. */
const PITY_AFTER = 6;
/** A regular's grab holds this much less often than the player's would: they win now and then, the heap still lasts. */
const REGULAR_GRIP = 0.35;
/** The claw comes down onto the heap: its hub stops this far over the top of the plush under it. */
const OVER_PLUSH = 0.06;
/** How far round the claw's centre a plush counts as under it (m). */
const UNDER = 0.08;
/** Where the top of a plush sits below the hub when it hangs in the claw. */
const HANG = 0.1;
const PLUSH_COUNT = 11;
const PASTELS = [0xffb3c6, 0xa8d8ff, 0xfff1a8, 0xc8f7c5, 0xe0c3ff, 0xffd6a8, 0xffffff];

type ClawPhase = 'aim' | 'drop' | 'lift' | 'return' | 'release' | 'rest';

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
interface ClawOutcome {
  prize: string | undefined;
}

/**
 * The claw's play: steer the carriage for fifteen seconds (or until fire), drop onto the heap
 * (the claw stops on the plush under it), close, lift, go back over the chute and open. Whether it
 * held anything is up to where it came down (`GRIP`); a third of grabs slip out on the way home
 * (decided once as it lifts; the prongs visibly give first); six misses in a row and it grips
 * properly once (that one never slips). A plush down the chute is the player's prize and a fresh
 * one takes its place on the heap; every plush rests on what is under it, and those left with
 * nothing under them settle. A regular's hand wanders and drops, and now and then wins one too.
 * Seeded, so the heap is the same every visit.
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
  /** The grab is the pity grip's (it never slips), and where on the way home this one slips (null: it holds). */
  private honest = false;
  private slipAt: number | null = null;
  /** How far the claw comes down this drop (onto the plush under it, or the floor). */
  private dropTo = CLAW_DOWN;
  /** Plush on their way down: back to the heap (slipped, or settling), or down the chute (won). */
  private falling: { plush: ClawPlush; to: number; won: boolean }[] = [];
  /** A regular's plush went down the chute this try (they cheer). */
  private regularWon = false;
  /** Misses in a row, kept across visits when `luck` is given (else for this hall's life). */
  private readonly luck: { clawMisses: number };
  private won: string | undefined;
  private whirClock = 0;
  private readonly random: () => number;
  private readonly prizeFor: (color: number) => string | undefined;
  private readonly owns: (prize: string) => boolean;
  private readonly from = new THREE.Vector3();
  private readonly scratch = new THREE.Vector3();
  private readonly sounds = new SoundQueue();
  private shown: string | null = null;
  private outcome: ClawOutcome | null = null;

  /** `luck` keeps the misses in a row (the pity grip's count) across visits: `economy/ArcadeHabits`. */
  /** `owns`: whether a prize is on the bed at home already (the attendant restocks with the others first). */
  constructor(seed: number, prizeFor: (color: number) => string | undefined, luck: { clawMisses: number } = { clawMisses: 0 }, owns: (prize: string) => boolean = () => false) {
    this.random = lcg(seed * 4099);
    this.prizeFor = prizeFor;
    this.owns = owns;
    this.luck = luck;
    // The heap: soft blobs in pastels on the floor of the case, clear of the chute, the last few on top of the others.
    for (let i = 0; i < PLUSH_COUNT; i++) {
      const r = 0.06 + this.random() * 0.04;
      const home = this.heapSpot(r, i > 7);
      const color = PASTELS[Math.floor(this.random() * PASTELS.length)]!;
      const yaw = this.random() * Math.PI * 2;
      this.plush.push({ color, pos: home.clone(), home, r, yaw });
    }
  }

  /** The top of the heap at (x, z), machine-local: the highest plush there (its crown), else the case's floor. */
  surfaceAt(x: number, z: number): number {
    let top = BASE_H;
    for (const p of this.plush) {
      if (p === this.carried || this.isFalling(p)) continue;
      const d = Math.hypot(p.pos.x - x, p.pos.z - z);
      if (d < p.r) top = Math.max(top, p.pos.y + Math.sqrt(p.r * p.r - d * d));
    }
    return top;
  }

  /** Whether the claw is being steered by the player (a mark on the heap shows where it would come down). */
  get aiming(): boolean {
    return this.currentPhase === 'aim';
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
  takeSounds(): SfxEvent[] {
    return this.sounds.take();
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
        this.grip = damp(this.grip, 0, 3, dt);
        if (mode === 'demo' && this.phaseLeft <= 0) this.enter('aim', 4 + this.random() * 4);
        break;
      case 'drop':
        this.drop += ((this.dropTo - this.drop) * dt) / Math.max(0.05, this.phaseLeft);
        if (this.phaseLeft <= 0.3) this.grip = damp(this.grip, 1, 6, dt);
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
          // The rigged bit, decided once: whether (and where on the way home) this grab slips out. Never the pity grip's.
          this.slipAt = this.carried && !this.honest && this.random() < SLIP_CHANCE ? THREE.MathUtils.lerp(SLIP_AT[0], SLIP_AT[1], this.random()) : null;
        }
        break;
      case 'return': {
        const t = 1 - Math.max(0, this.phaseLeft / 1.8);
        c.x = THREE.MathUtils.lerp(this.from.x, CHUTE.x, t);
        c.z = THREE.MathUtils.lerp(this.from.z, CHUTE.z, t);
        this.drop = damp(this.drop, CLAW_UP, 4, dt);
        // A grab that will slip: the prongs give a little at a time first, then it drops.
        if (this.carried && this.slipAt !== null) {
          this.grip = Math.min(this.grip, 1 - 0.45 * THREE.MathUtils.clamp((t - (this.slipAt - LOOSEN)) / LOOSEN, 0, 1));
          if (t >= this.slipAt) this.slip();
        }
        if (this.phaseLeft <= 0) this.enter('release', 1.2);
        break;
      }
      case 'release':
        this.grip = damp(this.grip, 0, 4, dt);
        if (this.carried && this.grip < 0.5) {
          const plush = this.carried;
          this.carried = null;
          this.falling.push({ plush, to: BASE_H - 0.25, won: true });
          this.sounds.push('clunk');
        }
        // Wait for a plush on its way down the chute before telling anyone.
        if (this.phaseLeft <= 0 && !this.falling.some((f) => f.won)) this.endTry(mode);
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
    this.stick.z = damp(this.stick.z, -dx * 0.35, 21, dt);
    this.stick.x = damp(this.stick.x, dz * 0.35, 21, dt);
    if (drop) {
      this.sounds.push('drop');
      this.enter('drop', 1.4);
      // It comes down onto the heap: the hub stops just over the plush under it (the floor where there is none).
      const top = this.surfaceAt(c.x, c.z);
      this.dropTo = THREE.MathUtils.clamp(CARRIAGE_Y - top - OVER_PLUSH, CLAW_UP, CLAW_DOWN);
      if (playing) this.shown = 'GOOD LUCK';
    }
  }

  /** At the bottom of the drop: the plush on top under the claw (else the nearest), and whether the claw holds it. */
  private tryGrab(mode: MachineState): void {
    const c = this.carriage;
    let best: ClawPlush | null = null;
    let bestD = Infinity;
    let bestTop = -Infinity;
    for (const p of this.plush) {
      if (this.isFalling(p)) continue;
      const d = Math.hypot(p.pos.x - c.x, p.pos.z - c.z);
      const top = p.pos.y + p.r;
      // Under the claw, the one on top is the one it closes on; with nothing under it, the nearest is the near miss.
      const better = d <= UNDER ? bestD > UNDER || top > bestTop : bestD > UNDER && d < bestD;
      if (better) {
        bestD = d;
        best = p;
        bestTop = top;
      }
    }
    const chance = GRIP.find((g) => bestD <= g.within)?.chance ?? 0;
    const playing = mode === 'playing';
    const pity = playing && this.luck.clawMisses >= PITY_AFTER && bestD <= GRIP[GRIP.length - 1]!.within;
    // A regular wins now and then (less often than the player would): the heap still lasts, the machine looks honest.
    const holds = best && (pity || this.random() < chance * (playing ? 1 : REGULAR_GRIP));
    this.sounds.push('clunk');
    this.honest = false;
    if (holds && best) {
      this.carried = best;
      this.honest = pity;
      if (pity) this.luck.clawMisses = 0;
      this.settle();
    }
  }

  private slip(): void {
    const plush = this.carried;
    if (!plush) return;
    this.carried = null;
    this.slipAt = null;
    // It lands back on the heap where it fell, on whatever is under it there.
    plush.home.set(plush.pos.x, this.restingY(plush, plush.pos.x, plush.pos.z), plush.pos.z);
    this.falling.push({ plush, to: plush.home.y, won: false });
    this.sounds.push('lose');
  }

  /** The claw is open over the chute: tell whoever paid how it went. */
  private endTry(mode: MachineState): void {
    if (mode === 'demo') {
      if (this.regularWon) this.sounds.push('win');
      this.regularWon = false;
      this.enter('rest', 2 + this.random() * 3);
      return;
    }
    this.enter('rest', 0);
    if (mode !== 'playing') return;
    const prize = this.won;
    this.luck.clawMisses = prize ? 0 : this.luck.clawMisses + 1;
    this.shown = prize ? 'WINNER!' : 'SO CLOSE';
    if (prize) this.sounds.push('win');
    this.outcome = { prize };
  }

  /** A carried plush hangs from the claw; falling ones drop (to the heap, or down the chute and out of the case). */
  private carry(dt: number, mode: MachineState): void {
    if (this.carried) {
      this.scratch.set(0, -this.drop - HANG - this.carried.r, 0).add(this.carriage);
      this.carried.pos.lerp(this.scratch, dampFactor(13, dt));
    }
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const falling = this.falling[i]!;
      const g = falling.plush.pos;
      g.y -= dt * 1.4;
      if (g.y > falling.to) continue;
      g.y = falling.to;
      this.falling.splice(i, 1);
      this.sounds.push('thud');
      if (!falling.won) continue;
      // Down the chute: the prize is the player's (a regular's goes home with them); a fresh plush takes its place on the heap.
      if (mode === 'playing') this.won = this.prizeFor(falling.plush.color);
      else if (mode === 'demo') this.regularWon = true;
      this.restock(falling.plush);
    }
  }

  /**
   * The attendant tops the heap up: the plush comes back in a new colour at a new spot, on the others; a colour the
   * player has not taken home yet when there is one left.
   */
  private restock(p: ClawPlush): void {
    const missing = PASTELS.filter((c) => {
      const prize = this.prizeFor(c);
      return prize !== undefined && !this.owns(prize);
    });
    const pool = missing.length ? missing : PASTELS;
    p.color = pool[Math.floor(this.random() * pool.length)]!;
    p.home.copy(this.heapSpot(p.r, true, p));
    p.pos.copy(p.home);
  }

  /** A plush left with nothing under it (the one under it was taken) drops onto what is there now. */
  private settle(): void {
    for (const p of this.plush) {
      if (p === this.carried || this.isFalling(p)) continue;
      const rest = this.restingY(p, p.pos.x, p.pos.z);
      if (p.pos.y - rest < 0.005) continue;
      p.home.y = rest;
      this.falling.push({ plush: p, to: rest, won: false });
    }
  }

  /** Where plush `p` (radius r) comes to rest at (x, z): on the floor, or sunk a little into the plush under it. */
  private restingY(p: ClawPlush | null, x: number, z: number, r = p?.r ?? 0.08): number {
    let y = BASE_H + r;
    for (const o of this.plush) {
      if (o === p || o === this.carried || this.isFalling(o)) continue;
      const d = Math.hypot(o.pos.x - x, o.pos.z - z);
      const reach = (o.r + r) * 0.9;
      if (d < reach) y = Math.max(y, o.pos.y + Math.sqrt(reach * reach - d * d));
    }
    return y;
  }

  private isFalling(p: ClawPlush): boolean {
    return this.falling.some((f) => f.plush === p);
  }

  /** A spot on the heap (away from the chute's corner), on the floor or (`high`) on top of another plush. */
  private heapSpot(r: number, high: boolean, self: ClawPlush | null = null): THREE.Vector3 {
    for (let tries = 0; ; tries++) {
      const x = (this.random() - 0.5) * (WIDTH - 0.3);
      const z = (this.random() - 0.5) * (DEPTH - 0.3);
      if (Math.hypot(x - CHUTE.x, z - CHUTE.z) < 0.14) continue;
      const spot = new THREE.Vector3(x, this.restingY(self, x, z, r), z);
      // On top wanted: keep looking for a spot with a plush under it (a few tries, then wherever it lands).
      if (!high || spot.y > BASE_H + r + 0.01 || tries >= 30) return spot;
    }
  }

  private enter(phase: ClawPhase, seconds: number): void {
    this.currentPhase = phase;
    this.phaseLeft = seconds;
  }
}
