import { clamp } from '@/math/scalar';
import { type ArcadeControls, NO_CONTROLS, SCREEN_H, SCREEN_W, drawText } from './ArcadeGame';
import { BaseGame, PLAY_TOP } from './BaseGame';
import { random } from '@/random';
import { Sprite } from './sprite';
import { arcadeHint } from '../arcadeHint';

/* The heads popping up (hat or bonnet, face, bandana or collar; the body is the coat's rectangle under it) and the gun sight's ring. */
const BANDIT = new Sprite([['........xxxxxxxx........', '.......xxxxxxxxxx.......', '.......xxxxxxxxxx.......', '.......xxxxxxxxxx.......', '.......bbbbbbbbbb.......', '.......bbbbbbbbbb.......', '.......xxxxxxxxxx.......', 'xxxxxxxxxxxxxxxxxxxxxxxx', 'xxxxxxxxxxxxxxxxxxxxxxxx', '.xxxxxxxxxxxxxxxxxxxxxx.', '......ssssssssssss......', '......sseesssseess......', '......sseesssseess......', '......ssssssssssss......', '......ssssssssssss......', '......rrrrrrrrrrrr......', '......rrrrrrrrrrrr......', '......rrrrrrrrrrrr......', '.......rrrrrrrrrr.......', '........rrrrrrrr........']]);
const TOWNSFOLK = new Sprite([['......xxxxxxxxxxxx......', '....xxxxxxxxxxxxxxxx....', '...xxxxxxxxxxxxxxxxxx...', '...xx.ssssssssssss.xx...', '...xx.ssssssssssss.xx...', '......sseesssseess......', '......ssssssssssss......', '......ssssssssssss......', '......sssslllllsss......', '......ssssssssssss......', '.......ssssssssss.......', '........ssssssss........', '.......cccccccccc.......', '......cccccccccccc......', '......cccccccccccc......']]);
const SIGHT = new Sprite([['.....xxxxx.....', '...xx.....xx...', '..x.........x..', '.x...........x.', '.x...........x.', 'x.............x', 'x.............x', 'x.............x', 'x.............x', 'x.............x', '.x...........x.', '.x...........x.', '..x.........x..', '...xx.....xx...', '.....xxxxx.....']]);

const ROUND_SECONDS = 15;
const MAGAZINE = 6;
/** Below this line (the strip with the magazine, under the crates) the gun is out of the play: it reloads, as off the glass. */
const RELOAD_LINE = 214;
/** Where targets pop up: the saloon's windows, its doors, the barrels and the crates in front. */
const SPOTS: { x: number; y: number; w: number; h: number }[] = [
  { x: 52, y: 64, w: 34, h: 30 },
  { x: 143, y: 64, w: 34, h: 30 },
  { x: 234, y: 64, w: 34, h: 30 },
  { x: 86, y: 128, w: 36, h: 52 },
  { x: 198, y: 128, w: 36, h: 52 },
  { x: 24, y: 190, w: 34, h: 30 },
  { x: 143, y: 196, w: 34, h: 26 },
  { x: 262, y: 190, w: 34, h: 30 },
];
type Kind = 'bandit' | 'quick' | 'townsfolk' | 'bottle' | 'badge';
const POINTS: Record<Kind, number> = { bandit: 50, quick: 80, townsfolk: 0, bottle: 30, badge: 0 };
/** A bandit left standing this long fires back (seconds, at the first stage; shorter later). */
const DRAW_TIME = 1.8;
const HIT_SECONDS = 1;
const TOWNSFOLK_SECONDS = 2;
const BADGE_SECONDS = 3;
/** Bandits per stage; a stage pays seconds and speeds the town up. */
const BANDITS_PER_STAGE = 8;
/** What a stage pays, less by `STAGE_FADE` a stage after the first (never under `STAGE_MIN`): the town wins in the end. */
const STAGE_SECONDS = 2;
const STAGE_FADE = 0.25;
const STAGE_MIN = 0.5;

interface Target {
  spot: number;
  kind: Kind;
  /** Seconds since it popped up, and how long it stays. */
  age: number;
  life: number;
  /** Set when shot: it falls away for a moment. */
  down: number;
}

/**
 * NEON SHERIFF: the light-gun cabinet. Bandits pop up in the saloon's windows and doors and behind
 * the barrels; shoot them before they draw (a slow one pays 50, a quick one 80, chaining the
 * combo), or they fire back and a second goes. Townsfolk wander into the line of fire too:
 * shooting one costs two seconds and the combo. Bottles pay a little, the sheriff's star three
 * seconds. Six shots, then point out of the play (off the glass, or down at the magazine's strip) to
 * reload, no trigger needed. Every eight bandits is a stage: seconds
 * (two, a quarter less each stage after), faster draws, more of them at once. The gun aims where the player looks (the cabinet
 * fills `controls.aim`); Space or a click on the glass is the trigger.
 */
