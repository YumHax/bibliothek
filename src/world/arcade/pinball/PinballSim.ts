import { FixedStep } from '../FixedStep';
import { random } from '@/random';
import { formatNumber } from '@/text/count';
/*
 * A pinball table as a 2D simulation, in table units: x across (0 left .. 1 right, the shooter
 * lane on the right), y down the table (0 at the top, `length` at the player's end). Pure: no
 * three.js, no canvas; `Pinball` draws it and moves the 3D balls and flippers to match.
 */

interface Vec {
  x: number;
  y: number;
}

/** A wall: a segment the ball bounces off; `kick` walls (slingshots) throw it back hard and score. */
interface Wall {
  a: Vec;
  b: Vec;
  kick?: boolean;
}

interface Bumper {
  at: Vec;
  r: number;
  /** Seconds left of its flash after a hit. */
  flash: number;
}

interface Flipper {
  pivot: Vec;
  length: number;
  rest: number;
  up: number;
  angle: number;
  /** Angular speed this step (rad/s), for the kick it gives. */
  omega: number;
}

/** A ball on the table (a second one during multiball). */
interface PinballBall extends Vec {
  vx: number;
  vy: number;
  /** Height over the playfield (table units): above 0 only on the wire ramp. */
  lift: number;
  /** In the shooter lane. */
  inLane: boolean;
  /** Seconds since it was fired from the plunger (the ball save). */
  sinceLaunch: number;
  /** Seconds it has hardly moved (the ball search). */
  still: number;
  /** On the wire ramp: how far along it (0..1), else null. */
  ramp: number | null;
  /** Inside each top lane last step, so a lane counts once per pass. */
  readonly laneWas: boolean[];
}

interface PinballInput {
  left: boolean;
  right: boolean;
  /** Held: the plunger is pulled back; let go, it fires. */
  launch: boolean;
  /** Held: the player shoves the table (a press is one nudge; too many and it tilts). */
  nudge?: boolean;
}

export type PinballEvent =
  | 'bumper' | 'sling' | 'rollover' | 'lanes' | 'target' | 'bank' | 'flipper' | 'launch' | 'drain' | 'saved' | 'wall' | 'over'
  | 'skill' | 'ramp' | 'lit' | 'multiball' | 'jackpot' | 'bonus' | 'nudge' | 'danger' | 'tilt' | 'search';

export const BALL_R = 0.022;
const GRAVITY = 3.2;
const STEP = 1 / 480;
const WALL_BOUNCE = 0.45;
const FLIPPER_BOUNCE = 0.25;
const FLIPPER_SPEED = 18;
const FLIPPER_R = 0.017;
const BUMPER_KICK = 2.4;
const SLING_KICK = 2.1;
const MAX_SPEED = 7;
const BALLS = 3;
/** A ball lost this soon after its launch is given back. */
const SAVE_SECONDS = 4;
/**
 * What things pay. The shots a player aims for pay; the bumpers and slings only rattle: a ball
 * left to bounce about scores little, a lane, a bank, a ramp or the skill shot scores a lot.
 */
