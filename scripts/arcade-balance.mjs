// The arcade's balance table: every cabinet game, the alley, the hoops and the pinball played headless by simulated
// people (a novice, an ordinary player, a good one) and by a regular's autopilot, at the machines' own fixed step. For
// each: what a play scores and lasts, the tickets it pays at today's `PAYOUT`, what the player nets a minute once the
// coin is paid, and the rate that would net `--net` tickets a minute for the ordinary player (the one `PAYOUT` is set
// on). The people are models, not measurements: reaction times, timing spread and slips from casual keyboard play, so
// read the table to compare machines and profiles, then check real plays with `?payout`.
//
//   npm run balance                     every machine, 60 plays per profile
//   npm run balance -- --game snake,frog --runs 200 --net 50
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
const NET = Number(arg('net', 50));
const ONLY = arg('game', null)?.split(',') ?? null;
/** Seconds a play costs beyond its own: the coin, the walk of the end card's tickets, the next coin. */
const OVERHEAD = 5;
const STEP = 1 / 120;

// --- The game code, bundled for Node ---------------------------------------------------------------

const out = path.join(os.tmpdir(), `bibliothek-balance-${process.pid}.mjs`);
await build({
  stdin: {
    contents: `
      export { ARCADE_GAMES } from '@/world/arcade/games';
      export { pointsPerTicket } from '@/economy/pricing';
      export { rivalTable } from '@/economy/rivals';
      export { HoopSim } from '@/world/arcade/hoop/HoopSim';
      export { AlleySim } from '@/world/arcade/alley/AlleySim';
      export { PinballSim } from '@/world/arcade/pinball/PinballSim';
      export * as THREE from 'three';`,
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
const { ARCADE_GAMES, pointsPerTicket, rivalTable, HoopSim, AlleySim, PinballSim, THREE } = await import(pathToFileURL(out).href);
fs.rmSync(out, { force: true });

// --- The people ------------------------------------------------------------------------------------

/**
 * `skill` feeds the game's own autopilot (what it reads of the board), `react` is how late the hands follow the eyes
 * (s), `sigma` the spread of a timed press (s), `lapse` the odds of missing a beat altogether; the physical machines
 * add `aim` (m of spread at the hoop, the alley's lane).
 */
const PROFILES = {
  novice: { skill: 0.3, react: 0.3, sigma: 0.075, lapse: 0.08, aim: 0.12, flip: 0.12 },
  ordinary: { skill: 0.55, react: 0.23, sigma: 0.05, lapse: 0.04, aim: 0.07, flip: 0.08 },
  good: { skill: 0.8, react: 0.18, sigma: 0.035, lapse: 0.02, aim: 0.04, flip: 0.05 },
  regular: { skill: 0.9, react: 0, sigma: 0, lapse: 0, aim: 0.02, flip: 0 },
};

const NONE = () => ({ left: false, right: false, up: false, down: false, fire: false, firePressed: false });
const gauss = () => {
  let u = 0;
  let v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

/** Presses scheduled at chosen times, each held 50 ms. */
function presser() {
  const queue = [];
  return {
    at(t, key) {
      queue.push({ t, key });
    },
    pending: (key) => queue.some((e) => e.key === key),
    controls(now) {
      const c = NONE();
      for (const e of queue) {
        if (now < e.t || now >= e.t + 0.05) continue;
        c[e.key] = true;
        if (e.key === 'fire' && now < e.t + STEP) c.firePressed = true;
      }
      for (let i = queue.length - 1; i >= 0; i--) if (now >= queue[i].t + 0.05) queue.splice(i, 1);
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

/** STEP BEAT: every arrow stepped on at its beat, off by `sigma` (a lapse skips it); the chart shows ahead. */
function dancer(game, p) {
  const keys = presser();
  const seen = new Set();
  return () => {
    for (const n of game.notes) {
      if (seen.has(n)) continue;
      seen.add(n);
      if (Math.random() < p.lapse) continue;
      for (const lane of n.lanes) keys.at(n.at + gauss() * p.sigma, lane);
    }
    return keys.controls(game.songTime);
  };
}

/** SKY STACK: aims at the middle of the first square pass it can react to, off by `sigma` (more up the tower). */
function stacker(game, p) {
  const COLS = 7;
  const widthFor = (row) => (row < 4 ? 3 : row < 10 ? 2 : 1);
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
    if (game.settle > 0 || !game.live) {
      plan = null;
      return out;
    }
    const turn = game.tower * 100 + game.row;
    if (!plan || plan.turn !== turn) {
      const w = widthFor(game.row);
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

/** PADDLE WARS: works out where the ball meets the paddle (walls folded), off by more the faster and the more bounces, aims an edge when good. */
function ponger(game, p, name) {
  const spread = { novice: 12, ordinary: 8, good: 5 }[name] ?? 6;
  const edge = { novice: 0, ordinary: 6, good: 11 }[name] ?? 8;
  const TOP = 24.5;
  const BOTTOM = 237.5;
  let lastSign = 0;
  let since = 0;
  let target = 131;
  return () => {
    const b = game.ball;
    const out = NONE();
    const sign = Math.sign(b.vx);
    since += STEP;
    if (sign !== lastSign) {
      lastSign = sign;
      since = 0;
      target = 131;
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
    if (since < p.react) return out;
    const diff = target - game.p1;
    out.up = diff < -2;
    out.down = diff > 2;
    return out;
  };
}

const DRIVERS = { stepbeat: dancer, stacker, snake: jittered, frog: jittered, duel: ponger };

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
    if (sim.play(STEP, { ...NONE(), fire }, true, () => look.clone())) break;
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

/** The pinball: the machine's own flipper timing, `flip` seconds late, and a plunger pulled a different way each ball. */
function pinballPlay(name) {
  const p = PROFILES[name];
  const sim = new PinballSim();
  sim.reset();
  const buffer = [];
  const lag = Math.round(p.flip * 60);
  let pull = 0;
  let pullFor = 0.3 + Math.random() * 0.5;
  let t = 0;
  for (; t < 600 && !sim.over; t += 1 / 60) {
    let launching = false;
    if (sim.waitingToLaunch) {
      pull += 1 / 60;
      launching = pull < pullFor;
    } else if (pull > 0) {
      pull = 0;
      pullFor = 0.3 + Math.random() * 0.5;
    }
    const c = sim.autopilot(Math.min(0.9, p.skill), launching);
    buffer.push(c);
    const hands = buffer.length > lag ? buffer.shift() : c;
    sim.update(1 / 60, { left: hands.left, right: hands.right, launch: c.launch });
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
    stats[name] = { avg, seconds, median: scores[runs >> 1], p90: scores[Math.floor(runs * 0.9)] };
  }
  const o = stats.ordinary;
  const cell = (s) => {
    const tickets = Math.floor(s.avg / rate);
    return `${Math.round(s.avg)} pts ${s.seconds.toFixed(0)}s ${tickets}t ${Math.round(((tickets - 10) / (s.seconds + OVERHEAD)) * 60)}/min`;
  };
  rows.push({
    machine: machine.id,
    rate,
    novice: cell(stats.novice),
    ordinary: cell(o),
    good: cell(stats.good),
    regular: cell(stats.regular),
    'rate for net': Math.round(o.avg / ((NET * (o.seconds + OVERHEAD)) / 60 + 10)),
    'table 5th..1st': rivalTable(machine.id).map((e) => e.score).reverse().join(' '),
    'ord. med / good med / good p90': `${o.median} / ${stats.good.median} / ${stats.good.p90}`,
  });
}
console.log(`Average per play: points, seconds, tickets at today's rate, net tickets a minute (the coin paid, ${OVERHEAD} s between plays). ${RUNS} plays a profile.`);
console.table(rows);
process.exit(0);
