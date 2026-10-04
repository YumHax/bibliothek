import * as THREE from 'three';
import type { Performer } from '@/world/people/performer';
import { BALL_R, HOOP, type HoopBall, type HoopOutcome, type HoopSim } from './HoopSim';
import { random } from '@/random';
import { smooth } from '@/math/scalar';

/*
 * A regular at the hoops, shot by shot, as people shoot them: eyes down to the gutter, bent at the
 * knees and the back to take a ball in both hands, the ball brought up in front of the face, eyes
 * on the rim; a dip of the knees, then up onto the toes, the arms driving the ball up and out and
 * the wrist snapping through, the ball leaving from where the hands let go of it; the follow-through
 * held a moment, the off hand dropping, the eyes following the ball. Makes and misses show on the
 * face while the next ball is already coming up; a streak gets a fist pump, one that rolls round
 * the rim and out gets the hands on the head, and in the last seconds nobody stops to react. The
 * ball is in the `HoopSim`'s hands the whole time (`take`, `throwHeld`); positions are machine-local.
 */

type Phase = 'idle' | 'reach' | 'lift' | 'aim' | 'dip' | 'shoot' | 'follow' | 'react';

/** Seconds of each move at the thrower's own pace. */
const MOVE_S: Record<Exclude<Phase, 'idle' | 'react'>, number> = { reach: 0.34, lift: 0.28, aim: 0.18, dip: 0.13, shoot: 0.15, follow: 0.34 };
/** Where the ball is set in front of the face and where it leaves the hands (machine-local, the player's end at +z). */
const SET = new THREE.Vector3(0.04, 1.4, 0.82);
const RELEASE = new THREE.Vector3(0.05, 1.8, 0.7);
/** Seconds from stepping up to the first ball (turning to the cage, a coin in). */
const START_S = 2.4;
/** How far apart the palms hold the ball (either side of its middle). */
const GRIP = BALL_R + 0.012;

export class HoopThrower {
  private phase: Phase = 'idle';
  private clock = 0;
  private ball: HoopBall | null = null;
  /** Where the ball was picked up from (machine-local), for the lift. */
  private readonly from = new THREE.Vector3();
  /** Where the ball is on its way this move (machine-local). */
  private readonly carry = new THREE.Vector3();
  private readonly hands = [new THREE.Vector3(), new THREE.Vector3()];
  private readonly scratch = new THREE.Vector3();
  private readonly palmA = new THREE.Vector3();
  private readonly palmB = new THREE.Vector3();
  private readonly lookPoint = new THREE.Vector3();
  /** The ball in the air, for the eyes to follow. */
  private flying: HoopBall | null = null;
  private reactFor = 0;
  /** This thrower's own pace (per second of `MOVE_S`), aim (0 sure .. 1 wild) and how long they aim. */
  private readonly pace: number;
  private readonly error: number;
  private aimFor: number;

  constructor(
    private readonly sim: HoopSim,
    private readonly machine: THREE.Object3D,
    private readonly body: Performer,
  ) {
    this.pace = 0.95 + random() * 0.35;
    this.error = 0.65 + random() * 0.5;
    this.aimFor = MOVE_S.aim;
    // Stepping up: turned to the cage and the coin in before the first ball.
    this.pause(START_S);
  }

  /** A frame of the round; `playing` false once the clock is out (the hands come down, the eyes follow the last ball). */
  update(dt: number, playing: boolean): void {
    const final = playing && this.sim.timeLeft <= 10;
    this.clock += dt * this.pace * (final ? 1.3 : 1);
    this.react(this.sim.takeOutcomes(), final);
    // A ball gone from the hands some other way (the round reset it): nothing to carry.
    if (this.ball && (this.ball.state === 'flying' || (this.phase !== 'reach' && this.ball.state !== 'held'))) this.ball = null;
    switch (this.phase) {
      case 'idle':
        this.standBy(playing);
        return;
      case 'react':
        this.reacting(dt);
        return;
      case 'reach':
        this.reaching();
        return;
      case 'lift':
        this.lifting(final);
        return;
      case 'aim':
        this.aiming();
        return;
      case 'dip':
        this.dipping();
        return;
      case 'shoot':
        this.shooting(final);
        return;
      case 'follow':
        this.following();
        return;
    }
  }