export class NeonSheriff extends BaseGame {
  readonly id = 'sheriff';
  readonly title = 'NEON SHERIFF';
  get hint(): string {
    return arcadeHint('Look to aim · click or {fire} to shoot · look down off the saloon to reload');
  }
  readonly summary = '15 SEC · SHOOT THE BANDITS · SPARE THE TOWN';
  readonly gun = true;

  private targets: Target[] = [];
  private spawnIn = 0;
  private ammo = MAGAZINE;
  private bandits = 0;
  private aim: { x: number; y: number } | null = null;
  private muzzle = 0;
  private hitFlash = 0;
  private reloadNag = 0;
  /** Where a regular's gun is pointing (its hand moves, it does not jump). */
  private pilotAim = { x: SCREEN_W / 2, y: SCREEN_H / 2 };

  constructor() {
    super(ROUND_SECONDS);
  }

  protected begin(): void {
    this.targets = [];
    this.spawnIn = 0.3;
    this.ammo = MAGAZINE;
    this.bandits = 0;
    this.aim = null;
    this.muzzle = 0;
    this.hitFlash = 0;
    this.reloadNag = 0;
  }

  protected tick(dt: number, controls: ArcadeControls): void {
    this.aim = controls.aim ?? null;
    this.muzzle = Math.max(0, this.muzzle - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.reloadNag = Math.max(0, this.reloadNag - dt);

    // Targets come and go; a bandit left standing draws and fires.
    this.spawnIn -= dt;
    if (this.spawnIn <= 0) this.spawn();
    for (const t of this.targets) {
      if (t.down > 0) {
        t.down -= dt;
        continue;
      }
      t.age += dt;
      if (t.age >= t.life) {
        if (t.kind === 'bandit' || t.kind === 'quick') this.shotAt(t);
        t.down = -1; // gone without falling
      }
    }
    this.targets = this.targets.filter((t) => t.down > 0 || (t.down === 0 && t.age < t.life));

    if (!this.aim || this.aim.y >= RELOAD_LINE) {
      // Out of the play: the gun reloads by itself, and a trigger there shoots nothing.
      if (this.ammo < MAGAZINE) {
        this.ammo = MAGAZINE;
        this.reloadNag = 0;
        this.sound('reload');
        this.fx.pop('RELOADED', SCREEN_W / 2, SCREEN_H - 30, '#9ad6ff', 8);
      }
      return;
    }
    if (!controls.firePressed) return;
    if (this.ammo <= 0) {
      this.sound('empty');
      this.reloadNag = 1;
      return;
    }
    this.ammo -= 1;
    this.muzzle = 0.06;
    this.sound('bang');
    const hit = this.targetAt(this.aim.x, this.aim.y);
    if (!hit) {
      this.fx.shake(0.8, 0.05);
      return;
    }
    this.shoot(hit);
  }

  protected paint(ctx: CanvasRenderingContext2D): void {
    // Night sky, the saloon's front in neon outline, the boardwalk.
    const sky = ctx.createLinearGradient(0, PLAY_TOP, 0, SCREEN_H);
    sky.addColorStop(0, '#12051f');
    sky.addColorStop(1, '#2a0c2c');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    ctx.fillStyle = '#1b0f1f';
    ctx.fillRect(20, 40, SCREEN_W - 40, 150);
    ctx.strokeStyle = '#ff2fa0';
    ctx.lineWidth = 2;
    ctx.strokeRect(20, 40, SCREEN_W - 40, 150);
    drawText(ctx, 'SALOON', SCREEN_W / 2, 36, 9, '#ffd23a');
    ctx.fillStyle = '#3a2418';
    ctx.fillRect(0, 182, SCREEN_W, SCREEN_H - 182);
    SPOTS.forEach((s, i) => {
      ctx.fillStyle = i < 3 ? '#0b0612' : i < 5 ? '#140a0e' : '#5a3a20';
      ctx.fillRect(s.x - s.w / 2, s.y - s.h / 2, s.w, s.h);
      ctx.strokeStyle = i < 5 ? 'rgba(51,224,255,0.55)' : 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(s.x - s.w / 2, s.y - s.h / 2, s.w, s.h);
    });
    for (const t of this.targets) this.paintTarget(ctx, t);
    this.drawStage(ctx, `STAGE ${this.stage}`);
    // The magazine, bottom left.
    for (let i = 0; i < MAGAZINE; i++) {
      ctx.fillStyle = i < this.ammo ? '#ffd23a' : 'rgba(255,255,255,0.15)';
      ctx.fillRect(8 + i * 7, SCREEN_H - 14, 4, 9);
    }
    if (this.ammo === 0 || this.reloadNag > 0) {
      // The strip that reloads, lit while the gun is empty: the player looks down here.
      ctx.fillStyle = 'rgba(154,214,255,0.12)';
      ctx.fillRect(0, RELOAD_LINE, SCREEN_W, SCREEN_H - RELOAD_LINE);
      drawText(ctx, 'RELOAD! AIM DOWN HERE', SCREEN_W / 2, SCREEN_H - 10, 8, Math.floor(this.elapsed * 6) % 2 ? '#ff5f5f' : '#ffffff');
    }
    if (this.hitFlash > 0) {
      ctx.fillStyle = `rgba(255,40,40,${this.hitFlash * 0.6})`;
      ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    }
    // The crosshair where the gun points.
    if (this.aim) {
      const { x, y } = this.aim;
      const ink = this.muzzle > 0 ? '#ffffff' : '#7ee787';
      // On whole pixels: a ring and four ticks, no antialiased stroke to blur under the glass's nearest filter.
      SIGHT.drawCentred(ctx, x, y, { x: ink });
      const px = Math.round(x);
      const py = Math.round(y);
      ctx.fillStyle = ink;
      ctx.fillRect(px - 11, py, 4, 1);
      ctx.fillRect(px + 8, py, 4, 1);
      ctx.fillRect(px, py - 11, 1, 4);
      ctx.fillRect(px, py + 8, 1, 4);
    }
  }

  /** Swings the gun towards the nearest threat (a lesser shot slower and wider), fires once on it, points off screen to reload when empty. */
  autopilot(skill: number): ArcadeControls {
    const out: ArcadeControls = { ...NO_CONTROLS, aim: { ...this.pilotAim } };
    if (this.counting) return out;
    if (this.ammo === 0) {
      // A regular takes a moment to notice and swing the gun away.
      if (random() < 0.2) out.aim = null;
      return out;
    }
    const threats = this.targets.filter((t) => t.down === 0 && t.kind !== 'townsfolk');
    threats.sort((a, b) => b.age / b.life - a.age / a.life);
    const target = threats[0];
    if (!target) return out;
    const s = SPOTS[target.spot]!;
    const speed = 1.5 + skill * 3; // pixels a step (120 a second)
    this.pilotAim.x += clamp(s.x - this.pilotAim.x, -speed, speed);
    this.pilotAim.y += clamp(s.y - this.pilotAim.y, -speed, speed);
    out.aim = { ...this.pilotAim };
    const close = Math.hypot(s.x - this.pilotAim.x, s.y - this.pilotAim.y) < 6 + (1 - skill) * 8;
    out.fire = out.firePressed = close && random() < 0.25 + skill * 0.4;
    return out;
  }

  private get stage(): number {
    return Math.floor(this.bandits / BANDITS_PER_STAGE) + 1;
  }

  private spawn(): void {
    const stage = this.stage;
    const busy = new Set(this.targets.map((t) => t.spot));
    const free = SPOTS.map((_, i) => i).filter((i) => !busy.has(i));
    const most = Math.min(5, 2 + Math.floor(stage / 2));
    this.spawnIn = Math.max(0.28, 0.75 - stage * 0.06) * (0.6 + this.rand() * 0.8);
    if (!free.length || this.targets.length >= most) return;
    const spot = free[Math.floor(this.rand() * free.length)]!;
    const roll = this.rand();
    const kind: Kind = roll < 0.05 ? 'badge' : roll < 0.2 ? 'townsfolk' : roll < 0.3 ? 'bottle' : roll < 0.3 + Math.min(0.3, stage * 0.06) ? 'quick' : 'bandit';
    const draw = Math.max(0.55, DRAW_TIME - (stage - 1) * 0.1) * (kind === 'quick' ? 0.65 : 1);
    const life = kind === 'bandit' || kind === 'quick' ? draw : kind === 'badge' ? 1.1 : 1.6;
    this.targets.push({ spot, kind, age: 0, life, down: 0 });
  }

  private targetAt(x: number, y: number): Target | null {
    for (const t of this.targets) {
      if (t.down !== 0) continue;
      const s = SPOTS[t.spot]!;
      if (Math.abs(x - s.x) <= s.w / 2 && Math.abs(y - s.y) <= s.h / 2) return t;
    }
    return null;
  }

  private shoot(t: Target): void {
    const s = SPOTS[t.spot]!;
    t.down = 0.35;
    switch (t.kind) {
      case 'townsfolk':
        this.breakCombo();
        this.fx.pop('NOT THE TOWNSFOLK!', s.x, s.y - 20, '#ff5f5f', 7);
        this.addTime(-TOWNSFOLK_SECONDS, s.x, s.y);
        return;
      case 'badge':
        this.fx.pop('STAR!', s.x, s.y - 20, '#ffd23a', 9);
        this.fx.burst(s.x, s.y, '#ffd23a', 14, 90, 2);
        this.addTime(BADGE_SECONDS, s.x, s.y);
        return;
      case 'bottle':
        this.addScore(POINTS.bottle, s.x, s.y - 14, '#9ad6ff');
        this.fx.burst(s.x, s.y, '#39ff9e', 18, 110, 2);
        return;
      default: {
        this.bumpCombo(1.6);
        // A bandit dropped before reaching for his gun pays extra.
        const early = t.age < t.life * 0.4;
        this.fx.burst(s.x, s.y - 4, t.kind === 'quick' ? '#ff8a3a' : '#e8303a', 12, 80, 2);
        this.addScore(POINTS[t.kind] + (early ? 20 : 0), s.x, s.y - 14);
        if (early) this.fx.pop('QUICK DRAW', s.x, s.y - 28, '#ffe066', 7);
        this.bandits += 1;
        if (this.bandits % BANDITS_PER_STAGE === 0) {
          this.fx.pop(`STAGE ${this.stage}`, SCREEN_W / 2, SCREEN_H / 2 - 24, '#ffffff', 12);
          this.addTime(Math.max(STAGE_MIN, STAGE_SECONDS - STAGE_FADE * (this.stage - 2)), SCREEN_W / 2, SCREEN_H / 2);
        }
      }
    }
  }

  /** A bandit got his shot off. */
  private shotAt(t: Target): void {
    const s = SPOTS[t.spot]!;
    this.hitFlash = 0.3;
    this.breakCombo();
    this.sound('bang', 0.7);
    this.fx.pop('BANG!', s.x, s.y - 18, '#ff5f5f', 9);
    this.addTime(-HIT_SECONDS, s.x, s.y);
    this.fx.shake(2.5, 0.2);
  }

  private paintTarget(ctx: CanvasRenderingContext2D, t: Target): void {
    const s = SPOTS[t.spot]!;
    // Rises into its spot, sinks when shot.
    const rise = t.down > 0 ? t.down / 0.35 : Math.min(1, t.age / 0.12);
    const h = s.h * 0.9 * rise;
    const top = s.y + s.h / 2 - h;
    ctx.save();
    ctx.beginPath();
    ctx.rect(s.x - s.w / 2, s.y - s.h / 2, s.w, s.h);
    ctx.clip();
    const cx = s.x;
    switch (t.kind) {
      case 'bandit':
      case 'quick': {
        const color = t.kind === 'quick' ? '#ff8a3a' : '#e8303a';
        ctx.fillStyle = color;
        ctx.fillRect(Math.round(cx) - 10, Math.round(top) + 12, 20, Math.ceil(h));
        BANDIT.draw(ctx, cx - 12, top - 9, { x: '#1a1010', b: '#5a3a20', s: '#d8a878', e: '#1a1010', r: color });
        // Drawing: the gun comes up as his time runs out.
        const drawn = t.age / t.life;
        if (t.down === 0 && drawn > 0.55) {
          ctx.fillStyle = '#c4c7cc';
          ctx.fillRect(cx + 8, top + 14 - (drawn - 0.55) * 20, 10, 3);
        }
        break;
      }
      case 'townsfolk':
        ctx.fillStyle = '#63b3ff';
        ctx.fillRect(Math.round(cx) - 10, Math.round(top) + 11, 20, Math.ceil(h));
        TOWNSFOLK.draw(ctx, cx - 12, top - 4, { x: '#f2e6c8', s: '#d8a878', e: '#1a1010', l: '#b0605a', c: '#f2e6c8' });
        break;
      case 'bottle':
        ctx.fillStyle = '#39ff9e';
        ctx.fillRect(cx - 4, s.y + s.h / 2 - h * 0.7, 8, h * 0.7);
        ctx.fillRect(cx - 2, s.y + s.h / 2 - h * 0.9, 4, h * 0.2);
        break;
      case 'badge':
        ctx.fillStyle = '#ffd23a';
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
          const d = i % 2 ? 5 : 11;
          ctx.lineTo(cx + Math.cos(a) * d, s.y + Math.sin(a) * d + (1 - rise) * s.h);
        }
        ctx.fill();
        break;
    }
    ctx.restore();
  }
}
