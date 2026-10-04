import { seededRandom } from '@/graphics/canvas';
import { drawText } from '@/world/arcade/games/ArcadeGame';
import { Fx } from '@/world/arcade/games/Fx';
import { KeyEdges } from '@/world/arcade/games/KeyEdges';

/*
 * MOONPOST v0.9, the demo on the prototype cart: a postman with a jet pack on the moon, three letters
 * to drop at three crater houses. Lunar-lander rules: gravity, a thrust that burns fuel, a landing soft
 * and level enough on a house's pad delivers (its flag drops), on the post office's pad refuels, too
 * hard anywhere is a puff and a walk back to the office. Three letters, then the demo's end: the
 * credits, an unfinished game's "levels 4-8: TO DO". Built from the cabinet games' pieces (`drawText`,
 * `Fx`, `KeyEdges`), drawn at the NES's 256 x 240.
 */

export const DEMO_W = 256;
export const DEMO_H = 240;

/** What the demo reads each frame (the pad, mapped by `MoonpostProgram`). */
interface DemoControls {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  /** Held: the jet pack. */
  fire: boolean;
  firePressed: boolean;
  start: boolean;
}

export type DemoSound = 'start' | 'deliver' | 'refuel' | 'crash' | 'land' | 'end';

const GRAVITY = 26;
const THRUST = 64;
const SIDE = 34;
const FUEL_PER_S = 6;
const FUEL_MAX = 100;
/** Softest landing that still counts (px/s): faster is a crash. */
const LAND = { vy: 38, vx: 26 };
const POSTMAN = { w: 8, h: 12 };
const CREDITS_SECONDS = 22;
/** A raised pad's sloping sides, px either way. */
const RAMP = 10;
const END_HOLD = 4;

interface Pad {
  x0: number;
  x1: number;
  y: number;
  kind: 'office' | 'house';
  /** A house still waiting for its letter. */
  waiting: boolean;
  name: string;
}

type Mode = 'title' | 'play' | 'delivered' | 'credits' | 'end';

export class MoonpostDemo {
  over = false;
  /** True from the moment the credits start (the demo was played to its end). */
  finished = false;
  private mode: Mode = 'title';
  private clock = 0;
  private modeTime = 0;
  private readonly fx = new Fx();
  private readonly keys = new KeyEdges();
  private sounds: DemoSound[] = [];
  private ground: number[] = [];
  private pads: Pad[] = [];
  private stars: { x: number; y: number; b: number }[] = [];
  private x = 0;
  private y = 0;
  private vx = 0;
  private vy = 0;
  private fuel = FUEL_MAX;
  private landed = true;
  private flame = false;
  private crashes = 0;
  private delivered = 0;
  private respawn = 0;
  /** The respawn follows a crash (a puff of dust where he came down), not an empty tank. */
  private puff = false;
  /** Frames a second, smoothed: the debug line's. */
  private fps = 60;

  constructor() {
    this.build();
    this.toOffice();
  }

  /** Whether the jet pack is burning (the program's hiss). */
  get thrusting(): boolean {
    return this.flame;
  }

  /** Music for the screen: the title's, the rounds', none in the credits' silence at the very end. */
  get musicOn(): boolean {
    return this.mode !== 'end';
  }

  takeSounds(): DemoSound[] {
    const s = this.sounds;
    this.sounds = [];
    return s;
  }