  /** Between balls: upright, hands free, eyes on the game; the next ball taken when there is one. */
  private standBy(playing: boolean): void {
    this.body.reachEach(null, null);
    this.body.crouch(0);
    this.body.rise(0);
    this.body.lean(0.05);
    this.body.hands(null);
    this.watch();
    // Not while a gesture has the arms (the next coin going in, a fist pump).
    const next = playing && !this.body.gesturing ? this.sim.nextBall(this.scratch.set(0, 1, 0.8)) : null;
    if (next) this.begin(next);
  }

  /** A reaction playing out on the body before the next ball. */
  private reacting(dt: number): void {
    this.body.reachEach(null, null);
    this.body.crouch(0);
    this.watch();
    this.reactFor -= dt;
    if (this.reactFor <= 0) this.to('idle');
  }

  /** Down to the ball in the gutter: knees and back bend, eyes on it, hands open either side; taken at the end. */
  private reaching(): void {
    const ball = this.ball;
    if (!ball || ball.state !== 'rest') return this.to('idle');
    const k = this.progress('reach');
    this.body.crouch(0.32 * k);
    this.body.lean(0.05 + 0.5 * k);
    this.body.hands([-0.7, -0.7], [0, 0]);
    this.body.eyesOn(this.machine.localToWorld(this.lookPoint.copy(ball.pos)));
    this.holdAt(ball.pos);
    if (k >= 1) {
      this.sim.take(ball);
      this.from.copy(ball.pos);
      this.to('lift');
    }
  }

  /** The ball brought up in front of the face, the body straightening; the aim's length drawn at the top. */
  private lifting(final: boolean): void {
    const k = smooth(this.progress('lift'));
    this.carry.lerpVectors(this.from, SET, k);
    this.carry.y += Math.sin(k * Math.PI) * 0.06;
    this.body.crouch(0.32 * (1 - k) + 0.08 * k);
    this.body.lean(0.55 * (1 - k) + 0.04 * k);
    this.body.hands([-0.35, -0.35], [0, 0]);
    this.eyesOnHoop();
    this.carryBall();
    if (k >= 1) {
      this.aimFor = MOVE_S.aim * (0.6 + random() * 1.2) * (final ? 0.4 : 1);
      this.to('aim');
    }
  }

  /** The ball set, eyes on the rim, for as long as this thrower takes. */
  private aiming(): void {
    this.carry.copy(SET);
    this.body.crouch(0.1);
    this.eyesOnHoop();
    this.carryBall();
    if (this.clock >= this.aimFor) this.to('dip');
  }

  /** The dip of the knees before the shot. */
  private dipping(): void {
    const k = smooth(this.progress('dip'));
    this.carry.copy(SET).y -= 0.07 * k;
    this.body.crouch(0.1 + 0.2 * k);
    this.eyesOnHoop();
    this.carryBall();
    if (k >= 1) this.to('shoot');
  }

  /** Up from the legs through the arms: knees straighten, up on the toes, the ball driven up and out, the wrist snapping; released at the top. */
  private shooting(final: boolean): void {
    const k = this.progress('shoot');
    const e = smooth(k);
    this.carry.lerpVectors(this.scratch.copy(SET).setY(SET.y - 0.07), RELEASE, e);
    this.body.crouch(0.3 * (1 - e));
    this.body.rise(e);
    this.body.lean(0.02);
    this.body.hands([-0.5, -0.3], [-0.2, -0.3 + 1.2 * e * e]);
    this.eyesOnHoop();
    this.carryBall();
    if (k >= 1) {
      const ball = this.ball;
      if (ball) {
        this.sim.throwHeld(ball, this.error * (final ? 1.3 : 1));
        this.flying = ball;
      }
      this.ball = null;
      this.to('follow');
    }
  }