const POINTS = { bumper: 100, sling: 50, rollover: 2500, lanes: 10000, target: 3000, bank: 25000, skill: 25000, ramp: 10000, jackpot: 50000 };
/** The end-of-ball bonus: each lane, target and ramp this ball adds a step, paid at the drain times the multiplier. */
const BONUS_STEP = 2000;
const MAX_MULTIPLIER = 5;
/** Ramps within this many seconds of the last one chain (x2, x3...). */
const RAMP_CHAIN_S = 5;
const RAMP_CHAIN_MAX = 3;
/** The skill shot: the lit lane steps on this often while the ball waits, and stays live this long after the launch. */
const SKILL_STEP_S = 0.45;
const SKILL_LIVE_S = 3;
/** Nudges: each adds one to the heat, which cools by one every `NUDGE_COOL_S`; at `DANGER_AT` a warning, at `TILT_AT` the ball is tilted. */
const NUDGE_COOL_S = 2.5;
const DANGER_AT = 2;
const TILT_AT = 3;
/** A ball this slow for this long outside the shooter lane is stuck: the table kicks it (the ball search). */
const STILL_SPEED = 0.05;
const STILL_S = 3;
/** Where the inlane guides start: between them and the outer walls, the outlanes. */
const OUTLANE = 0.085;
/** The wire ramp: a shot up the right side through the gate rides it over the table and back down to the left inlane. */
const RAMP_GATE = { x0: 0.7, x1: 0.84, y: 1.0, minSpeed: 1.0 };
const RAMP_SECONDS = 0.9;
/** Its course over the playfield (table units) and its height there (the ball on it stays under the glass); `rampPoint` follows it. */
const RAMP_PATH: readonly { x: number; y: number; lift: number }[] = [
  { x: 0.77, y: 1.0, lift: 0 },
  { x: 0.74, y: 0.62, lift: 0.02 },
  { x: 0.6, y: 0.44, lift: 0.028 },
  { x: 0.4, y: 0.42, lift: 0.03 },
  { x: 0.22, y: 0.6, lift: 0.027 },
  { x: 0.13, y: 1.0, lift: 0.021 },
  { x: 0.11, y: 1.5, lift: 0.011 },
  { x: 0.114, y: 1.72, lift: 0.004 },
  // Down in the left inlane, clear of the post (x 0.085) and the slingshot (a drop onto it kicked the ball into the outlane).
  { x: 0.122, y: 1.885, lift: 0 },
];

/**
 * METEOR ALLEY's rules and physics: three balls, a spring plunger in the shooter lane (hold to
 * pull, let go to fire), two flippers, three pop bumpers, two slingshots, three rollover lanes at
 * the top (light all three: the multiplier goes up, to x5; a flipper moves the lit lanes along), a
 * bank of three stand-up targets on the left (all three: a big bonus, and the ramp lights for
 * multiball), and a wire ramp from the right side over to the left inlane (a ramp soon after
 * another chains; with multiball lit it starts a two-ball multiball, during which every ramp is a
 * jackpot). The skill shot: a lane blinks while the ball waits on the plunger; the first lane the
 * launched ball rolls through pays big if it is that one. Each ball ends with a bonus for what it
 * lit, times the multiplier. The table can be nudged; nudged too often it tilts (the flippers go
 * dead and the ball scores nothing more). A ball drained within four seconds of its launch is
 * saved; a ball stuck still is kicked free; a ball that ever leaves the table comes back to the
 * plunger. Fixed 480 Hz steps, so a fast ball never tunnels through a wall.
 */
export class PinballSim {
  readonly length: number;
  readonly walls: Wall[] = [];
  readonly bumpers: Bumper[];
  readonly flippers: [Flipper, Flipper];
  /** Rollover lanes at the top: x of each, and whether lit. */
  readonly lanes = [0.3, 0.45, 0.6];
  readonly lanesLit = [false, false, false];
  /** Stand-up targets on the left wall: y of each, and whether lit. */
  readonly targets: number[];
  readonly targetsLit = [false, false, false];
  /** The balls on the table: one, two during multiball. The first is the one on the plunger between balls. */
  readonly balls: PinballBall[] = [];
  readonly rampPath = RAMP_PATH;
  readonly rampGate = RAMP_GATE;
  score = 0;
  ballNumber = 1;
  multiplier = 1;
  /** 0..1, how far the plunger is pulled. */
  plunger = 0;
  over = true;
  /** The ramp is lit: the next ramp shot starts multiball. */
  multiballLit = false;
  /** The flippers are dead until this ball drains. */
  tilted = false;
  /** The lane blinking for the skill shot while the ball waits (null once the shot is played). */
  skillLane: number | null = 0;
  /** A caption on the display for a moment (BALL SAVED, MULTIPLIER x2...); `big` ones are the show-stoppers. */
  message: { text: string; left: number; big: boolean } | null = null;
  private events: PinballEvent[] = [];
  private readonly steps = new FixedStep(STEP, 0.05);
  private waitClock = 0;
  private skillLive = 0;
  private sinceRamp = Infinity;
  private rampChain = 0;
  private bonusSteps = 0;
  private heat = 0;
  private nudgeWas = false;
  private nudges = 0;
  private searches = 0;
  private pilotDecided = false;
  private pilotReacts = true;
  private pilotHold = -1;
  private pilotSide = 0;

