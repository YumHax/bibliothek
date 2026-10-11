// The arcade's balance table: every cabinet game, the alley, the hoops and the pinball played headless by simulated
// people (a novice, an ordinary player, a good one) and by a regular's autopilot, at the machines' own fixed step. For
// each: what a play scores and lasts, the tickets it pays at today's `PAYOUT`, what the player nets a minute once the
// coin is paid, and the rate that would net `--net` tickets a minute for the ordinary player (the one `PAYOUT` is set
// on). The people are models, not measurements: reaction times, timing spread and slips from casual keyboard play, so
// read the table to compare machines and profiles, then check real plays with `?payout`.
//
//   npm run balance                     every machine, 60 plays per profile
//   npm run balance -- --game snake,frog --runs 200 --net 60
//
// The game code is bundled with the project's esbuild into a temp file and run in Node (no DOM: a few globals are
// stubbed). The drivers read the games' private fields (plain properties at run time): they are the people's eyes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const RUNS = Number(arg('runs', 60));
const NET = Number(arg('net', 60));
const ONLY = arg('game', null)?.split(',') ?? null;
/** Seconds a play costs beyond its own: the coin, the walk of the end card's tickets, the next coin. */
const OVERHEAD = 5;

// --- The game code, bundled for Node ---------------------------------------------------------------

