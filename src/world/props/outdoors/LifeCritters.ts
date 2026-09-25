import * as THREE from 'three';
import { type Rng, azimuthOf, azimuthX, heightY } from './Sheet';
import { between, pick } from './paint';
import { LAMP_LINE, NEAR_KERB, PARK_EDGE } from './plan';
import { currentSeason } from './season';
import { type AtlasPens, type Cell, type LifeEnv, type LifeLayer, type Push, acrossSign, glowDot, hoursRamp, pushStanding } from './sprites';

/** Lamp heads the bats hunt round (the posts of `paintStreet`: far pavements and ours), metres; the lanterns are 7 m up. */
const BAT_LAMPS: [number, number][] = [
  [10, LAMP_LINE],
  [34, LAMP_LINE],
  [-LAMP_LINE, -10],
  [10, NEAR_KERB - 0.6],
  [34, NEAR_KERB - 0.6],
  [-(NEAR_KERB - 0.6), -10],
];
const LAMP_HEAD = 7;
/** Bats: how many, wingspan (m), the atlas scale, how far they stray from their lamp and how fast they fly. */
const BATS = 8;
const BAT = { span: 0.3, scale: 70, roam: 3.5, speed: [3.5, 7] as const, jerk: 38 };
/** The fox: size (with its brush), the atlas scale, trotting speed, and the ways it slinks across. */
const FOX = { length: 1.05, height: 0.5, scale: 44, speed: 1.9 };
const FOX_ROUTES: [number, number][][] = [
  [[-31, -22], [-44, -12], [-58, 4], [-78, 26]],
  [[-29, -44], [-18, -38], [-9, -31], [-2.6, -26], [-2.6, -12]],
  [[-80, -8], [-62, -14], [-44, -6], [-30, 2], [-28, 16]],
];
/** Cats on the hedge along the park (its top is 1.4 m up, `PARK_EDGE` out): the atlas scale, sizes and coats. */
const CAT = { scale: 64, length: 0.52, height: 0.3, sit: 0.32, hedge: 1.4 };
const CAT_COATS = ['#1c1a1a', '#c8742e'];
/** Stretch of hedge the walking cat patrols (clear of the gates, z metres). */
const CAT_WALK: [number, number] = [-6, 26];

/** One bat: where it is, how it moves, the lamp it hunts round and its wingbeat. */
interface Bat {
  lamp: [number, number];
  p: THREE.Vector3;
  v: THREE.Vector3;
  jerk: THREE.Vector3;
  jerkClock: number;
  phase: number;
}

/**
 * The night's animals: bats flitting erratically round the street lamps from dusk until the small
 * hours (not in the rain, not in winter), a fox slinking across the park or down our pavement
 * when the city is asleep, and a couple of cats on the park hedge in the evening, one sitting with
 * its tail twitching, one padding along the top.
 */
export class Critters implements LifeLayer {
  private readonly batCells: Cell[] = [];
  /** Per facing (+azimuth, -azimuth): two trotting poses. */
  private readonly foxCells: Cell[][] = [];
  /** Per coat, per facing: walking poses 0-1, sitting poses 2-3. */
  private readonly catCells: Cell[][][] = [];
  private readonly bats: Bat[] = [];
  /** Scratch: a bat's pull back towards its lantern. */
  private readonly pull = new THREE.Vector3();
  private fox: { route: [number, number][]; s: number; pause: number; clock: number } | null = null;
  private foxTimer = 20;
  private readonly walkingCat = { z: 8, dir: 1 as 1 | -1, sitting: 0, clock: 0 };
  private clock = 0;

  constructor(private readonly random: Rng) {
    for (let i = 0; i < BATS; i++) {
      const lamp = BAT_LAMPS[i % BAT_LAMPS.length];
      this.bats.push({
        lamp,
        p: new THREE.Vector3(lamp[0] + between(random, -2, 2), LAMP_HEAD + between(random, -1, 1), lamp[1] + between(random, -2, 2)),
        v: new THREE.Vector3(between(random, -3, 3), 0, between(random, -3, 3)),
        jerk: new THREE.Vector3(),
        jerkClock: 0,
        phase: random() * Math.PI * 2,
      });
    }
  }