  update(dt: number, c: DemoControls): void {
    if (this.over) return;
    this.clock += dt;
    this.modeTime += dt;
    if (dt > 0) this.fps += (1 / dt - this.fps) * 0.05;
    this.fx.update(dt);
    const startPressed = this.keys.pressed({ ...c, fire: c.start, firePressed: false }, 'fire');
    switch (this.mode) {
      case 'title':
        if (startPressed || (c.firePressed && this.modeTime > 0.5)) this.go('play', 'start');
        return;
      case 'play':
        this.fly(dt, c);
        return;
      case 'delivered':
        if (this.modeTime > 2.6 || startPressed) {
          this.finished = true;
          this.go('credits', 'end');
        }
        return;
      case 'credits':
        if (this.modeTime > CREDITS_SECONDS || startPressed) this.go('end');
        return;
      case 'end':
        if (this.modeTime > END_HOLD || (startPressed && this.modeTime > 0.5)) this.over = true;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#05060f';
    ctx.fillRect(0, 0, DEMO_W, DEMO_H);
    if (this.mode === 'credits' || this.mode === 'end') return this.drawCredits(ctx);
    this.fx.begin(ctx);
    this.drawSky(ctx);
    this.drawGround(ctx);
    if (this.mode !== 'title') this.drawPostman(ctx);
    this.fx.end(ctx);
    if (this.mode === 'title') this.drawTitle(ctx);
    else this.drawHud(ctx);
    if (this.mode === 'delivered') {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 96, DEMO_W, 48);
      drawText(ctx, 'ALL LETTERS DELIVERED!', DEMO_W / 2, 112, 9, '#ffe066');
      drawText(ctx, `CRASHES: ${this.crashes}`, DEMO_W / 2, 130, 7, '#c9c4ff');
    }
    // What a build for lot check still shows: the debug line.
    drawText(ctx, `BUILD 0.9 ${Math.round(this.fps)}FPS`, DEMO_W - 3, DEMO_H - 5, 5, 'rgba(126,231,135,0.55)', 'right');
  }

  // --- the round ---------------------------------------------------------------------------------