const out = path.join(os.tmpdir(), `bibliothek-balance-${process.pid}.mjs`);
await build({
  stdin: {
    // What the script plays is listed in `src/headless/balance.ts` (typechecked, and knip sees it used).
    contents: `export * from '@/headless/balance';`,
    resolveDir: ROOT,
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  alias: { '@': path.join(ROOT, 'src') },
  banner: {
    js: `globalThis.window = globalThis; globalThis.addEventListener = () => {}; globalThis.removeEventListener = () => {};
      globalThis.location = { search: '', href: 'http://localhost/' };
      globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
      globalThis.document = { createElement: () => ({ getContext: () => null, style: {} }) };
      if (!('navigator' in globalThis)) globalThis.navigator = { maxTouchPoints: 0, userAgent: 'node' };`,
  },
  outfile: out,
  logLevel: 'error',
});
const { ARCADE_GAMES, pointsPerTicket, ticketsAt, TICKET_FLOOR, rivalTable, HoopSim, AlleySim, PinballSim, REPLAY_STEP, THREE } = await import(pathToFileURL(out).href);
/** The machines' own fixed step (`world/arcade/replay/Replay`): the live play and this script step alike. */
const STEP = REPLAY_STEP;
fs.rmSync(out, { force: true });

// --- The people ------------------------------------------------------------------------------------

/**
 * `skill` feeds the game's own autopilot (what it reads of the board), `react` is how late the hands follow the eyes
 * (s), `sigma` the spread of a timed press (s), `lapse` the odds of missing a beat altogether; the physical machines
 * add `aim` (m of spread at the hoop, the alley's lane); the pinball has hands of its own (`PINBALL_HANDS`).
 */
const PROFILES = {
  novice: { skill: 0.3, react: 0.3, sigma: 0.075, lapse: 0.08, aim: 0.12 },
  ordinary: { skill: 0.55, react: 0.23, sigma: 0.05, lapse: 0.04, aim: 0.07 },
  good: { skill: 0.8, react: 0.18, sigma: 0.035, lapse: 0.02, aim: 0.04 },
  regular: { skill: 0.9, react: 0, sigma: 0, lapse: 0, aim: 0.02 },
};

const NONE = () => ({ left: false, right: false, up: false, down: false, fire: false, firePressed: false });
const gauss = () => {
  let u = 0;
  let v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

/** Presses scheduled at chosen times, each held 50 ms (or `hold` seconds: a dance pad's held arrow). */
function presser() {
  const queue = [];
  return {
    at(t, key, hold = 0.05) {
      queue.push({ t, key, hold });
    },
    pending: (key) => queue.some((e) => e.key === key),
    controls(now) {
      const c = NONE();
      for (const e of queue) {
        if (now < e.t || now >= e.t + e.hold) continue;
        c[e.key] = true;
        if (e.key === 'fire' && now < e.t + STEP) c.firePressed = true;
      }
      for (let i = queue.length - 1; i >= 0; i--) if (now >= queue[i].t + queue[i].hold) queue.splice(i, 1);
      return c;
    },
  };
}

/** The autopilot's hands, `react` late: a person sees, then moves (the steering and shooting games). */
function delayed(game, p) {
  const buffer = [];
  const lag = Math.round(p.react / STEP);
  return () => {
    const c = game.autopilot(p.skill);
    buffer.push(c);
    return buffer.length > lag ? buffer.shift() : { ...NONE(), aim: c.aim };
  };
}

/** The autopilot's decisions, each pressed a little off (early or late): a turn a cell out, a hop into a car. */
function jittered(game, p) {
  const keys = presser();
  let clock = 0;
  return () => {
    clock += STEP;
    const c = game.autopilot(p.skill);
    for (const k of ['left', 'right', 'up', 'down']) if (c[k] && !keys.pending(k)) keys.at(clock + Math.max(0, p.react * 0.3 + gauss() * p.sigma * 1.2), k);
    return keys.controls(clock);
  };
}

/**
 * STEP BEAT: every arrow stepped on at its beat, off by `sigma` (a lapse skips it); the chart shows ahead. A held
 * arrow is kept down to its tail's end, let go a little off it (early by more than the slack, now and then, drops it).
 */
function dancer(game, p) {
  const keys = presser();
  const seen = new Set();
  return () => {
    for (const n of game.notes) {
      if (seen.has(n)) continue;
      seen.add(n);
      if (Math.random() < p.lapse) continue;
      const at = n.at + gauss() * p.sigma;
      const hold = n.until === undefined ? 0.05 : Math.max(0.05, n.until - at + Math.abs(gauss()) * p.sigma - (Math.random() < p.lapse * 2 ? 0.25 : 0));
      for (const lane of n.lanes) keys.at(at, lane, hold);
    }
    return keys.controls(game.songTime);
  };
}

/**
 * SKY STACK: aims at the middle of the first square pass it can react to, off by `sigma` (more up the tower). At the
 * minor prize it takes the prize or plays on as its nerve says (`takes`: a shaky hand banks it), stick then fire.
 */
function stacker(game, p, name) {
  const COLS = 7;
  // `Stacker.widthFor`: each tower after the first narrows sooner.
  const widthFor = (row, tower) => {
    const shift = Math.min(2, tower);
    return row < 4 - shift ? 3 : row < 10 - shift * 2 ? 2 : 1;
  };
  const takes = { novice: 0.6, ordinary: 0.4, good: 0.15 }[name] ?? 0.3;
  let choiceAt = null;
  const bits = (m) => {
    let n = 0;
    for (; m; m &= m - 1) n++;
    return n;
  };
  let plan = null;
  let clock = 0;
  return () => {
    clock += STEP;
    const out = NONE();
    if (game.choice) {
      choiceAt ??= { at: clock + p.react * 2 + Math.random() * 0.6, want: Math.random() < takes ? 0 : 1, pressed: 0 };
      if (clock < choiceAt.at) return out;
      // One press at a time, released between (the game reads the edges).
      if ((clock - choiceAt.at) % 0.2 > 0.05) return out;
      if (game.choice.pick !== choiceAt.want) out[choiceAt.want === 0 ? 'left' : 'right'] = true;
      else out.fire = out.firePressed = true;
      return out;
    }
    choiceAt = null;
    if (game.settle > 0 || !game.live) {
      plan = null;
      return out;
    }
    const turn = game.tower * 100 + game.row;
    if (!plan || plan.turn !== turn) {
      const w = widthFor(game.row, game.tower);
      const below = game.row === 0 ? (1 << COLS) - 1 : game.rows[game.row - 1];
      const square = (pos) => {
        let m = 0;
        for (let c = 0; c < w; c++) m |= 1 << (pos + c);
        return bits(m & below) >= Math.min(w, bits(below));
      };
      let pos = game.position;
      let dir = game.direction;
      let next = game.moveTimer;
      const cell = 1 / game.speed();
      let t = 0;
      let start = null;
      let aim = null;
      for (let k = 0; k < 400 && aim === null; k++) {
        const s = square(pos);
        if (s && start === null && t >= p.react * 0.8) start = t;
        if (!s && start !== null) aim = (start + t) / 2;
        t += next;
        next = cell;
        pos += dir;
        if (pos <= 0 || pos + w >= COLS) dir *= -1;
      }
      const at = clock + (aim ?? start ?? 0.2) + gauss() * p.sigma * (1 + game.row * 0.03);
      plan = { turn, at: Math.random() < p.lapse ? at + 0.12 : at, fired: false };
    }
    if (!plan.fired && clock >= plan.at) {
      plan.fired = true;
      out.fire = out.firePressed = true;
    }
    return out;
  };
}

/**
 * PADDLE WARS: works out where the ball meets the paddle (walls folded), off by more the faster and the more bounces,
 * aims an edge when good, and tries a smash (fire just before the ball lands) as often as it dares, timed off by `sigma`.
 */
function ponger(game, p, name) {
  const spread = { novice: 12, ordinary: 8, good: 5 }[name] ?? 6;
  const edge = { novice: 0, ordinary: 6, good: 11 }[name] ?? 8;
  const TOP = 24.5;
  const BOTTOM = 237.5;
  let lastSign = 0;
  let since = 0;
  let target = 131;
  const smashes = { novice: 0.15, ordinary: 0.45, good: 0.75 }[name] ?? 0.4;
  let smashAt = null;
  return () => {
    const b = game.ball;
    const out = NONE();
    const sign = Math.sign(b.vx);
    since += STEP;
    if (sign !== lastSign) {
      lastSign = sign;
      since = 0;
      target = 131;
      smashAt = null;
      if (sign < 0) {
        const span = BOTTOM - TOP;
        const t = (b.x - 21.5) / -b.vx;
        const m = (((b.y + b.vy * t - TOP) % (2 * span)) + 2 * span) % (2 * span);
        const y = m > span ? TOP + 2 * span - m : TOP + m;
        const speed = Math.hypot(b.vx, b.vy) / 170;
        const bounces = Math.abs(b.vy * t) / span;
        target = y + gauss() * spread * speed * (1 + 0.6 * bounces) + (Math.random() < 0.5 ? -1 : 1) * edge * (0.6 + 0.4 * Math.random());
      }
    }
    if (game.serveIn > 0 && game.server === 1 && since > p.react && Math.random() < 0.05) out.fire = out.firePressed = true;
    // The smash: a press just before the ball lands (the game's window is 0.2 s), tried as often as the player dares.
    if (sign < 0 && since >= STEP && since < 2 * STEP) {
      const arrive = (b.x - 21.5) / -b.vx;
      smashAt = Math.random() < smashes ? since + arrive - 0.1 + gauss() * p.sigma * 1.5 : null;
    }
    if (smashAt !== null && since >= smashAt && since < smashAt + 0.05) out.fire = out.firePressed = true;
    if (since < p.react) return out;
    const diff = target - game.p1;
    out.up = diff < -2;
    out.down = diff > 2;
    return out;
  };
}

/**
 * STAR RAID: the ship steered as the autopilot's eyes say, `react` late, but the trigger is the person's: a tap when
 * an alien looks lined up over the gun (judged off by `misjudge` pixels), and now and then a hopeful shot at nothing
 * (`spray` a second), which breaks the chain and the clean wave.
 */
function gunner(game, p, name) {
  const steer = delayed(game, p);
  const misjudge = { novice: 9, ordinary: 5, good: 2.5 }[name] ?? 4;
  const spray = { novice: 0.9, ordinary: 0.35, good: 0.1 }[name] ?? 0.3;
  let next = 0;
  let holdUntil = -1;
  let clock = 0;
  return () => {
    clock += STEP;
    const c = { ...steer(), fire: false, firePressed: false };
    if (clock >= next) {
      next = clock + 0.12 + Math.random() * 0.08;
      const off = gauss() * misjudge;
      const lined = game.aliens.some((a) => a.alive && Math.abs(game.alienPos(a).x + 8 - game.shipX + off) < 8) || (game.saucer && Math.abs(game.saucer.x + game.saucer.dir * 30 - game.shipX + off) < 8);
      if (lined ? Math.random() < 0.9 : Math.random() < spray * 0.15) holdUntil = clock + 0.05;
    }
    if (clock < holdUntil) c.fire = true;
    return c;
  };
}

/**
 * BRICK STORM: a person reads where the lowest falling ball comes down (walls folded) once it starts down, off by
 * `misread` pixels (more for a fast ball), and slides the paddle there `react` late; with no ball close it goes for a
 * capsule. No aiming at the bricks: that is the autopilot's own trick.
 */
function breaker(game, p, name) {
  const misread = { novice: 45, ordinary: 30, good: 14 }[name] ?? 12;
  const W = 320;
  const PADDLE_Y = 226;
  let read = null;
  let clock = 0;
  return () => {
    clock += STEP;
    const out = NONE();
    const falling = game.balls.filter((b) => b.vy > 0);
    const ball = falling.reduce((low, b) => (!low || b.y > low.y ? b : low), null);
    if (!ball) read = null;
    else if (!read || read.ball !== ball || read.vx !== Math.sign(ball.vx)) {
      const t = (PADDLE_Y - ball.y) / ball.vy;
      const span = W - 6;
      const m = (((ball.x - 3 + ball.vx * t) % (2 * span)) + 2 * span) % (2 * span);
      const x = 3 + (m > span ? 2 * span - m : m);
      const speed = Math.hypot(ball.vx, ball.vy) / 200;
      read = { ball, vx: Math.sign(ball.vx), x: x + gauss() * misread * speed, at: clock + p.react * (Math.random() < p.lapse * 3 ? 2 : 1) };
    }
    let target = null;
    if (read && clock >= read.at) target = read.x;
    else if (!ball || ball.y < PADDLE_Y - 110) {
      const capsule = game.capsules.reduce((low, c) => (!low || c.y > low.y ? c : low), null);
      if (capsule && capsule.y > PADDLE_Y - 80) target = capsule.x;
    }
    if (target === null) return out;
    const diff = target - game.paddleX;
    out.left = diff < -3;
    out.right = diff > 3;
    return out;
  };
}

const DRIVERS = { stepbeat: dancer, stacker, snake: jittered, frog: jittered, duel: ponger, invaders: gunner, breakout: breaker };

// --- The plays -------------------------------------------------------------------------------------

function cabinetPlay(id, name, seed) {
  const game = ARCADE_GAMES[id]({});
  game.reset({ best: 0, pointsPerTicket: pointsPerTicket(id), seed });
  const p = PROFILES[name];
  const drive = name === 'regular' ? () => game.autopilot(p.skill) : (DRIVERS[id] ?? delayed)(game, p, name);
  let t = 0;
  while (!game.over && t < 400) {
    game.update(STEP, drive());
    game.takeSounds();
    t += STEP;
  }
  return { score: game.score, seconds: t };
}

/** HOOP FEVER: looks at the hoop (a little above), holds for the power that drops it in, lets go off by `sigma`. */
function hoopPlay(name) {
  const p = PROFILES[name];
  const eye = new THREE.Vector3(0, 1.62, 1.3);
  const sim = new HoopSim();
  let hold = 0;
  let holdFor = 0;
  let wait = Math.max(0.2, p.react * 1.5);
  let look = null;
  let t = 0;
  for (; t < 60; t += STEP) {
    let fire = false;
    if (wait > 0) wait -= STEP;
    else if (holdFor > 0) {
      hold += STEP;
      fire = hold < holdFor;
      if (!fire) {
        holdFor = 0;
        wait = Math.max(0.2, p.react * 1.5);
      }
    } else if (sim.balls.some((b) => b.state === 'rest')) {
      holdFor = 0.44 * 0.6 + gauss() * p.sigma;
      hold = 0;
      look = new THREE.Vector3(sim.hoopX + gauss() * p.aim, 2.1 + gauss() * p.aim, -0.98).sub(eye).normalize();
      fire = true;
    }
    if (sim.play(STEP, { ...NONE(), fire, look }, true)) break;
  }
  return { score: sim.points, seconds: t };
}

/** ALLEY ROLL: lines up on the rings' middle, holds for the power that lands there, off by `sigma`. */
function alleyPlay(name) {
  const p = PROFILES[name];
  const sim = new AlleySim();
  sim.newGame(false);
  let plan = null;
  let t = 0;
  for (; t < 120; t += STEP) {
    const c = NONE();
    if (sim.phase === 'aim') {
      plan ??= { u: gauss() * p.aim * 0.4, hold: ((0.36 - 0.04) / 0.72) * 0.55 + gauss() * p.sigma, held: 0, wait: 0.5 + p.react };
      const diff = plan.u - sim.aimU;
      if (Math.abs(diff) > 0.01 && plan.held === 0) {
        c.left = diff < 0;
        c.right = diff > 0;
      } else if (plan.wait > 0) plan.wait -= STEP;
      else {
        plan.held += STEP;
        c.fire = plan.held < Math.max(0.02, plan.hold);
      }
    } else plan = null;
    if (sim.play(STEP, c)) break;
  }
  return { score: sim.points, seconds: t };
}

/** A copy of a pinball table mid-play (the sim is plain data plus its fixed step): what a player's eye works out ahead. */
function cloneTable(sim) {
  const copy = structuredClone(sim);
  Object.setPrototypeOf(copy, Object.getPrototypeOf(sim));
  Object.setPrototypeOf(copy.steps, Object.getPrototypeOf(sim.steps));
  return copy;
}

/** What a flip on `side` after `delay` seconds earns over the next moment and a half (a ball lost costs dearly). */
function flipWorth(sim, side, delay) {
  const table = cloneTable(sim);
  const start = table.score;
  const ball = table.ballNumber;
  for (let t = 0; t < 1.4; t += STEP) {
    const flip = t >= delay && t < delay + 0.18;
    table.update(STEP, { left: flip && side === 0, right: flip && side === 1, launch: false });
    table.takeEvents();
    if (table.ballNumber !== ball || table.over) return table.score - start - 30000;
  }
  return table.score - start;
}

/**
 * The pinball, played by a person: as the ball comes down onto a flipper they flip (or miss it: `react`), aiming the
 * shot (the moment along the flipper that sends it up the ramp or into the targets, worked out ahead) as often as
 * `aim` says, else a hurried flip; either way off by `sigma` (s), and timing is everything on a flipper. A regular plays
 * the machine's own autopilot. The plunger is pulled a different way each ball.
 */
const PINBALL_HANDS = {
  novice: { aim: 0.2, sigma: 0.04, react: 0.72 },
  ordinary: { aim: 0.6, sigma: 0.015, react: 0.88 },
  good: { aim: 0.85, sigma: 0.008, react: 0.95 },
};
function pinballPlay(name) {
  const hands = PINBALL_HANDS[name];
  const sim = new PinballSim();
  sim.reset();
  let pull = 0;
  let pullFor = 0.3 + Math.random() * 0.5;
  let plan = null;
  let seen = false;
  let t = 0;
  for (; t < 600 && !sim.over; t += STEP) {
    let launching = false;
    if (sim.waitingToLaunch) {
      pull += STEP;
      launching = pull < pullFor;
    } else if (pull > 0) {
      pull = 0;
      pullFor = 0.3 + Math.random() * 0.5;
    }
    const auto = sim.autopilot(0.9, launching, STEP);
    let input = auto;
    if (hands) {
      let ball = sim.ball;
      for (const b of sim.balls) if (b.ramp === null && b.y > ball.y) ball = b;
      const near = ball.ramp === null && ball.y > sim.length - 0.45 && ball.y < sim.length - 0.2 && ball.vy > -0.3;
      if (!near) seen = false;
      if (near && !seen && !plan) {
        seen = true;
        if (Math.random() < hands.react) {
          const side = ball.x < 0.45 ? 0 : 1;
          let delay = 0.04 + Math.random() * 0.1;
          if (Math.random() < hands.aim) {
            let best = -Infinity;
            for (let d = 0; d <= 0.2; d += 0.02) {
              const worth = flipWorth(sim, side, d);
              if (worth > best) [best, delay] = [worth, d];
            }
          }
          plan = { side, at: t + Math.max(0, delay + gauss() * hands.sigma) };
        }
      }
      const flip = plan !== null && t >= plan.at;
      input = { left: flip && plan.side === 0, right: flip && plan.side === 1, launch: auto.launch };
      if (plan && t >= plan.at + 0.18) plan = null;
    }
    sim.update(STEP, input);
    sim.takeEvents();
  }
  return { score: sim.score, seconds: t };
}

// --- The table -------------------------------------------------------------------------------------

const machines = [
  ...Object.keys(ARCADE_GAMES).filter((id) => ARCADE_GAMES[id]({}).demoable !== false).map((id) => ({ id, play: (name, r) => cabinetPlay(id, name, r * 7919 + 101) })),
  { id: 'hoops', play: (name) => hoopPlay(name) },
  { id: 'alley', play: (name) => alleyPlay(name) },
  { id: 'pinball', play: (name) => pinballPlay(name), runs: Math.max(10, Math.round(RUNS / 3)) },
].filter((m) => !ONLY || ONLY.includes(m.id));

/** Average tickets a play on `id` pays at `rate`, the floor and the machine's taper counted (a score under `TICKET_FLOOR` pays it). */
const paidAt = (id, scores, rate) => scores.reduce((s, x) => s + Math.max(TICKET_FLOOR, ticketsAt(id, x, rate)), 0) / scores.length;
/** The rate (points per ticket) at which these plays on `id` net `NET` tickets a minute, the floor counted. */
function rateFor(id, s) {
  const want = (NET * (s.seconds + OVERHEAD)) / 60 + 10;
  let lo = 0.01;
  let hi = 1e6;
  for (let i = 0; i < 80; i++) {
    const mid = Math.sqrt(lo * hi);
    if (paidAt(id, s.scores, mid) > want) lo = mid;
    else hi = mid;
  }
  return Math.round(lo);
}

const rows = [];
for (const machine of machines) {
  const rate = pointsPerTicket(machine.id);
  const runs = machine.runs ?? RUNS;
  const stats = {};
  for (const name of Object.keys(PROFILES)) {
    const plays = Array.from({ length: runs }, (_, r) => machine.play(name, r));
    const scores = plays.map((x) => x.score).sort((a, b) => a - b);
    const seconds = plays.reduce((s, x) => s + x.seconds, 0) / runs;
    const avg = scores.reduce((s, x) => s + x, 0) / runs;
    const under = scores.filter((x) => ticketsAt(machine.id, x, rate) < TICKET_FLOOR).length / runs;
    stats[name] = { avg, seconds, scores, tickets: paidAt(machine.id, scores, rate), under, median: scores[runs >> 1], p90: scores[Math.floor(runs * 0.9)], p95: scores[Math.floor(runs * 0.95)] };
  }
  const o = stats.ordinary;
  const cell = (s) => {
    const tickets = Math.round(s.tickets);
    return `${Math.round(s.avg)} pts ${s.seconds.toFixed(0)}s ${tickets}t ${Math.round(((s.tickets - 10) / (s.seconds + OVERHEAD)) * 60)}/min ${Math.round(s.under * 100)}%<floor`;
  };
  rows.push({
    machine: machine.id,
    rate,
    novice: cell(stats.novice),
    ordinary: cell(o),
    good: cell(stats.good),
    regular: cell(stats.regular),
    'rate for net': rateFor(machine.id, o),
    'table 5th..1st': rivalTable(machine.id).map((e) => e.score).reverse().join(' '),
    'ord. med / ord. p90 / good med / good p90 / good p95': `${o.median} / ${o.p90} / ${stats.good.median} / ${stats.good.p90} / ${stats.good.p95}`,
  });
}
console.log(`Average per play: points, seconds, tickets at today's rate (the floor counted), net tickets a minute (the coin paid, ${OVERHEAD} s between plays), plays whose score paid under the floor. ${RUNS} plays a profile; 'rate for net' nets ${NET} a minute for the ordinary player.`);
console.table(rows);
process.exit(0);
