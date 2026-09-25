/*
 * A pinball table as a 2D simulation, in table units: x across (0 left .. 1 right, the shooter
 * lane on the right), y down the table (0 at the top, `length` at the player's end). Pure: no
 * three.js, no canvas; `Pinball` draws it and moves the 3D ball and flippers to match.
 */

export interface Vec {
  x: number;
  y: number;
}

/** A wall: a segment the ball bounces off; `kick` walls (slingshots) throw it back hard and score. */
export interface Wall {
  a: Vec;
  b: Vec;
  kick?: boolean;
}

export interface Bumper {
  at: Vec;
  r: number;
  /** Seconds left of its flash after a hit. */
  flash: number;
}

export interface Flipper {
  pivot: Vec;
  length: number;
  rest: number;
  up: number;
  angle: number;
  /** Angular speed this step (rad/s), for the kick it gives. */
  omega: number;
}

export interface PinballInput {
  left: boolean;
  right: boolean;
  /** Held: the plunger is pulled back; let go, it fires. */
  launch: boolean;
}

export type PinballEvent = 'bumper' | 'sling' | 'rollover' | 'lanes' | 'target' | 'bank' | 'flipper' | 'launch' | 'drain' | 'saved' | 'wall' | 'over';

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
const POINTS = { bumper: 500, sling: 100, rollover: 1000, lanes: 5000, target: 1500, bank: 10000 };
const MAX_MULTIPLIER = 5;
/** Where the inlane guides start: between them and the outer walls, the outlanes. */
const OUTLANE = 0.085;

