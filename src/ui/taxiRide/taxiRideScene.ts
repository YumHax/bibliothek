import { mulberry32 } from '@/random';
import { randomLook } from '@/world/people/looks';
import { createCanvas } from '@/graphics/canvas';
import { paintFace } from '../social/face';
import { BusRideScene } from '../busRide/busRideScene';

/*
 * THE VIEW FROM THE TAXI'S BACK SEAT (`TaxiRide`), drawn on a canvas like the bus's (`busRide/busRideScene`): the
 * windscreen with the road running at you (the kerbs, the centre line, the lamps and the shopfronts sliding out to
 * the sides, oncoming headlights at night), the two side windows with the town going past (the bus's own painter,
 * one of them mirrored), the roof lining, the mirror with the driver's eyes in it and the pine tree swinging under it,
 * the dash, and the two front seats with the driver's head and shoulders over the left one. Everything in fractions
 * of the canvas; the meter, the card on the dash and the driver's balloon are the ride's markup over it.
 */

/** What a frame shows. */
interface TaxiFrame {
  t: number;
  /** Metres travelled. */
  travelled: number;
  /** 0 at a stand .. 1 at speed. */
  speed: number;
  /** 0 night .. 1 day. */
  daylight: number;
}

/** The windscreen's corners (fractions): narrower at the top, the vanishing point a little above its middle. */
const SCREEN = { topL: 0.27, topR: 0.73, botL: 0.17, botR: 0.83, top: 0.11, bottom: 0.55, horizon: 0.34 } as const;
/** The side windows' openings (fractions): left one, the right one its mirror. */
const SIDE = { outer: 0, inner: 0.13, top: 0.17, bottom: 0.6, slope: 0.06 } as const;
/** The dash's band and the seats' tops (fractions of the height). */
const DASH = { top: 0.55, bottom: 0.68 } as const;
/** How far the road's furniture repeats (m), and how far ahead it is drawn. */
const LAMP_EVERY = 22;
const FACADE_EVERY = 9;
const AHEAD = 140;

const rgb = (c: number, k = 1): string => `rgb(${Math.min(255, ((c >> 16) & 255) * k) | 0},${Math.min(255, ((c >> 8) & 255) * k) | 0},${Math.min(255, (c & 255) * k) | 0})`;

export class TaxiRideScene {
  private readonly town: BusRideScene;
  private readonly hair: number;
  private readonly skin: number;
  private readonly jacket: number;
  private readonly bald: boolean;
  /** The driver's eyes, painted once from their face: a strip of it for the mirror. */
  private readonly eyes: HTMLCanvasElement;
  private readonly facadeTones: string[];