  /** The shooting hand held up, wrist bent down (the "gooseneck"), the other hand dropping away; down off the toes, eyes on the ball. */
  private following(): void {
    const k = this.progress('follow');
    this.body.reachEach(k > 0.35 ? null : this.hands[0]!, this.machine.localToWorld(this.scratch.copy(RELEASE).add(FOLLOW_OFFSET)));
    this.body.hands([-0.4, 0.1], [0.2, 1.1]);
    this.body.rise(1 - smooth(k));
    this.body.crouch(0);
    this.watch();
    if (k >= 1) this.to('idle');
  }

  /** A new round: whatever was under way is forgotten (the balls are all back in the gutter). */
  reset(): void {
    this.ball = null;
    this.flying = null;
    this.phase = 'idle';
  }

  /** The regular left the machine: a ball in their hands drops back, their body is theirs again. */
  stop(): void {
    if (this.ball) this.sim.drop(this.ball);
    this.ball = null;
    this.flying = null;
    this.phase = 'idle';
    this.body.release();
  }

  /** Shows how the shots went: on the face mid-sequence, with the body between shots when it is worth it (never in the last seconds). */
  private react(outcomes: readonly HoopOutcome[], final: boolean): void {
    for (const outcome of outcomes) {
      const streak = this.sim.streak;
      const between = this.phase === 'idle' || this.phase === 'follow';
      if (outcome === 'basket' || outcome === 'swish') {
        if (streak >= 3 && between && !final && random() < 0.5) {
          this.body.react('great');
          this.pause(0.9);
        } else this.body.feel({ smile: outcome === 'swish' ? 1 : 0.7, browsUp: outcome === 'swish' ? 0.4 : 0 }, 1.2);
      } else if (outcome === 'rimOut') {
        if (between && !final && random() < 0.6) {
          this.body.react('near');
          this.pause(1.5);
        } else this.body.feel({ browsUp: 0.9, jaw: 0.35, frown: 0.2 }, 1.2);
      } else this.body.feel({ frown: 0.6, squint: 0.3 }, 1);
    }
  }

  private pause(seconds: number): void {
    if (this.ball) return;
    this.reactFor = seconds;
    this.to('react');
  }

  private begin(ball: HoopBall): void {
    this.ball = ball;
    this.to('reach');
  }

  private to(phase: Phase): void {
    this.phase = phase;
    this.clock = 0;
  }

  /** How far through the current move (0..1). */
  private progress(phase: keyof typeof MOVE_S): number {
    return Math.min(1, this.clock / MOVE_S[phase]);
  }

  /** Both palms either side of `centre` (machine-local): the -x hand (the person faces the machine, so machine +x) and the +x hand. */
  private holdAt(centre: THREE.Vector3): void {
    this.machine.localToWorld(this.hands[0]!.copy(centre).setX(centre.x + GRIP));
    this.machine.localToWorld(this.hands[1]!.copy(centre).setX(centre.x - GRIP));
    this.body.reachEach(this.hands[0]!, this.hands[1]!);
  }

  /** The hands on their way to `carry`, and the ball between the palms wherever they have actually got to. */
  private carryBall(): void {
    this.holdAt(this.carry);
    const ball = this.ball;
    if (!ball) return;
    this.body.palm(0, this.palmA);
    this.body.palm(1, this.palmB);
    this.machine.worldToLocal(ball.pos.copy(this.palmA).add(this.palmB).multiplyScalar(0.5));
  }

  private eyesOnHoop(): void {
    this.body.eyesOn(this.machine.localToWorld(this.lookPoint.set(this.sim.hoopX, HOOP.y + 0.05, HOOP.z)));
  }

  /** The eyes on the ball in the air, else on the hoop. */
  private watch(): void {
    const ball = this.flying;
    if (ball && ball.state === 'flying') this.body.eyesOn(this.machine.localToWorld(this.lookPoint.copy(ball.pos)));
    else {
      this.flying = null;
      this.eyesOnHoop();
    }
  }
}

/** The shooting hand's follow-through, a little past the release (machine-local). */
const FOLLOW_OFFSET = new THREE.Vector3(-0.02, 0.05, -0.08);