  constructor(length = 2.44) {
    this.length = length;
    const L = length;
    const w = (ax: number, ay: number, bx: number, by: number, kick = false): void => {
      this.walls.push({ a: { x: ax, y: ay }, b: { x: bx, y: by }, kick });
    };
    // The top arch, from the left wall over to the lane's outer wall.
    const cx = 0.5;
    const cy = 0.5;
    const r = 0.48;
    const steps = 14;
    for (let i = 0; i < steps; i++) {
      const a0 = Math.PI + (i / steps) * Math.PI;
      const a1 = Math.PI + ((i + 1) / steps) * Math.PI;
      w(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, cx + Math.cos(a1) * r, cy + Math.sin(a1) * r);
    }
    // Outer walls, all the way down (the outlanes run between them and the guides); the lane's inner
    // wall stops short of the arch so the ball comes out over the top.
    w(0.02, 0.5, 0.02, L);
    w(0.98, 0.5, 0.98, L);
    w(0.88, 0.62, 0.88, L);
    w(0.88, L - 0.02, 0.98, L - 0.02);
    // Inlane guides down to the flippers (a ball outside them drains down an outlane), the posts
    // between inlane and outlane, and the slingshots above.
    w(OUTLANE, L - 0.52, 0.285, L - 0.285);
    w(0.9 - OUTLANE, L - 0.52, 0.615, L - 0.285);
    w(OUTLANE, L - 0.52, OUTLANE, L - 0.6);
    w(0.9 - OUTLANE, L - 0.52, 0.9 - OUTLANE, L - 0.6);
    w(0.12, L - 0.66, 0.22, L - 0.44, true);
    w(0.22, L - 0.44, 0.12, L - 0.47);
    w(0.78, L - 0.66, 0.68, L - 0.44, true);
    w(0.68, L - 0.44, 0.78, L - 0.47);
    // Lane dividers at the top.
    for (const x of [0.375, 0.525]) w(x, 0.14, x, 0.3);
    this.bumpers = [
      { at: { x: 0.32, y: 0.72 }, r: 0.055, flash: 0 },
      { at: { x: 0.58, y: 0.72 }, r: 0.055, flash: 0 },
      { at: { x: 0.45, y: 0.95 }, r: 0.055, flash: 0 },
    ];
    this.targets = [1.15, 1.27, 1.39];
    this.flippers = [
      { pivot: { x: 0.29, y: L - 0.27 }, length: 0.13, rest: 0.5, up: -0.45, angle: 0.5, omega: 0 },
      { pivot: { x: 0.61, y: L - 0.27 }, length: 0.13, rest: Math.PI - 0.5, up: Math.PI + 0.45, angle: Math.PI - 0.5, omega: 0 },
    ];
    this.balls.push(this.newBall());
    this.parkBall(this.ball);
  }

  /** The ball on the plunger between balls (the first on the table). */
  get ball(): PinballBall {
    return this.balls[0]!;
  }

  /** A new game: three balls, the score and the lights back to zero. */
  reset(): void {
    this.score = 0;
    this.ballNumber = 1;
    this.multiplier = 1;
    this.lanesLit.fill(false);
    this.targetsLit.fill(false);
    this.multiballLit = false;
    this.over = false;
    this.message = null;
    this.events = [];
    this.steps.reset();
    this.balls.length = 1;
    this.plunger = 0;
    this.nudgeWas = false;
    this.newBallInPlay();
  }

  takeEvents(): PinballEvent[] {
    const events = this.events;
    this.events = [];
    return events;
  }

  /** Whether the ball sits on the plunger, waiting to be fired. */
  get waitingToLaunch(): boolean {
    const ball = this.ball;
    return this.balls.length === 1 && ball.inLane && ball.y > this.length - 0.1 && Math.abs(ball.vy) < 0.05;
  }

  /** Whether more than one ball is in play. */
  get multiball(): boolean {
    return this.balls.length > 1;
  }