/**
 * METEOR ALLEY's rules and physics: three balls, a spring plunger in the shooter lane (hold to
 * pull, let go to fire), two flippers, three pop bumpers, two slingshots above the inlanes, three
 * rollover lanes at the top (light all three: 5 000 and the multiplier goes up, to x5) and a bank
 * of three stand-up targets on the left (all three: 10 000). A ball drained within four seconds
 * of its launch is saved. Fixed 480 Hz steps, so a fast ball never tunnels through a wall.
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
  readonly ball: Vec & { vx: number; vy: number } = { x: 0, y: 0, vx: 0, vy: 0 };
  score = 0;
  ballNumber = 1;
  multiplier = 1;
  /** 0..1, how far the plunger is pulled. */
  plunger = 0;
  over = true;
  /** A caption on the display for a moment (BALL SAVED, LANES x2...). */
  message: { text: string; left: number } | null = null;
  private events: PinballEvent[] = [];
  private accumulator = 0;
  private sinceLaunch = Infinity;
  private inLane = true;
  private laneWas = [false, false, false];
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
    this.parkBall();
  }

  /** A new game: three balls, the score and the lights back to zero. */
  reset(): void {
    this.score = 0;
    this.ballNumber = 1;
    this.multiplier = 1;
    this.lanesLit.fill(false);
    this.targetsLit.fill(false);
    this.over = false;
    this.message = null;
    this.events = [];
    this.parkBall();
  }

  takeEvents(): PinballEvent[] {
    const events = this.events;
    this.events = [];
    return events;
  }

  /** Whether the ball sits on the plunger, waiting to be fired. */
  get waitingToLaunch(): boolean {
    return this.inLane && this.ball.y > this.length - 0.1 && Math.abs(this.ball.vy) < 0.05;
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
    // The plunger: pulled back while held, fires on release when the ball is on it.
    if (input.launch) this.plunger = Math.min(1, this.plunger + dt * 1.2);
    else if (this.plunger > 0) {
      if (this.waitingToLaunch) {
        this.ball.vy = -(2.6 + 3.6 * this.plunger);
        this.sinceLaunch = 0;
        this.emit('launch');
      }
      this.plunger = 0;
    }
    this.sinceLaunch += dt;
    this.accumulator += Math.min(dt, 0.05);
    while (this.accumulator >= STEP) {
      this.accumulator -= STEP;
      this.moveFlippers(STEP, input);
      this.step(STEP);
      if (this.over) break;
    }
  }

  /** What a decent player's hands do: flip when the ball comes down onto a flipper, fire the plunger at a random strength. */
  autopilot(skill: number, launching: boolean): PinballInput {
    const { ball, length: L } = this;
    const near = ball.y > L - 0.4 && ball.y < L - 0.2 && ball.vy > -0.3;
    // A human is late now and then: the lesser the player, the more often the ball slips by.
    if (near && !this.pilotDecided) {
      this.pilotDecided = true;
      this.pilotReacts = Math.random() < 0.55 + skill * 0.4;
    }
    if (!near) this.pilotDecided = false;
    // A flip is a short press: held for a moment, then let go (holding it would cradle the ball for ever).
    this.pilotHold = Math.max(-1, this.pilotHold - 1 / 60);
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

  private emit(event: PinballEvent): void {
    if (this.events.length < 12) this.events.push(event);
  }

  private add(points: number): void {
    this.score += points * this.multiplier;
  }

  private say(text: string): void {
    this.message = { text, left: 1.6 };
  }

  private parkBall(): void {
    this.ball.x = 0.93;
    this.ball.y = this.length - 0.02 - BALL_R - 0.001;
    this.ball.vx = 0;
    this.ball.vy = 0;
    this.inLane = true;
    this.sinceLaunch = Infinity;
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
      if (held && before === f.rest && f.angle !== f.rest) this.emit('flipper');
    });
  }

  private step(dt: number): void {
    const ball = this.ball;
    ball.vy += GRAVITY * dt;
    const speed = Math.hypot(ball.vx, ball.vy);
    if (speed > MAX_SPEED) {
      ball.vx *= MAX_SPEED / speed;
      ball.vy *= MAX_SPEED / speed;
    }
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    if (ball.x < 0.88 - BALL_R) this.inLane = false;
    else if (ball.y > 0.7) this.inLane = true;

    for (const wall of this.walls) this.collideSegment(wall.a, wall.b, BALL_R, wall.kick ? 'sling' : 'wall');
    for (const bumper of this.bumpers) this.collideBumper(bumper);
    for (const f of this.flippers) this.collideFlipper(f);
    this.checkTargets();
    this.checkLanes();

    if (!Number.isFinite(ball.x) || !Number.isFinite(ball.y) || ball.x < -0.1 || ball.x > 1.1 || ball.y < -0.2) this.parkBall();
    if (ball.y > this.length + 0.05) this.drain();
  }

  private drain(): void {
    if (this.sinceLaunch < SAVE_SECONDS) {
      this.say('BALL SAVED');
      this.emit('saved');
      this.parkBall();
      return;
    }
    this.emit('drain');
    this.multiplier = 1;
    if (this.ballNumber >= BALLS) {
      this.over = true;
      this.emit('over');
      this.parkBall();
      return;
    }
    this.ballNumber += 1;
    this.say(`BALL ${this.ballNumber}`);
    this.parkBall();
  }

  /** Pushes the ball out of a segment (radius `r` round it) and bounces it; a slingshot kicks. */
  private collideSegment(a: Vec, b: Vec, r: number, kind: 'wall' | 'sling'): boolean {
    const ball = this.ball;
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

  private collideBumper(bumper: Bumper): void {
    const ball = this.ball;
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
  private collideFlipper(f: Flipper): void {
    const ball = this.ball;
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

  /** The stand-up targets along the left wall: touched, they light; all three pay the bank. */
  private checkTargets(): void {
    const ball = this.ball;
    if (ball.x > 0.02 + BALL_R + 0.012) return;
    this.targets.forEach((y, i) => {
      if (Math.abs(ball.y - y) > 0.05 || this.targetsLit[i]) return;
      this.targetsLit[i] = true;
      this.add(POINTS.target);
      this.emit('target');
      if (this.targetsLit.every(Boolean)) {
        this.add(POINTS.bank);
        this.targetsLit.fill(false);
        this.say('TARGET BANK!');
        this.emit('bank');
      }
    });
  }

  /** Rolling down through a top lane lights it; all three raise the multiplier. */
  private checkLanes(): void {
    const ball = this.ball;
    this.lanes.forEach((x, i) => {
      const inside = Math.abs(ball.x - x) < 0.06 && ball.y > 0.16 && ball.y < 0.28;
      if (inside && !this.laneWas[i] && ball.vy > 0 && !this.lanesLit[i]) {
        this.lanesLit[i] = true;
        this.add(POINTS.rollover);
        this.emit('rollover');
        if (this.lanesLit.every(Boolean)) {
          this.add(POINTS.lanes);
          this.lanesLit.fill(false);
          this.multiplier = Math.min(MAX_MULTIPLIER, this.multiplier + 1);
          this.say(`MULTIPLIER x${this.multiplier}`);
          this.emit('lanes');
        }
      }
      this.laneWas[i] = inside;
    });
  }
}