  paint({ place, color, glow }: AtlasPens): void {
    for (const pose of [0, 1]) {
      const cell = place(Math.ceil(BAT.span * BAT.scale) + 4, Math.ceil(BAT.span * 0.6 * BAT.scale) + 4);
      paintBat(color, cell, pose);
      this.batCells.push(cell);
    }
    for (const facing of [1, -1]) {
      this.foxCells.push(
        [0, 1].map((pose) => {
          const cell = place(Math.ceil((FOX.length + 0.1) * FOX.scale), Math.ceil((FOX.height + 0.1) * FOX.scale));
          paintFox(color, glow, cell, facing, pose);
          return cell;
        }),
      );
    }
    for (const coat of CAT_COATS) {
      this.catCells.push(
        [1, -1].map((facing) =>
          [0, 1, 2, 3].map((pose) => {
            const cell = place(Math.ceil((CAT.length + 0.1) * CAT.scale), Math.ceil((CAT.sit + 0.12) * CAT.scale));
            paintCat(color, cell, coat, facing, pose);
            return cell;
          }),
        ),
      );
    }
  }

  update(dt: number, env: LifeEnv, push: Push): void {
    this.clock += dt;
    const dry = 1 - THREE.MathUtils.smoothstep(env.wet, 0.15, 0.35);
    // Bats: out once it is properly dark, home before dawn; the cold months they sleep through.
    const batHours = hoursRamp(env.hours, 19.5, 3, 0.6);
    const bats = batHours * THREE.MathUtils.smoothstep(env.nightness, 0.45, 0.8) * dry * (currentSeason().name === 'winter' ? 0 : 1);
    this.pushBats(dt, bats, push);

    // The fox: only once the city sleeps.
    this.foxTimer -= dt;
    if (!this.fox && this.foxTimer <= 0) {
      this.foxTimer = between(this.random, 50, 110);
      if (env.wakefulness < 0.22 && env.rain < 0.5) this.fox = { route: pick(this.random, FOX_ROUTES), s: 0, pause: 0, clock: 0 };
    }
    if (this.fox) this.pushFox(dt, push);

    // The cats: evenings, in the dry.
    const cats = hoursRamp(env.hours, 17.5, 23.5, 0.4) * dry;
    this.pushCats(dt, cats, push);
  }

  private pushBats(dt: number, visible: number, push: Push): void {
    if (visible <= 0.01) return;
    const pull = this.pull;
    for (const bat of this.bats) {
      // Erratic: a new sharp swerve every fraction of a second, a spring back towards the lantern.
      bat.jerkClock -= dt;
      if (bat.jerkClock <= 0) {
        bat.jerkClock = between(this.random, 0.12, 0.35);
        bat.jerk.set(between(this.random, -1, 1), between(this.random, -0.5, 0.5), between(this.random, -1, 1)).normalize().multiplyScalar(BAT.jerk);
      }
      pull.set(bat.lamp[0] - bat.p.x, LAMP_HEAD + 0.8 - bat.p.y, bat.lamp[1] - bat.p.z).multiplyScalar(BAT.jerk / BAT.roam).add(bat.jerk);
      bat.v.addScaledVector(pull, dt);
      const speed = bat.v.length();
      if (speed > BAT.speed[1]) bat.v.multiplyScalar(BAT.speed[1] / speed);
      else if (speed < BAT.speed[0]) bat.v.multiplyScalar(BAT.speed[0] / Math.max(speed, 1e-3));
      bat.p.addScaledVector(bat.v, dt);
      bat.p.y = THREE.MathUtils.clamp(bat.p.y, 3.5, 11);
      const d = Math.hypot(bat.p.x, bat.p.z);
      const a = azimuthOf(bat.p.x, bat.p.z);
      const cell = this.batCells[Math.sin(this.clock * 22 + bat.phase) > 0 ? 0 : 1];
      const half = cell.w / BAT.scale / 2 / d;
      const tall = cell.h / BAT.scale / 2;
      push([azimuthX(a - half), heightY(bat.p.y + tall, d), azimuthX(a + half), heightY(bat.p.y - tall, d)], cell, d, visible);
    }
  }