  update(dt: number, input: PinballInput): void {
    if (this.message) {
      this.message.left -= dt;
      if (this.message.left <= 0) this.message = null;
    }
    for (const b of this.bumpers) b.flash = Math.max(0, b.flash - dt);
    if (this.over) {
      this.moveFlippers(dt, { left: false, right: false, launch: false });
      return;
    }
    // A tilted table: the flippers are dead until the ball drains.
    const hands = this.tilted ? { left: false, right: false, launch: input.launch } : input;
    this.heat = Math.max(0, this.heat - dt / NUDGE_COOL_S);
    const nudge = !!input.nudge;
    if (nudge && !this.nudgeWas) this.shove();
    this.nudgeWas = nudge;
    // The plunger: pulled back while held, fires on release when the ball is on it; meanwhile the skill-shot lane steps along.
    const waiting = this.waitingToLaunch;
    if (waiting && this.skillLane !== null) {
      this.waitClock += dt;
      this.skillLane = Math.floor(this.waitClock / SKILL_STEP_S) % this.lanes.length;
    }
    if (hands.launch) this.plunger = Math.min(1, this.plunger + dt * 1.2);
    else if (this.plunger > 0) {
      if (waiting) this.fire(this.ball, this.plunger);
      this.plunger = 0;
    }
    if (this.skillLive > 0) {
      this.skillLive -= dt;
      if (this.skillLive <= 0) this.skillLane = null;
    }
    this.sinceRamp += dt;
    for (const ball of this.balls) ball.sinceLaunch += dt;
    this.steps.run(dt, (h) => {
      this.moveFlippers(h, hands);
      this.step(h);
      return this.over;
    });
  }

  /**
   * What a decent player's hands do: flip when the ball comes down onto a flipper, fire the plunger
   * at a random strength. Call it once per step of `dt` seconds (the hold of a flip runs on it).
   */
  autopilot(skill: number, launching: boolean, dt = 1 / 60): PinballInput {
    // The lowest ball on the table is the one to save.
    let ball = this.ball;
    for (const b of this.balls) if (b.ramp === null && b.y > ball.y) ball = b;
    const L = this.length;
    const near = ball.ramp === null && ball.y > L - 0.4 && ball.y < L - 0.2 && ball.vy > -0.3;
    // A human is late now and then: the lesser the player, the more often the ball slips by.
    if (near && !this.pilotDecided) {
      this.pilotDecided = true;
      this.pilotReacts = random() < 0.55 + skill * 0.4;
    }
    if (!near) this.pilotDecided = false;
    // A flip is a short press: held for a moment, then let go (holding it would cradle the ball for ever).
    this.pilotHold = Math.max(-1, this.pilotHold - dt);
    const [left, right] = this.flippers;
    const onLeft = ball.x > left.pivot.x + 0.02 && ball.x < 0.45;
    const onRight = ball.x < right.pivot.x - 0.02 && ball.x >= 0.45;
    if (near && this.pilotReacts && (onLeft || onRight) && this.pilotHold <= -0.15) {
      this.pilotHold = 0.18;
      this.pilotSide = onLeft ? 0 : 1;
    }
    const flipping = this.pilotHold > 0;
    return {
      left: flipping && this.pilotSide === 0,
      right: flipping && this.pilotSide === 1,
      launch: this.waitingToLaunch && launching,
    };
  }

  /** Where the wire ramp is `t` (0..1) along: table x and y, and its height over the playfield. */
  rampPoint(t: number, out: { x: number; y: number; lift: number } = { x: 0, y: 0, lift: 0 }): { x: number; y: number; lift: number } {
    const path = RAMP_PATH;
    const f = Math.max(0, Math.min(1, t)) * (path.length - 1);
    const i = Math.min(path.length - 2, Math.floor(f));
    const k = f - i;
    const a = path[i]!;
    const b = path[i + 1]!;
    out.x = a.x + (b.x - a.x) * k;
    out.y = a.y + (b.y - a.y) * k;
    out.lift = a.lift + (b.lift - a.lift) * k;
    return out;
  }