  constructor(seed: number, driverSeed: number) {
    this.town = new BusRideScene(seed);
    const look = randomLook(driverSeed, 'vendor');
    this.hair = look.hair;
    this.skin = look.skin;
    this.jacket = look.topColor;
    this.bald = look.hairStyle === 'bald' || look.hairStyle === 'buzz';
    const [face, g] = createCanvas(200, 200);
    paintFace(g, 200, look, '#2a2622', 'rest');
    const [eyes, e] = createCanvas(120, 44);
    e.drawImage(face, 50, 60, 100, 36, 0, 0, 120, 44);
    this.eyes = eyes;
    const random = mulberry32(seed + 9);
    this.facadeTones = Array.from({ length: 12 }, () => `hsl(${30 + random() * 25}, ${12 + random() * 18}%, ${58 + random() * 18}%)`);
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, f: TaxiFrame): void {
    const night = 1 - f.daylight;
    const bounce = (Math.sin(f.t * 2.9) + Math.sin(f.t * 6.3) * 0.35) * h * 0.003 * f.speed;
    ctx.save();
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = mix('#3a3632', '#0d0c0b', night);
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(0, bounce);
    this.drawWindscreen(ctx, w, h, f, night);
    this.drawSideWindow(ctx, w, h, f, night, false);
    this.drawSideWindow(ctx, w, h, f, night, true);
    this.drawLining(ctx, w, h, night);
    this.drawMirror(ctx, w, h, f, night);
    this.drawDash(ctx, w, h, night);
    ctx.restore();
    // The seats move with the car less than the view does.
    ctx.save();
    ctx.translate(0, bounce * 0.5);
    this.drawSeats(ctx, w, h, f, night);
    ctx.restore();
    ctx.restore();

    const vignette = ctx.createRadialGradient(w / 2, h * 0.4, h * 0.3, w / 2, h / 2, h * 0.95);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, `rgba(0,0,0,${0.4 + 0.25 * night})`);
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);
  }

  private screenPath(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const r = h * 0.03;
    ctx.beginPath();
    ctx.moveTo(SCREEN.topL * w + r, SCREEN.top * h);
    ctx.lineTo(SCREEN.topR * w - r, SCREEN.top * h);
    ctx.quadraticCurveTo(SCREEN.topR * w, SCREEN.top * h, SCREEN.topR * w + r * 0.4, SCREEN.top * h + r);
    ctx.lineTo(SCREEN.botR * w, SCREEN.bottom * h);
    ctx.lineTo(SCREEN.botL * w, SCREEN.bottom * h);
    ctx.lineTo(SCREEN.topL * w - r * 0.4, SCREEN.top * h + r);
    ctx.quadraticCurveTo(SCREEN.topL * w, SCREEN.top * h, SCREEN.topL * w + r, SCREEN.top * h);
    ctx.closePath();
  }

  /** The road ahead in perspective: sky, the shopfronts both sides, the carriageway, the lamps going by. */
  private drawWindscreen(ctx: CanvasRenderingContext2D, w: number, h: number, f: TaxiFrame, night: number): void {
    ctx.save();
    this.screenPath(ctx, w, h);
    ctx.clip();
    const cx = w / 2;
    const hy = SCREEN.horizon * h;
    const sky = ctx.createLinearGradient(0, SCREEN.top * h, 0, hy);
    sky.addColorStop(0, mix('#6fa6dc', '#0b1226', night));
    sky.addColorStop(1, mix('#dbe8f2', '#27304a', night));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, hy + 1);
    // A projection: x across the road (m), y up (m), z ahead (m), seen from 1.2 m up.
    const focal = h * 0.62;
    const eye = 1.2;
    const sx = (x: number, z: number): number => cx + (x / z) * focal;
    const sy = (y: number, z: number): number => hy + ((eye - y) / z) * focal;
    // The ground, then the carriageway (7 m wide) and its pavements.
    ctx.fillStyle = mix('#9a958c', '#1d1d20', night);
    ctx.fillRect(0, hy, w, h);
    const road = (x0: number, x1: number, colour: string): void => {
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.moveTo(sx(x0, 2), sy(0, 2));
      ctx.lineTo(sx(x0, AHEAD), sy(0, AHEAD));
      ctx.lineTo(sx(x1, AHEAD), sy(0, AHEAD));
      ctx.lineTo(sx(x1, 2), sy(0, 2));
      ctx.fill();
    };
    road(-3.5, 6.5, mix('#58585c', '#141417', night));
    // The shopfronts both sides: blocks from the pavement's back, each its own height and tone, lit windows at night.
    const first = Math.floor(f.travelled / FACADE_EVERY);
    for (let i = Math.ceil(AHEAD / FACADE_EVERY); i >= 0; i--) {
      const n = first + i;
      const z0 = n * FACADE_EVERY - f.travelled;
      const z1 = z0 + FACADE_EVERY - 0.6;
      if (z1 < 1.5) continue;
      const near = Math.max(1.5, z0);
      for (const side of [-1, 1]) {
        const x = side < 0 ? -7.5 : 10.5;
        const tall = 9 + ((n * 7 + (side < 0 ? 3 : 11)) % 6);
        const tone = this.facadeTones[(n * 5 + (side < 0 ? 1 : 7)) % this.facadeTones.length]!;
        ctx.fillStyle = mix(tone, '#151518', night * 0.85);
        ctx.beginPath();
        ctx.moveTo(sx(x, near), sy(0, near));
        ctx.lineTo(sx(x, z1), sy(0, z1));
        ctx.lineTo(sx(x, z1), sy(tall, z1));
        ctx.lineTo(sx(x, near), sy(tall, near));
        ctx.fill();
        // A shop window at street level: bright at night.
        ctx.fillStyle = night > 0.4 ? `rgba(255,214,140,${0.25 + night * 0.5})` : 'rgba(40,50,60,0.45)';
        ctx.beginPath();
        ctx.moveTo(sx(x, near + 0.8), sy(0.6, near + 0.8));
        ctx.lineTo(sx(x, z1 - 0.8), sy(0.6, z1 - 0.8));
        ctx.lineTo(sx(x, z1 - 0.8), sy(2.6, z1 - 0.8));
        ctx.lineTo(sx(x, near + 0.8), sy(2.6, near + 0.8));
        ctx.fill();
      }
    }
    // The centre line's dashes coming at you.
    ctx.fillStyle = mix('#efe9d8', '#9a968c', night);
    const dash = 3;
    const gap = 6;
    for (let z = gap - (f.travelled % (dash + gap)); z < AHEAD; z += dash + gap) {
      const z0 = Math.max(2, z);
      const z1 = z + dash;
      if (z1 <= 2) continue;
      ctx.beginPath();
      ctx.moveTo(sx(1.4, z0), sy(0, z0));
      ctx.lineTo(sx(1.4, z1), sy(0, z1));
      ctx.lineTo(sx(1.6, z1), sy(0, z1));
      ctx.lineTo(sx(1.6, z0), sy(0, z0));
      ctx.fill();
    }
    // Lamp posts both sides, sliding out past the pillars; their heads glow at night.
    for (let z = LAMP_EVERY - (f.travelled % LAMP_EVERY); z < AHEAD; z += LAMP_EVERY) {
      if (z < 1.6) continue;
      for (const x of [-4.6, 7.6]) {
        ctx.strokeStyle = mix('#3a3d42', '#0a0a0c', night * 0.6);
        ctx.lineWidth = Math.max(1, (0.14 / z) * focal);
        ctx.beginPath();
        ctx.moveTo(sx(x, z), sy(0, z));
        ctx.lineTo(sx(x, z), sy(5.2, z));
        ctx.stroke();
        if (night > 0.3) {
          const r = Math.max(2, (0.9 / z) * focal);
          const glow = ctx.createRadialGradient(sx(x, z), sy(5.2, z), 0, sx(x, z), sy(5.2, z), r * 2.2);
          glow.addColorStop(0, `rgba(255,200,120,${night})`);
          glow.addColorStop(1, 'rgba(255,200,120,0)');
          ctx.fillStyle = glow;
          ctx.fillRect(sx(x, z) - r * 2.2, sy(5.2, z) - r * 2.2, r * 4.4, r * 4.4);
        }
      }
    }
    // At night: a car's headlights coming the other way now and then, and our own beams on the tarmac.
    if (night > 0.4) {
      const phase = (f.t * 0.45) % 1;
      const z = 120 * (1 - phase) + 4;
      for (const x of [3.3, 4.5]) {
        const r = Math.max(2, (0.5 / z) * focal);
        const glow = ctx.createRadialGradient(sx(x, z), sy(0.7, z), 0, sx(x, z), sy(0.7, z), r * 3);
        glow.addColorStop(0, `rgba(255,250,230,${night})`);
        glow.addColorStop(1, 'rgba(255,250,230,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(sx(x, z) - r * 3, sy(0.7, z) - r * 3, r * 6, r * 6);
      }
      const beam = ctx.createRadialGradient(cx + w * 0.06, SCREEN.bottom * h, 0, cx + w * 0.06, SCREEN.bottom * h, h * 0.3);
      beam.addColorStop(0, `rgba(255,240,200,${0.22 * night})`);
      beam.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = beam;
      ctx.fillRect(0, hy, w, h);
    }
    // The glass: a faint sheen from the top.
    const sheen = ctx.createLinearGradient(0, SCREEN.top * h, 0, SCREEN.bottom * h);
    sheen.addColorStop(0, 'rgba(255,255,255,0.08)');
    sheen.addColorStop(0.4, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    // The rubber round the glass.
    ctx.save();
    this.screenPath(ctx, w, h);
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.lineWidth = h * 0.008;
    ctx.stroke();
    ctx.restore();
  }

  /** A rear side window with the town going past (the bus's painter); the right one mirrored. */
  private drawSideWindow(ctx: CanvasRenderingContext2D, w: number, h: number, f: TaxiFrame, night: number, right: boolean): void {
    ctx.save();
    if (right) {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.beginPath();
    ctx.moveTo(SIDE.outer * w, SIDE.top * h + SIDE.slope * h);
    ctx.lineTo(SIDE.inner * w, SIDE.top * h);
    ctx.lineTo(SIDE.inner * w, SIDE.bottom * h);
    ctx.lineTo(SIDE.outer * w, SIDE.bottom * h);
    ctx.closePath();
    ctx.save();
    ctx.clip();
    // The left side: things come past from the front (right of the pane) going back (left): the bus's own direction.
    this.town.drawStreet(ctx, w, h, { t: f.t, travelled: f.travelled * (right ? 1.07 : 1), speed: f.speed, daylight: 1 - night, dusk: 0 });
    ctx.fillStyle = `rgba(20,24,30,${0.18 + 0.2 * night})`;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.lineWidth = h * 0.01;
    ctx.stroke();
    ctx.restore();
  }

  /** The roof lining over everything, the A-pillars down each side of the windscreen. */
  private drawLining(ctx: CanvasRenderingContext2D, w: number, h: number, night: number): void {
    const lining = ctx.createLinearGradient(0, 0, 0, SCREEN.top * h);
    lining.addColorStop(0, mix('#8a847a', '#1b1a18', night));
    lining.addColorStop(1, mix('#5e5a54', '#121110', night));
    ctx.fillStyle = lining;
    ctx.fillRect(0, 0, w, SCREEN.top * h);
    ctx.fillStyle = mix('#2a2826', '#0a0909', night);
    for (const side of [0, 1]) {
      ctx.save();
      if (side) {
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
      }
      ctx.beginPath();
      ctx.moveTo(SIDE.inner * w, SIDE.top * h - h * 0.02);
      ctx.lineTo(SCREEN.topL * w - h * 0.01, SCREEN.top * h - h * 0.005);
      ctx.lineTo(SCREEN.botL * w + h * 0.004, DASH.top * h);
      ctx.lineTo(SIDE.inner * w, DASH.top * h + h * 0.05);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  /** The mirror at the top of the windscreen with the driver's eyes in it, the pine tree hanging under it. */
  private drawMirror(ctx: CanvasRenderingContext2D, w: number, h: number, f: TaxiFrame, night: number): void {
    const mw = h * 0.2;
    const mh = h * 0.065;
    const mx = w * 0.5 - mw / 2;
    const my = SCREEN.top * h + h * 0.012;
    ctx.fillStyle = '#121212';
    ctx.fillRect(w * 0.5 - h * 0.006, SCREEN.top * h - h * 0.01, h * 0.012, h * 0.02);
    roundRect(ctx, mx - h * 0.006, my - h * 0.006, mw + h * 0.012, mh + h * 0.012, h * 0.016);
    ctx.fill();
    ctx.save();
    roundRect(ctx, mx, my, mw, mh, h * 0.012);
    ctx.clip();
    ctx.fillStyle = mix('#6a6258', '#16130f', night);
    ctx.fillRect(mx, my, mw, mh);
    // The eyes glance up at the mirror now and then: the strip slides into view.
    const glance = Math.max(0, Math.sin(f.t * 1.1 - 0.6));
    ctx.globalAlpha = (0.55 + 0.45 * glance) * (night > 0.5 ? 0.7 : 1);
    ctx.drawImage(this.eyes, mx + mw * 0.08, my + (1 - glance) * mh * 0.15, mw * 0.84, mh * 1.05);
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(mx, my, mw, mh * 0.3);
    ctx.restore();
    // The little pine tree on its string, swinging with the corners.
    const swing = Math.sin(f.t * 1.9) * 0.22 * (0.3 + f.speed);
    const top = my + mh + h * 0.006;
    const len = h * 0.05;
    const tx = w * 0.5 + Math.sin(swing) * len;
    const ty = top + Math.cos(swing) * len;
    ctx.strokeStyle = '#d8d0c0';
    ctx.lineWidth = Math.max(1, h * 0.002);
    ctx.beginPath();
    ctx.moveTo(w * 0.5, top);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.save();
    ctx.translate(tx, ty);
    ctx.rotate(swing);
    ctx.fillStyle = mix('#2f8a4a', '#1a4a2a', night);
    const s = h * 0.03;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(s * 0.55, s * 0.7);
    ctx.lineTo(s * 0.25, s * 0.7);
    ctx.lineTo(s * 0.7, s * 1.35);
    ctx.lineTo(-s * 0.7, s * 1.35);
    ctx.lineTo(-s * 0.25, s * 0.7);
    ctx.lineTo(-s * 0.55, s * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = mix('#8a5a2a', '#3a2412', night);
    ctx.fillRect(-s * 0.1, s * 1.35, s * 0.2, s * 0.25);
    ctx.restore();
  }

  /** The dash across under the windscreen: a moulded top catching the light, the vents, a glow from the clocks at night. */
  private drawDash(ctx: CanvasRenderingContext2D, w: number, h: number, night: number): void {
    const dash = ctx.createLinearGradient(0, DASH.top * h, 0, DASH.bottom * h);
    dash.addColorStop(0, mix('#4a4640', '#141312', night));
    dash.addColorStop(0.25, mix('#2c2a27', '#0b0a0a', night));
    dash.addColorStop(1, mix('#1c1b19', '#070707', night));
    ctx.fillStyle = dash;
    ctx.beginPath();
    ctx.moveTo(0, DASH.top * h + h * 0.06);
    ctx.quadraticCurveTo(w * 0.5, DASH.top * h - h * 0.025, w, DASH.top * h + h * 0.06);
    ctx.lineTo(w, DASH.bottom * h);
    ctx.lineTo(0, DASH.bottom * h);
    ctx.closePath();
    ctx.fill();
    // Two round vents and the clocks' glow behind the wheel, on the driver's side.
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    for (const x of [0.4, 0.6]) {
      ctx.beginPath();
      ctx.arc(x * w, DASH.top * h + h * 0.06, h * 0.018, 0, Math.PI * 2);
      ctx.fill();
    }
    if (night > 0.3) {
      const glow = ctx.createRadialGradient(w * 0.27, DASH.top * h + h * 0.04, 0, w * 0.27, DASH.top * h + h * 0.04, h * 0.12);
      glow.addColorStop(0, `rgba(120,200,255,${0.25 * night})`);
      glow.addColorStop(1, 'rgba(120,200,255,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, DASH.top * h - h * 0.1, w, h * 0.25);
    }
  }

  /** The two front seats from behind; the driver's head and shoulders over the left one, turning a little now and then. */
  private drawSeats(ctx: CanvasRenderingContext2D, w: number, h: number, f: TaxiFrame, night: number): void {
    const cloth = mix('#3c4048', '#121418', night);
    const clothLight = mix('#4c525c', '#1a1d22', night);
    const shoulder = rgb(this.jacket, 1 - night * 0.7);
    // The driver: shoulders first (behind the seat back's top), then the head.
    const turn = Math.sin(f.t * 0.7) * 0.5 + 0.5;
    const hx = w * 0.3 + turn * h * 0.01;
    const hy = h * 0.63;
    const hr = h * 0.085;
    ctx.fillStyle = shoulder;
    ctx.beginPath();
    ctx.ellipse(w * 0.3, h * 0.8, h * 0.27, h * 0.11, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = rgb(this.skin, 0.85 - night * 0.55);
    ctx.fillRect(hx - hr * 0.35, hy + hr * 0.5, hr * 0.7, hr * 0.8);
    // An ear each side, a touch of skin at the nape.
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(hx + side * hr * 0.95, hy + hr * 0.1, hr * 0.16, hr * 0.26, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = this.bald ? rgb(this.skin, 0.9 - night * 0.55) : rgb(this.hair, 1 - night * 0.6);
    ctx.beginPath();
    ctx.ellipse(hx, hy, hr * 0.95, hr * 1.05, 0, 0, Math.PI * 2);
    ctx.fill();
    if (!this.bald) {
      // The hairline at the nape, a little lighter where the lamp catches it.
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.beginPath();
      ctx.ellipse(hx - hr * 0.3, hy - hr * 0.45, hr * 0.4, hr * 0.25, -0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // The seat backs, the headrests on their posts: the driver's sits low, the head shows over it.
    for (const [x, rest] of [
      [0.3, 0.74],
      [0.7, 0.66],
    ] as const) {
      const cxs = x * w;
      ctx.fillStyle = cloth;
      roundRect(ctx, cxs - h * 0.22, h * 0.78, h * 0.44, h * 0.3, h * 0.05);
      ctx.fill();
      ctx.fillStyle = mix('#9a9a9a', '#3a3a3a', night);
      ctx.fillRect(cxs - h * 0.05, rest * h + h * 0.07, h * 0.008, h * 0.06);
      ctx.fillRect(cxs + h * 0.042, rest * h + h * 0.07, h * 0.008, h * 0.06);
      const pad = ctx.createLinearGradient(0, rest * h, 0, rest * h + h * 0.09);
      pad.addColorStop(0, clothLight);
      pad.addColorStop(1, cloth);
      ctx.fillStyle = pad;
      roundRect(ctx, cxs - h * 0.1, rest * h, h * 0.2, h * 0.085, h * 0.03);
      ctx.fill();
    }
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** `a` towards `b` by `k` (0..1), both `#rrggbb` or `hsl(...)` (an hsl `a` is taken as is when `k` is 0). */
function mix(a: string, b: string, k: number): string {
  if (k <= 0) return a;
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return k < 0.5 ? a : b;
  const c = pa.map((v, i) => Math.round(v + (pb[i]! - v) * Math.min(1, k)));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function parse(colour: string): number[] | null {
  if (colour.startsWith('#')) {
    const n = parseInt(colour.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = /^hsl\(([\d.]+), ([\d.]+)%, ([\d.]+)%\)$/.exec(colour);
  if (!m) return null;
  const hue = Number(m[1]) / 360;
  const s = Number(m[2]) / 100;
  const l = Number(m[3]) / 100;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const ch = (t: number): number => {
    const u = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    const v = u < 1 / 6 ? p + (q - p) * 6 * u : u < 1 / 2 ? q : u < 2 / 3 ? p + (q - p) * (2 / 3 - u) * 6 : p;
    return Math.round(v * 255);
  };
  return [ch(hue + 1 / 3), ch(hue), ch(hue - 1 / 3)];
}