  private pushFox(dt: number, push: Push): void {
    const fox = this.fox;
    if (!fox) return;
    fox.clock += dt;
    // Now and then it stops dead, listening, then trots on.
    if (fox.pause > 0) fox.pause -= dt;
    else {
      fox.s += FOX.speed * dt;
      if (this.random() < dt * 0.12) fox.pause = between(this.random, 0.8, 2.2);
    }
    let rest = fox.s;
    for (let i = 1; i < fox.route.length; i++) {
      const [x0, z0] = fox.route[i - 1];
      const [x1, z1] = fox.route[i];
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (rest > len && i < fox.route.length - 1) {
        rest -= len;
        continue;
      }
      if (rest > len) {
        this.fox = null;
        return;
      }
      const t = rest / len;
      const x = x0 + (x1 - x0) * t;
      const z = z0 + (z1 - z0) * t;
      const total = fox.route.reduce((sum, p, k) => (k ? sum + Math.hypot(p[0] - fox.route[k - 1][0], p[1] - fox.route[k - 1][1]) : 0), 0);
      const alpha = Math.min(1, fox.s / 3, (total - fox.s) / 3);
      const facing = acrossSign(x, z, x1 - x0, z1 - z0) > 0 ? 0 : 1;
      const pose = fox.pause > 0 ? 0 : Math.floor(fox.clock / 0.18) % 2;
      pushStanding(push, this.foxCells[facing][pose], FOX.scale, 2, x, z, alpha);
      return;
    }
  }

  private pushCats(dt: number, visible: number, push: Push): void {
    if (visible <= 0.01) return;
    const x = -PARK_EDGE - 0.15;
    const sitAt = -3.5;
    // The sitting one: tail swishing now and then.
    const swish = Math.sin(this.clock * 1.3) > 0.6 ? 3 : 2;
    const d0 = Math.hypot(x, sitAt);
    pushStanding(push, this.catCells[0][1][swish], CAT.scale, 2, x, sitAt, visible, CAT.hedge, d0 - 1.2);
    // The walker: pads along the top, sits a while, turns back at the ends.
    const cat = this.walkingCat;
    cat.clock += dt;
    if (cat.sitting > 0) cat.sitting -= dt;
    else {
      cat.z += cat.dir * 0.45 * dt;
      if (cat.z > CAT_WALK[1] || cat.z < CAT_WALK[0]) cat.dir = -cat.dir as 1 | -1;
      if (Math.abs(cat.z - sitAt) < 1.5 && cat.dir === Math.sign(sitAt - cat.z)) cat.dir = -cat.dir as 1 | -1;
      if (this.random() < dt * 0.05) cat.sitting = between(this.random, 6, 18);
    }
    const facing = acrossSign(x, cat.z, 0, cat.dir) > 0 ? 0 : 1;
    const pose = cat.sitting > 0 ? 2 : Math.floor(cat.clock / 0.3) % 2;
    pushStanding(push, this.catCells[1][facing][pose], CAT.scale, 2, x, cat.z, visible, CAT.hedge, Math.hypot(x, cat.z) - 1.2);
  }
}