  private emit(event: PinballEvent): void {
    if (this.events.length < 16) this.events.push(event);
  }

  /** Points times the multiplier (and doubled in multiball); a tilted ball scores nothing. */
  private add(points: number): void {
    if (this.tilted) return;
    this.score += points * this.multiplier * (this.multiball ? 2 : 1);
  }

  private say(text: string, big = false): void {
    this.message = { text, left: big ? 2.2 : 1.6, big };
  }

  private newBall(): PinballBall {
    return { x: 0, y: 0, vx: 0, vy: 0, lift: 0, inLane: true, sinceLaunch: Infinity, still: 0, ramp: null, laneWas: [false, false, false] };
  }

  /** The next ball on the plunger: the skill shot blinks again, the tilt and the ball's bonus start over. */
  private newBallInPlay(): void {
    this.parkBall(this.ball);
    this.tilted = false;
    this.heat = 0;
    this.nudges = 0;
    this.bonusSteps = 0;
    this.rampChain = 0;
    this.sinceRamp = Infinity;
    this.searches = 0;
    this.waitClock = 0;
    this.skillLane = 0;
    this.skillLive = 0;
  }

  private parkBall(ball: PinballBall): void {
    ball.x = 0.93;
    ball.y = this.length - 0.02 - BALL_R - 0.001;
    ball.vx = 0;
    ball.vy = 0;
    ball.lift = 0;
    ball.inLane = true;
    ball.sinceLaunch = Infinity;
    ball.still = 0;
    ball.ramp = null;
    ball.laneWas.fill(false);
  }

  private fire(ball: PinballBall, pull: number): void {
    ball.vy = -(2.6 + 3.6 * pull);
    ball.sinceLaunch = 0;
    if (this.skillLane !== null && ball === this.ball && !this.multiball) this.skillLive = SKILL_LIVE_S;
    this.emit('launch');
  }

  /** A shove of the table: the balls jump a little; too many shoves in a short while and it tilts. */
  private shove(): void {
    if (this.tilted) return;
    this.nudges += 1;
    const side = this.nudges % 2 ? 1 : -1;
    for (const ball of this.balls) {
      if (ball.ramp !== null || (ball.inLane && ball.y > this.length - 0.1)) continue;
      ball.vy -= 0.55;
      ball.vx += 0.25 * side;
      ball.still = 0;
    }
    this.heat += 1;
    this.emit('nudge');
    if (this.heat >= TILT_AT) {
      this.tilted = true;
      this.say('TILT', true);
      this.emit('tilt');
    } else if (this.heat >= DANGER_AT) {
      this.say('DANGER');
      this.emit('danger');
    }
  }

  private moveFlippers(dt: number, input: PinballInput): void {
    this.flippers.forEach((f, i) => {
      const held = i === 0 ? input.left : input.right;
      const target = held ? f.up : f.rest;
      const before = f.angle;
      const delta = target - f.angle;
      const stepMax = FLIPPER_SPEED * dt;
      f.angle += Math.abs(delta) <= stepMax ? delta : Math.sign(delta) * stepMax;
      f.omega = (f.angle - before) / dt;
      if (held && before === f.rest && f.angle !== f.rest) {
        this.emit('flipper');
        // Lane change: a flip moves the lit top lanes one along, towards the flipper's side.
        if (!this.over) this.shiftLanes(i === 0 ? -1 : 1);
      }
    });
  }

  private shiftLanes(dir: -1 | 1): void {
    const lit = [...this.lanesLit];
    const n = lit.length;
    for (let i = 0; i < n; i++) this.lanesLit[i] = lit[(i - dir + n) % n]!;
  }