  private fly(dt: number, c: DemoControls): void {
    if (this.respawn > 0) {
      this.respawn -= dt;
      if (this.respawn <= 0) this.toOffice();
      return;
    }
    this.flame = (c.fire || c.up) && this.fuel > 0;
    if (this.landed && this.fuel <= 0) {
      // Stranded on a pad with an empty tank: the walk back to the office, no harm done.
      this.fx.pop('OUT OF FUEL', this.x, this.y - 18, '#ffb347', 7);
      this.respawn = 1.4;
      this.puff = false;
      return;
    }
    if (this.landed && !this.flame) return;
    this.landed = false;
    let ax = 0;
    let ay = GRAVITY;
    if (this.flame) {
      ay -= THRUST;
      this.fuel = Math.max(0, this.fuel - FUEL_PER_S * dt);
    }
    if (this.fuel > 0) {
      if (c.left) ax -= SIDE;
      if (c.right) ax += SIDE;
    }
    this.vx += ax * dt;
    this.vy += ay * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.x < 4) {
      this.x = 4;
      this.vx = Math.abs(this.vx) * 0.4;
    } else if (this.x > DEMO_W - 4) {
      this.x = DEMO_W - 4;
      this.vx = -Math.abs(this.vx) * 0.4;
    }
    if (this.y < 26) {
      this.y = 26;
      this.vy = Math.max(0, this.vy);
    }
    const floor = this.groundAt(this.x);
    if (this.y < floor) return;
    this.y = floor;
    const pad = this.pads.find((p) => this.x - POSTMAN.w / 2 >= p.x0 - 2 && this.x + POSTMAN.w / 2 <= p.x1 + 2);
    if (!pad || this.vy > LAND.vy || Math.abs(this.vx) > LAND.vx) return this.crash();
    this.vx = 0;
    this.vy = 0;
    this.landed = true;
    this.flame = false;
    this.sounds.push('land');
    if (pad.kind === 'office') {
      if (this.fuel < FUEL_MAX - 1) {
        this.fuel = FUEL_MAX;
        this.sounds.push('refuel');
        this.fx.pop('REFUELLED', this.x, this.y - 18, '#63b3ff', 7);
      }
      return;
    }
    if (!pad.waiting) return;
    pad.waiting = false;
    this.delivered++;
    this.sounds.push('deliver');
    this.fx.pop(`LETTER FOR ${pad.name}!`, this.x, this.y - 20, '#ffe066', 7);
    this.fx.flash('#ffe066', 0.08);
    if (this.delivered >= this.pads.filter((p) => p.kind === 'house').length) this.go('delivered');
  }

  private crash(): void {
    this.crashes++;
    this.sounds.push('crash');
    this.fx.shake(3, 0.3);
    this.fx.flash('#ff8a80', 0.1);
    this.fx.pop('OOF!', this.x, this.y - 16, '#ff8a80', 9);
    this.flame = false;
    this.respawn = 1.4;
    this.puff = true;
  }

  private toOffice(): void {
    const office = this.pads.find((p) => p.kind === 'office')!;
    this.x = (office.x0 + office.x1) / 2;
    this.y = office.y;
    this.vx = 0;
    this.vy = 0;
    this.fuel = FUEL_MAX;
    this.landed = true;
  }

  private go(mode: Mode, sound?: DemoSound): void {
    this.mode = mode;
    this.modeTime = 0;
    if (sound) this.sounds.push(sound);
  }

  // --- the moon ----------------------------------------------------------------------------------

  /** The ground's height per pixel column: rolling hills, crater rims, and four flat pads cut in. */
  private build(): void {
    const random = seededRandom(1993);
    const base = (x: number): number => 196 + Math.sin(x * 0.045) * 12 + Math.sin(x * 0.13 + 1) * 5;
    this.ground = Array.from({ length: DEMO_W + 1 }, (_, x) => base(x));
    // Two craters: a bowl with raised rims.
    for (const [cx, r, depth] of [[110, 22, 18], [205, 16, 12]] as const) {
      for (let x = Math.max(0, cx - r - 6); x <= Math.min(DEMO_W, cx + r + 6); x++) {
        const d = Math.abs(x - cx) / r;
        this.ground[x]! += d < 1 ? depth * (1 - d * d) : -5 * Math.max(0, 1 - (d - 1) * 4);
      }
    }
    const pad = (x0: number, x1: number, lift: number, kind: Pad['kind'], name: string): void => {
      const y = Math.min(...this.ground.slice(x0, x1 + 1)) - lift;
      for (let x = x0; x <= x1; x++) this.ground[x] = y;
      // A raised pad stands on a rock with sloping sides (steep, but no sheer wall to fly into).
      for (let k = 1; k <= RAMP; k++) {
        const rise = y + lift * (k / RAMP);
        if (x0 - k >= 0) this.ground[x0 - k] = Math.max(Math.min(this.ground[x0 - k]!, rise), y);
        if (x1 + k <= DEMO_W) this.ground[x1 + k] = Math.max(Math.min(this.ground[x1 + k]!, rise), y);
      }
      this.pads.push({ x0, x1, y, kind, waiting: kind === 'house', name });
    };
    pad(14, 44, 2, 'office', 'P.O.');
    pad(72, 96, 26, 'house', 'MRS LUNE');
    pad(146, 168, 48, 'house', 'DR TYCHO');
    pad(222, 246, 14, 'house', 'THE KID');
    this.stars = Array.from({ length: 70 }, () => ({ x: random() * DEMO_W, y: random() * 150, b: 0.3 + random() * 0.7 }));
  }

  private groundAt(x: number): number {
    const i = Math.max(0, Math.min(DEMO_W - 1, Math.floor(x)));
    const f = x - i;
    return this.ground[i]! * (1 - f) + this.ground[i + 1]! * f;
  }

  // --- drawing -----------------------------------------------------------------------------------

  private drawSky(ctx: CanvasRenderingContext2D): void {
    for (const s of this.stars) {
      const twinkle = 0.6 + 0.4 * Math.sin(this.clock * 2 + s.x);
      ctx.fillStyle = `rgba(255,255,255,${(s.b * twinkle).toFixed(2)})`;
      ctx.fillRect(Math.round(s.x), Math.round(s.y), 1, 1);
    }
    // The Earth, too big ("known bugs: the moon is too big"... it is the Earth, but who checks).
    ctx.fillStyle = '#2f6fd1';
    ctx.beginPath();
    ctx.arc(210, 50, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4fb06a';
    ctx.fillRect(198, 40, 10, 7);
    ctx.fillRect(212, 54, 12, 6);
    ctx.fillStyle = 'rgba(5,6,15,0.55)';
    ctx.beginPath();
    ctx.arc(218, 46, 22, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawGround(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#9a9aa6';
    ctx.beginPath();
    ctx.moveTo(0, DEMO_H);
    for (let x = 0; x <= DEMO_W; x++) ctx.lineTo(x, this.ground[x]!);
    ctx.lineTo(DEMO_W, DEMO_H);
    ctx.fill();
    ctx.fillStyle = '#6d6d7a';
    for (let x = 0; x < DEMO_W; x += 3) ctx.fillRect(x, this.ground[x]! + 3 + ((x * 7) % 9), 2, 1);
    for (const pad of this.pads) {
      ctx.fillStyle = pad.kind === 'office' ? '#63b3ff' : '#ffe066';
      ctx.fillRect(pad.x0, pad.y, pad.x1 - pad.x0, 2);
      if (pad.kind === 'office') {
        ctx.fillStyle = '#d24b4b';
        ctx.fillRect(pad.x0 + 4, pad.y - 14, 22, 14);
        drawText(ctx, 'P.O.', pad.x0 + 15, pad.y - 7, 5, '#ffffff');
      } else {
        const hx = (pad.x0 + pad.x1) / 2;
        // A dome house; the third is a magenta placeholder box, as unfinished builds have.
        if (pad.name === 'THE KID') {
          ctx.fillStyle = '#ff00ff';
          ctx.fillRect(hx - 7, pad.y - 13, 14, 13);
          drawText(ctx, '?', hx, pad.y - 6, 7, '#000');
        } else {
          ctx.fillStyle = '#c9c4ff';
          ctx.beginPath();
          ctx.arc(hx - 3, pad.y, 9, Math.PI, 0);
          ctx.fill();
        }
        // The mailbox: its flag up while a letter is due.
        ctx.fillStyle = '#eeeeee';
        ctx.fillRect(pad.x1 - 6, pad.y - 8, 4, 8);
        ctx.fillStyle = pad.waiting ? '#ff5f5f' : '#555';
        ctx.fillRect(pad.x1 - 2, pad.y - (pad.waiting ? 10 : 6), 3, 2);
      }
    }
  }

  private drawPostman(ctx: CanvasRenderingContext2D): void {
    if (this.respawn > 0 && !this.puff) return;
    if (this.respawn > 0) {
      // The puff where he came down.
      const r = 4 + (1.4 - this.respawn) * 10;
      ctx.fillStyle = `rgba(200,200,210,${Math.max(0, this.respawn / 1.4).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(this.x, this.y - 4, r, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    const x = Math.round(this.x);
    const y = Math.round(this.y);
    if (this.flame) {
      ctx.fillStyle = Math.floor(this.clock * 20) % 2 ? '#ffb347' : '#ffe066';
      ctx.fillRect(x - 5, y - 4, 2, 4 + Math.floor(Math.random() * 3));
    }
    ctx.fillStyle = '#8a6d1f'; // the satchel
    ctx.fillRect(x + 1, y - 7, 4, 4);
    ctx.fillStyle = '#2b4a7a'; // the uniform
    ctx.fillRect(x - 3, y - 10, 6, 8);
    ctx.fillStyle = '#ffffff'; // the helmet
    ctx.fillRect(x - 3, y - 14, 6, 4);
    ctx.fillStyle = '#63b3ff';
    ctx.fillRect(x - 1, y - 13, 3, 2);
    ctx.fillStyle = '#444';
    ctx.fillRect(x - 6, y - 10, 2, 6); // the jet pack
    ctx.fillStyle = '#2b2b33';
    ctx.fillRect(x - 3, y - 2, 2, 2);
    ctx.fillRect(x + 1, y - 2, 2, 2);
  }

  private drawHud(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, DEMO_W, 16);
    drawText(ctx, `LETTERS ${this.pads.filter((p) => p.kind === 'house' && p.waiting).length}`, 4, 8, 6, '#ffe066', 'left');
    drawText(ctx, 'FUEL', 118, 8, 6, '#c9c4ff', 'right');
    ctx.fillStyle = '#222233';
    ctx.fillRect(122, 5, 60, 6);
    ctx.fillStyle = this.fuel < 25 ? '#ff5f5f' : '#63b3ff';
    ctx.fillRect(122, 5, 60 * (this.fuel / FUEL_MAX), 6);
    const speed = Math.hypot(this.vx, this.vy);
    drawText(ctx, `${Math.round(speed)}`, DEMO_W - 4, 8, 6, this.vy > LAND.vy ? '#ff8a80' : '#7ee787', 'right');
    if (this.modeTime < 4 && this.delivered === 0) drawText(ctx, 'A: JET PACK   LEFT/RIGHT: STEER', DEMO_W / 2, 26, 5, '#ffffff');
  }

  private drawTitle(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 54, DEMO_W, 92);
    const bob = Math.sin(this.clock * 2) * 2;
    drawText(ctx, 'MOONPOST', DEMO_W / 2, 80 + bob, 20, '#ffe066');
    drawText(ctx, 'PROTOTYPE 0.9  NOT FOR SALE', DEMO_W / 2, 106, 6, '#ff8a80');
    if (Math.floor(this.clock * 2) % 2 === 0) drawText(ctx, 'PRESS START', DEMO_W / 2, 130, 8, '#ffffff');
    drawText(ctx, '(C) 1993 HALCYON BYTE', DEMO_W / 2, 226, 6, '#c9c4ff');
  }

  private drawCredits(ctx: CanvasRenderingContext2D): void {
    for (const s of this.stars) {
      ctx.fillStyle = `rgba(255,255,255,${(s.b * 0.6).toFixed(2)})`;
      ctx.fillRect(Math.round(s.x), Math.round((s.y + this.clock * 6) % DEMO_H), 1, 1);
    }
    if (this.mode === 'end') {
      drawText(ctx, 'THE END?', DEMO_W / 2, DEMO_H / 2 - 8, 14, '#ffe066');
      drawText(ctx, 'LEVELS 4-8: TO DO', DEMO_W / 2, DEMO_H / 2 + 14, 6, '#ff8a80');
      return;
    }
    const lines: [string, string][] = [
      ['THANK YOU FOR PLAYING', '#ffe066'],
      ['THE MOONPOST DEMO', '#ffe066'],
      ['', ''],
      ['DESIGN', '#c9c4ff'],
      ['T. ASHWORTH', '#ffffff'],
      ['', ''],
      ['PROGRAM', '#c9c4ff'],
      ['R. OKONJO', '#ffffff'],
      ['', ''],
      ['GRAPHICS', '#c9c4ff'],
      ['M. FELL', '#ffffff'],
      ['', ''],
      ['MUSIC', '#c9c4ff'],
      ['HANA B.', '#ffffff'],
      ['', ''],
      ['SPECIAL THANKS', '#c9c4ff'],
      ['THE LAUNDERETTE', '#ffffff'],
      ['FOR THE HEATING', '#ffffff'],
      ['', ''],
      ['HALCYON BYTE 1993', '#7ee787'],
    ];
    const scroll = DEMO_H + 10 - this.modeTime * ((lines.length * 14 + DEMO_H) / CREDITS_SECONDS);
    lines.forEach(([text, color], i) => {
      const y = scroll + i * 14;
      if (text && y > -10 && y < DEMO_H + 10) drawText(ctx, text, DEMO_W / 2, y, 7, color);
    });
  }
}