/** A bat seen from above: a small dark body, angular wings up (`pose` 0) or swept down. */
function paintBat(ctx: CanvasRenderingContext2D, cell: Cell, pose: number): void {
  const s = BAT.scale;
  const cx = cell.x + cell.w / 2;
  const cy = cell.y + cell.h / 2;
  const half = (BAT.span / 2) * s;
  const lift = (pose === 0 ? -0.07 : 0.05) * s;
  ctx.fillStyle = '#17141a';
  ctx.beginPath();
  ctx.moveTo(cx, cy - 0.03 * s);
  // Each wing: a leading edge out to the tip, then the scalloped trailing edge back in.
  for (const side of [1, -1]) {
    ctx.lineTo(cx + side * half * 0.45, cy + lift - 0.02 * s);
    ctx.lineTo(cx + side * half, cy + lift + 0.01 * s);
    ctx.lineTo(cx + side * half * 0.75, cy + lift * 0.4 + 0.04 * s);
    ctx.lineTo(cx + side * half * 0.5, cy + lift * 0.2 + 0.03 * s);
    ctx.lineTo(cx + side * half * 0.25, cy + 0.05 * s);
    ctx.lineTo(cx, cy + 0.04 * s);
  }
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx, cy + 0.01 * s, 0.025 * s, 0.045 * s, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** A fox trotting, seen side on, facing +x (`facing` 1) or -x: russet back, pale belly, dark legs, white-tipped brush; its eyes catch the lamplight. */
function paintFox(ctx: CanvasRenderingContext2D, glow: CanvasRenderingContext2D, cell: Cell, facing: number, pose: number): void {
  const s = FOX.scale;
  const cx = cell.x + cell.w / 2 - 0.08 * s * facing;
  const foot = cell.y + cell.h - 2;
  const X = (u: number): number => cx + u * s * facing;
  const spread = pose ? 0.07 : 0.01;
  ctx.fillStyle = '#2a1a12';
  for (const u of [-0.2 - spread, -0.2 + spread, 0.17 - spread, 0.17 + spread]) ctx.fillRect(X(u) - 0.02 * s, foot - 0.26 * s, 0.04 * s, 0.26 * s);
  ctx.fillStyle = '#b8561e';
  ctx.beginPath();
  ctx.ellipse(cx, foot - 0.31 * s, 0.27 * s, 0.09 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  // The brush, low and straight out behind, its white tip.
  ctx.beginPath();
  ctx.ellipse(X(-0.43), foot - 0.27 * s, 0.17 * s, 0.055 * s, -0.15 * facing, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#efe6d8';
  ctx.beginPath();
  ctx.arc(X(-0.58), foot - 0.25 * s, 0.035 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(Math.min(X(-0.1), X(0.15)), foot - 0.26 * s, 0.25 * s, 0.04 * s);
  // Head: a wedge forward, ears pricked.
  ctx.fillStyle = '#c0601f';
  ctx.beginPath();
  ctx.moveTo(X(0.22), foot - 0.44 * s);
  ctx.lineTo(X(0.42), foot - 0.37 * s);
  ctx.lineTo(X(0.22), foot - 0.31 * s);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(X(0.23), foot - 0.43 * s);
  ctx.lineTo(X(0.25), foot - 0.53 * s);
  ctx.lineTo(X(0.3), foot - 0.42 * s);
  ctx.closePath();
  ctx.fill();
  glowDot(glow, X(0.33), foot - 0.4 * s, Math.max(1.5, 0.04 * s), '200,255,160', 0.7);
}

/** A cat side on, facing +x (`facing` 1) or -x: walking (poses 0, 1: legs together, apart) or sitting (2, 3: tail down, tail flicked up). */
function paintCat(ctx: CanvasRenderingContext2D, cell: Cell, coat: string, facing: number, pose: number): void {
  const s = CAT.scale;
  const cx = cell.x + cell.w / 2;
  const foot = cell.y + cell.h - 2;
  const X = (u: number): number => cx + u * s * facing;
  ctx.fillStyle = coat;
  ctx.strokeStyle = coat;
  ctx.lineCap = 'round';
  ctx.lineWidth = 0.035 * s;
  if (pose < 2) {
    const spread = pose ? 0.05 : 0;
    for (const u of [-0.14 - spread, -0.14 + spread, 0.13 - spread, 0.13 + spread]) ctx.fillRect(X(u) - 0.015 * s, foot - 0.16 * s, 0.03 * s, 0.16 * s);
    ctx.beginPath();
    ctx.ellipse(cx, foot - 0.19 * s, 0.18 * s, 0.06 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(X(0.2), foot - 0.25 * s, 0.05 * s, 0, Math.PI * 2);
    ctx.fill();
    // Ears, and the tail held up in a question mark.
    ctx.beginPath();
    ctx.moveTo(X(0.17), foot - 0.28 * s);
    ctx.lineTo(X(0.19), foot - 0.33 * s);
    ctx.lineTo(X(0.22), foot - 0.29 * s);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(X(-0.17), foot - 0.2 * s);
    ctx.quadraticCurveTo(X(-0.26), foot - 0.3 * s, X(-0.22), foot - 0.38 * s);
    ctx.stroke();
    return;
  }
  // Sitting: haunches, upright chest, head, the tail curled round or flicked.
  ctx.beginPath();
  ctx.ellipse(X(-0.02), foot - 0.08 * s, 0.1 * s, 0.08 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(X(0.04), foot - 0.16 * s, 0.06 * s, 0.1 * s, 0.2 * facing, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(X(0.06), foot - 0.27 * s, 0.05 * s, 0, Math.PI * 2);
  ctx.fill();
  for (const u of [0.03, 0.09]) {
    ctx.beginPath();
    ctx.moveTo(X(u - 0.02), foot - 0.3 * s);
    ctx.lineTo(X(u), foot - 0.35 * s);
    ctx.lineTo(X(u + 0.02), foot - 0.3 * s);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(X(-0.1), foot - 0.03 * s);
  if (pose === 2) ctx.quadraticCurveTo(X(-0.2), foot, X(-0.17), foot - 0.01 * s);
  else ctx.quadraticCurveTo(X(-0.22), foot - 0.1 * s, X(-0.2), foot - 0.2 * s);
  ctx.stroke();
}