  private step(dt: number): void {
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const ball = this.balls[i]!;
      if (ball.ramp !== null) this.ride(ball, dt);
      else this.roll(ball, dt);
      if (this.over) return;
    }
    if (this.balls.length > 1) this.collideBalls();
  }

  /** One step of a ball on the playfield. */
  private roll(ball: PinballBall, dt: number): void {
    ball.vy += GRAVITY * dt;
    const speed = Math.hypot(ball.vx, ball.vy);
    if (speed > MAX_SPEED) {
      ball.vx *= MAX_SPEED / speed;
      ball.vy *= MAX_SPEED / speed;
    }
    const yWas = ball.y;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    if (ball.x < 0.88 - BALL_R) ball.inLane = false;
    else if (ball.y > 0.7) ball.inLane = true;

    for (const wall of this.walls) this.collideSegment(ball, wall.a, wall.b, BALL_R, wall.kick ? 'sling' : 'wall');
    for (const bumper of this.bumpers) this.collideBumper(ball, bumper);
    for (const f of this.flippers) this.collideFlipper(ball, f);
    this.checkTargets(ball);
    this.checkLanes(ball);
    // Up through the ramp's gate, fast enough: it rides the ramp.
    const gate = RAMP_GATE;
    if (yWas > gate.y && ball.y <= gate.y && ball.x > gate.x0 && ball.x < gate.x1 && -ball.vy > gate.minSpeed && !this.tilted) this.enterRamp(ball);

    // A ball off the table (it should never happen): back to the plunger, nothing lost.
    if (!Number.isFinite(ball.x) || !Number.isFinite(ball.y) || ball.x < -0.1 || ball.x > 1.1 || ball.y < -0.2) {
      this.ballSearch(ball, true);
      return;
    }
    // A ball stuck still somewhere (on a post, in a corner): the table kicks it free.
    const resting = ball.inLane && ball.y > this.length - 0.1;
    ball.still = !resting && Math.hypot(ball.vx, ball.vy) < STILL_SPEED ? ball.still + dt : 0;
    if (ball.still > STILL_S) this.ballSearch(ball, false);
    else if (ball.y > this.length + 0.05) this.drain(ball);
  }

  /** A ball riding the wire ramp: it follows the rails, then drops into the left inlane. */
  private ride(ball: PinballBall, dt: number): void {
    ball.ramp = (ball.ramp ?? 0) + dt / RAMP_SECONDS;
    if (ball.ramp < 1) {
      const p = this.rampPoint(ball.ramp);
      ball.x = p.x;
      ball.y = p.y;
      ball.lift = p.lift;
      return;
    }
    const end = RAMP_PATH[RAMP_PATH.length - 1]!;
    ball.ramp = null;
    ball.lift = 0;
    ball.x = end.x;
    ball.y = end.y;
    ball.vx = 0.15;
    ball.vy = 0.9;
    ball.still = 0;
  }

  private enterRamp(ball: PinballBall): void {
    ball.ramp = 0;
    ball.lift = 0;
    ball.vx = 0;
    ball.vy = 0;
    this.bonusSteps += 1;
    if (this.multiballLit && !this.multiball) {
      this.multiballLit = false;
      this.add(POINTS.ramp);
      this.startMultiball();
      return;
    }
    if (this.multiball) {
      this.add(POINTS.jackpot);
      this.say('JACKPOT!', true);
      this.emit('jackpot');
      return;
    }
    this.rampChain = this.sinceRamp < RAMP_CHAIN_S ? Math.min(RAMP_CHAIN_MAX, this.rampChain + 1) : 1;
    this.sinceRamp = 0;
    this.add(POINTS.ramp * this.rampChain);
    this.say(this.rampChain > 1 ? `RAMP x${this.rampChain}` : 'RAMP!');
    this.emit('ramp');
  }

  /** Multiball: a second ball fired from the plunger on its own. */
  private startMultiball(): void {
    const ball = this.newBall();
    this.parkBall(ball);
    ball.vy = -(2.6 + 3.6 * 0.7);
    ball.sinceLaunch = 0;
    this.balls.push(ball);
    this.say('MULTIBALL!', true);
    this.emit('multiball');
  }

  /** The ball search: a stuck ball is kicked free; a third time (or a ball off the table) it goes back to the plunger. */
  private ballSearch(ball: PinballBall, lost: boolean): void {
    this.searches += 1;
    ball.still = 0;
    this.emit('search');
    if (lost || this.searches > 2) {
      if (this.balls.length > 1) this.balls.splice(this.balls.indexOf(ball), 1);
      else this.parkBall(ball);
      this.say('BALL SEARCH');
      return;
    }
    ball.vy = -1.6;
    ball.vx = ball.x < 0.45 ? 0.6 : -0.6;
  }

  private drain(ball: PinballBall): void {
    // In multiball a drained ball just leaves the table; the last one carries on.
    if (this.balls.length > 1) {
      this.balls.splice(this.balls.indexOf(ball), 1);
      this.emit('drain');
      if (this.balls.length === 1) this.say('MULTIBALL OVER');
      return;
    }
    if (ball.sinceLaunch < SAVE_SECONDS && !this.tilted) {
      this.say('BALL SAVED');
      this.emit('saved');
      this.parkBall(ball);
      this.waitClock = 0;
      this.skillLane = null;
      return;
    }
    this.emit('drain');
    // The ball's bonus: what it lit, times the multiplier (nothing for a tilted ball).
    if (!this.tilted && this.bonusSteps > 0) {
      const bonus = this.bonusSteps * BONUS_STEP * this.multiplier;
      this.score += bonus;
      this.say(`BONUS ${formatNumber(bonus)}`, true);
      this.emit('bonus');
    }
    this.multiplier = 1;
    if (this.ballNumber >= BALLS) {
      this.over = true;
      this.emit('over');
      this.parkBall(ball);
      return;
    }
    this.ballNumber += 1;
    if (!this.message) this.say(`BALL ${this.ballNumber}`);
    this.newBallInPlay();
  }

  /** Two balls in multiball knock into each other (equal weights). */
  private collideBalls(): void {
    for (let i = 0; i < this.balls.length; i++) {
      for (let j = i + 1; j < this.balls.length; j++) {
        const a = this.balls[i]!;
        const b = this.balls[j]!;
        if (a.ramp !== null || b.ramp !== null) continue;
        let nx = b.x - a.x;
        let ny = b.y - a.y;
        const d = Math.hypot(nx, ny);
        if (d >= BALL_R * 2 || d === 0) continue;
        nx /= d;
        ny /= d;
        const push = (BALL_R * 2 - d) / 2;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
        const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (vn >= 0) continue;
        const j2 = -vn * 0.9;
        a.vx -= j2 * nx;
        a.vy -= j2 * ny;
        b.vx += j2 * nx;
        b.vy += j2 * ny;
      }
    }
  }

  /** Pushes the ball out of a segment (radius `r` round it) and bounces it; a slingshot kicks. */
  private collideSegment(ball: PinballBall, a: Vec, b: Vec, r: number, kind: 'wall' | 'sling'): boolean {
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((ball.x - a.x) * abx + (ball.y - a.y) * aby) / (abx * abx + aby * aby)));
    const px = a.x + abx * t;
    const py = a.y + aby * t;
    let nx = ball.x - px;
    let ny = ball.y - py;
    const d = Math.hypot(nx, ny);
    if (d >= r || d === 0) return false;
    nx /= d;
    ny /= d;
    ball.x = px + nx * r;
    ball.y = py + ny * r;
    const vn = ball.vx * nx + ball.vy * ny;
    if (vn >= 0) return true;
    if (kind === 'sling') {
      const out = Math.max(SLING_KICK, -vn);
      ball.vx += (out - vn) * nx;
      ball.vy += (out - vn) * ny;
      this.add(POINTS.sling);
      this.emit('sling');
      return true;
    }
    ball.vx -= (1 + WALL_BOUNCE) * vn * nx;
    ball.vy -= (1 + WALL_BOUNCE) * vn * ny;
    ball.vx *= 0.995;
    ball.vy *= 0.995;
    if (-vn > 1.2) this.emit('wall');
    return true;
  }

  private collideBumper(ball: PinballBall, bumper: Bumper): void {
    let nx = ball.x - bumper.at.x;
    let ny = ball.y - bumper.at.y;
    const d = Math.hypot(nx, ny);
    const min = bumper.r + BALL_R;
    if (d >= min || d === 0) return;
    nx /= d;
    ny /= d;
    ball.x = bumper.at.x + nx * min;
    ball.y = bumper.at.y + ny * min;
    const out = Math.max(BUMPER_KICK, Math.hypot(ball.vx, ball.vy) * 0.8);
    ball.vx = nx * out;
    ball.vy = ny * out;
    bumper.flash = 0.15;
    this.add(POINTS.bumper);
    this.emit('bumper');
  }

  /** A flipper is a capsule turning about its pivot: the ball bounces off it relative to the flipper's own speed at the contact. */
  private collideFlipper(ball: PinballBall, f: Flipper): void {
    const tip = { x: f.pivot.x + Math.cos(f.angle) * f.length, y: f.pivot.y + Math.sin(f.angle) * f.length };
    const abx = tip.x - f.pivot.x;
    const aby = tip.y - f.pivot.y;
    const t = Math.max(0, Math.min(1, ((ball.x - f.pivot.x) * abx + (ball.y - f.pivot.y) * aby) / (abx * abx + aby * aby)));
    const px = f.pivot.x + abx * t;
    const py = f.pivot.y + aby * t;
    let nx = ball.x - px;
    let ny = ball.y - py;
    const d = Math.hypot(nx, ny);
    const min = BALL_R + FLIPPER_R * (1 - t * 0.4);
    if (d >= min || d === 0) return;
    nx /= d;
    ny /= d;
    ball.x = px + nx * min;
    ball.y = py + ny * min;
    // The flipper's surface speed at the contact point: omega x (contact - pivot).
    const fvx = -f.omega * (py - f.pivot.y);
    const fvy = f.omega * (px - f.pivot.x);
    const rvx = ball.vx - fvx;
    const rvy = ball.vy - fvy;
    const vn = rvx * nx + rvy * ny;
    if (vn >= 0) return;
    ball.vx = fvx + rvx - (1 + FLIPPER_BOUNCE) * vn * nx;
    ball.vy = fvy + rvy - (1 + FLIPPER_BOUNCE) * vn * ny;
  }

  /** The stand-up targets along the left wall: touched, they light; all three pay the bank and light the ramp for multiball. */
  private checkTargets(ball: PinballBall): void {
    if (ball.x > 0.02 + BALL_R + 0.012) return;
    this.targets.forEach((y, i) => {
      if (Math.abs(ball.y - y) > 0.05 || this.targetsLit[i]) return;
      this.targetsLit[i] = true;
      this.add(POINTS.target);
      this.bonusSteps += 1;
      this.emit('target');
      if (this.targetsLit.every(Boolean)) {
        this.add(POINTS.bank);
        this.targetsLit.fill(false);
        if (!this.multiball && !this.multiballLit && !this.tilted) {
          this.multiballLit = true;
          this.say('MULTIBALL IS LIT', true);
          this.emit('lit');
        } else this.say('TARGET BANK!');
        this.emit('bank');
      }
    });
  }

  /** Rolling down through a top lane lights it; all three raise the multiplier. The first lane after the launch may be the skill shot. */
  private checkLanes(ball: PinballBall): void {
    this.lanes.forEach((x, i) => {
      const inside = Math.abs(ball.x - x) < 0.06 && ball.y > 0.16 && ball.y < 0.28;
      if (inside && !ball.laneWas[i] && ball.vy > 0) {
        if (this.skillLive > 0 && this.skillLane !== null) {
          if (this.skillLane === i && !this.tilted) {
            this.add(POINTS.skill);
            this.say('SKILL SHOT!', true);
            this.emit('skill');
          }
          this.skillLive = 0;
          this.skillLane = null;
        }
        if (!this.lanesLit[i]) {
          this.lanesLit[i] = true;
          this.add(POINTS.rollover);
          this.bonusSteps += 1;
          this.emit('rollover');
          if (this.lanesLit.every(Boolean)) {
            this.add(POINTS.lanes);
            this.lanesLit.fill(false);
            this.multiplier = Math.min(MAX_MULTIPLIER, this.multiplier + 1);
            this.say(`MULTIPLIER x${this.multiplier}`);
            this.emit('lanes');
          }
        }
      }
      ball.laneWas[i] = inside;
    });
  }
}
