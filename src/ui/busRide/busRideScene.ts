import { mulberry32, type Rng } from '@/random';
import { clamp, lerp } from '@/math/scalar';

/*
 * THE VIEW FROM THE BUS SEAT (`BusRide`): drawn on a canvas, not built in 3D. The side window of a line 38 bus, the
 * town going past in three depths (the roofs far off, the facades across the road, the trees, lamps and parked cars
 * by the kerb), the light of the hour (sky, lit windows, the street lamps at night, the glass giving back the bus's
 * own strip lights), and around it the inside: the destination display over the window, the yellow pole with its
 * STOP button, the grab rail, the seat in front in its moquette. Everything in fractions of the canvas, so it fits
 * any screen; the town is drawn out of a seed, so a ride is the same each time it is played from the same seed.
 */

/** What a frame shows: the ride's state at that moment. */
interface RideFrame {
  /** Seconds since the ride began. */
  t: number;
  /** Metres travelled. */
  travelled: number;
  /** 0 at a stand .. 1 at cruising speed. */
  speed: number;
  /** The STOP button lit, the display saying so. */
  stopping: boolean;
  /** The light: 0 night .. 1 full day, and how much of a sunset or sunrise is in it (0..1). */
  daylight: number;
  dusk: number;
  /** What the display over the window reads (the line and where it goes). */
  board: string;
}

/** How many metres of the town a layer shows across the window's width, and where its ground is (fraction of the height). */
const LAYERS = {
  far: { span: 220, ground: 0.47 },
  mid: { span: 46, ground: 0.53 },
  near: { span: 14, ground: 0.7 },
} as const;
/** The window's opening (fractions of the canvas) and the pillar dividing it. */
const WINDOW = { left: 0.05, right: 0.95, top: 0.13, bottom: 0.62, radius: 0.025, pillar: 0.6, pillarWidth: 0.03 } as const;

interface Facade {
  x: number;
  width: number;
  /** Its roofline (fraction of the canvas height). */
  top: number;
  stone: string;
  floors: number;
  bays: number;
  shop: string | null;
  /** A side street after it: the far roofs show through. */
  gap: number;
  /** Which of its windows are lit at night (a seed per facade). */
  lights: number;
}

interface Kerbside {
  x: number;
  kind: 'tree' | 'lamp' | 'car' | 'bollard' | 'shelter';
  size: number;
  colour: string;
}

interface Roof {
  x: number;
  width: number;
  height: number;
  spire: boolean;
}

const STONES = ['#d9ccb2', '#cfc2a6', '#e1d6c0', '#c8b99c', '#d4c8b4', '#bfb39a'];
const AWNINGS = ['#8a2a2a', '#2a5a3a', '#2a3a6a', '#b07a2a', '#5a2a5a', '#3a3a3a'];
const CARS = ['#7a1f1f', '#2a3f5f', '#d8d4cc', '#3a3a3a', '#5f6f3a', '#9a9a9a', '#b58a2a'];

/** One layer of the town: items drawn out of a seed as the ride goes on, those gone past dropped. */
class Strip<T extends { x: number }> {
  readonly items: T[] = [];
  private next = 0;
  private readonly rng: Rng;

  constructor(seed: number, private readonly make: (rng: Rng, x: number) => { item: T; advance: number }) {
    this.rng = mulberry32(seed);
  }

  /** Items under [from, to] (metres along the road), made as needed. */
  span(from: number, to: number): T[] {
    while (this.next < to) {
      const { item, advance } = this.make(this.rng, this.next);
      this.items.push(item);
      this.next += advance;
    }
    while (this.items.length > 0 && this.items[0]!.x + 40 < from) this.items.shift();
    return this.items;
  }
}

const pick = <T>(rng: Rng, list: readonly T[]): T => list[Math.floor(rng() * list.length)] ?? list[0]!;

export class BusRideScene {
  private readonly facades: Strip<Facade>;
  private readonly kerb: Strip<Kerbside>;
  private readonly roofs: Strip<Roof>;
  private moquette: CanvasPattern | null = null;

  constructor(seed: number) {
    this.roofs = new Strip(seed + 1, (rng, x) => {
      const width = 8 + rng() * 22;
      return { item: { x, width, height: 0.04 + rng() * 0.09, spire: rng() < 0.06 }, advance: width + rng() * 4 };
    });
    this.facades = new Strip(seed + 2, (rng, x) => {
      const width = 9 + rng() * 9;
      const gap = rng() < 0.22 ? 6 + rng() * 8 : 0;
      const facade: Facade = { x, width, top: 0.17 + rng() * 0.12, stone: pick(rng, STONES), floors: 5 + Math.floor(rng() * 3), bays: Math.max(2, Math.round(width / 3.4)), shop: rng() < 0.7 ? pick(rng, AWNINGS) : null, gap, lights: Math.floor(rng() * 1e6) };
      return { item: facade, advance: width + gap };
    });
    this.kerb = new Strip(seed + 3, (rng, x) => {
      const r = rng();
      const kind: Kerbside['kind'] = r < 0.34 ? 'tree' : r < 0.52 ? 'lamp' : r < 0.82 ? 'car' : r < 0.95 ? 'bollard' : 'shelter';
      const size = kind === 'car' ? 4.2 : kind === 'shelter' ? 4 : 0.6 + rng() * 0.6;
      return { item: { x, kind, size, colour: pick(rng, CARS) }, advance: (kind === 'car' ? 4.8 : 2) + rng() * (kind === 'tree' ? 6 : 4) };
    });
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, f: RideFrame): void {
    const night = 1 - f.daylight;
    // The bus sways on its springs; the view outside bounces a little more than the inside.
    const sway = Math.sin(f.t * 1.7) * h * 0.003 * f.speed;
    const bounce = (Math.sin(f.t * 2.3 + 1) + Math.sin(f.t * 5.1) * 0.3) * h * 0.004 * f.speed;
    ctx.save();
    ctx.clearRect(0, 0, w, h);
    ctx.translate(0, sway);

    // Outside, through the window's opening.
    ctx.save();
    roundedPath(ctx, WINDOW.left * w, WINDOW.top * h, (WINDOW.right - WINDOW.left) * w, (WINDOW.bottom - WINDOW.top) * h, WINDOW.radius * w);
    ctx.clip();
    ctx.translate(0, bounce);
    this.drawSky(ctx, w, h, f);
    this.drawRoofs(ctx, w, h, f, night);
    this.drawFacades(ctx, w, h, f, night);
    this.drawRoad(ctx, w, h, night);
    this.drawKerb(ctx, w, h, f, night);
    ctx.translate(0, -bounce);
    this.drawGlass(ctx, w, h, night);
    ctx.restore();

    this.drawInside(ctx, w, h, f, night);
    ctx.restore();
    // The corners darker, like an eye in a dim bus.
    const vignette = ctx.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, h * 0.95);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, `rgba(0,0,0,${0.35 + 0.2 * night})`);
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);
  }

  private drawSky(ctx: CanvasRenderingContext2D, w: number, h: number, f: RideFrame): void {
    const top = mix(mix('#0c1428', '#6fa6dc', f.daylight), '#3a4677', f.dusk * 0.6);
    const low = mix(mix('#25304c', '#dbe8f2', f.daylight), '#f0a46a', f.dusk * 0.8);
    const sky = ctx.createLinearGradient(0, WINDOW.top * h, 0, LAYERS.far.ground * h);
    sky.addColorStop(0, top);
    sky.addColorStop(1, low);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
  }

  private drawRoofs(ctx: CanvasRenderingContext2D, w: number, h: number, f: RideFrame, night: number): void {
    const { span, ground } = LAYERS.far;
    const scale = w / span;
    const from = f.travelled * 0.97;
    ctx.fillStyle = mix(mix('#2a3148', '#9fb0c4', f.daylight), '#b07a70', f.dusk * 0.4);
    for (const roof of this.roofs.span(from - 30, from + span + 30)) {
      const x = (roof.x - from) * scale;
      const top = (ground - roof.height) * h;
      ctx.fillRect(x, top, roof.width * scale + 1, ground * h - top + 2);
      // Chimney pots along the roofline, a spire now and then.
      ctx.fillRect(x + roof.width * scale * 0.2, top - h * 0.012, w * 0.004, h * 0.012);
      ctx.fillRect(x + roof.width * scale * 0.7, top - h * 0.01, w * 0.005, h * 0.01);
      if (roof.spire) {
        ctx.beginPath();
        ctx.moveTo(x + roof.width * scale * 0.45, top);
        ctx.lineTo(x + roof.width * scale * 0.5, top - h * 0.09);
        ctx.lineTo(x + roof.width * scale * 0.55, top);
        ctx.fill();
      }
    }
    if (night > 0.4) {
      ctx.fillStyle = `rgba(255,214,140,${(night - 0.4) * 0.8})`;
      for (const roof of this.roofs.items) {
        const x = (roof.x - from) * scale;
        for (let i = 0; i < 3; i++) ctx.fillRect(x + ((roof.x * 7 + i * 13) % roof.width) * scale, (ground - roof.height * 0.5) * h + i * 3, 2, 2);
      }
    }
  }

  private drawFacades(ctx: CanvasRenderingContext2D, w: number, h: number, f: RideFrame, night: number): void {
    const { span, ground } = LAYERS.mid;
    const scale = w / span;
    const from = f.travelled * 0.75;
    const base = ground * h;
    for (const facade of this.facades.span(from - 20, from + span + 20)) {
      const x = (facade.x - from) * scale;
      const width = facade.width * scale;
      const top = facade.top * h;
      if (x > w || x + width < 0) continue;
      // The stone, darker at night, warmer at dusk; the mansard roof over it.
      ctx.fillStyle = mix(mix(facade.stone, '#262a36', night * 0.8), '#e09060', f.dusk * 0.25);
      ctx.fillRect(x, top, width + 1, base - top);
      ctx.fillStyle = mix(mix('#5a6270', '#1a1e28', night), '#7a5a5a', f.dusk * 0.3);
      ctx.beginPath();
      ctx.moveTo(x - 2, top);
      ctx.lineTo(x + width * 0.04, top - h * 0.04);
      ctx.lineTo(x + width * 0.96, top - h * 0.04);
      ctx.lineTo(x + width + 2, top);
      ctx.fill();
      // The floors' windows, the shop on the ground floor under its awning.
      const shopHeight = facade.shop ? (base - top) * 0.2 : 0;
      const floorHeight = (base - top - shopHeight) / facade.floors;
      const bay = width / facade.bays;
      for (let floor = 0; floor < facade.floors; floor++) {
        for (let b = 0; b < facade.bays; b++) {
          const wx = x + b * bay + bay * 0.28;
          const wy = top + floor * floorHeight + floorHeight * 0.22;
          const lit = night > 0.3 && ((facade.lights >> ((floor * facade.bays + b) % 20)) & 1) === 1;
          ctx.fillStyle = lit ? `rgba(255,${200 + ((floor * 7 + b * 3) % 40)},130,${0.5 + night * 0.5})` : mix(mix('#4a5568', '#0e1220', night), '#8aa0b8', f.daylight * 0.35);
          ctx.fillRect(wx, wy, bay * 0.44, floorHeight * 0.58);
          // A balcony rail on the second floor, as Haussmann wanted.
          if (floor === 1) {
            ctx.fillStyle = 'rgba(20,20,24,0.65)';
            ctx.fillRect(wx - bay * 0.06, wy + floorHeight * 0.48, bay * 0.56, floorHeight * 0.06);
          }
        }
      }
      if (facade.shop) {
        const shopTop = base - shopHeight;
        ctx.fillStyle = night > 0.4 ? `rgba(255,220,160,${0.4 + night * 0.4})` : mix('#2a3038', '#6a7a88', f.daylight * 0.5);
        ctx.fillRect(x + width * 0.08, shopTop + shopHeight * 0.3, width * 0.84, shopHeight * 0.7);
        ctx.fillStyle = mix(facade.shop, '#101010', night * 0.6);
        ctx.fillRect(x + width * 0.05, shopTop, width * 0.9, shopHeight * 0.3);
      }
    }
  }

  private drawRoad(ctx: CanvasRenderingContext2D, w: number, h: number, night: number): void {
    // The far pavement, then the carriageway up to the near kerb.
    const far = LAYERS.mid.ground * h;
    ctx.fillStyle = mix('#a8a294', '#2a2a30', night * 0.85);
    ctx.fillRect(0, far, w, h * 0.012);
    const road = ctx.createLinearGradient(0, far + h * 0.012, 0, LAYERS.near.ground * h);
    road.addColorStop(0, mix('#6a6a70', '#16161c', night * 0.9));
    road.addColorStop(1, mix('#4a4a50', '#0e0e12', night * 0.9));
    ctx.fillStyle = road;
    ctx.fillRect(0, far + h * 0.012, w, LAYERS.near.ground * h - far);
  }

  private drawKerb(ctx: CanvasRenderingContext2D, w: number, h: number, f: RideFrame, night: number): void {
    const { span, ground } = LAYERS.near;
    const scale = w / span;
    const from = f.travelled;
    const base = ground * h;
    // At speed the nearest things smear: drawn twice, the second a ghost behind.
    const smear = f.speed * w * 0.012;
    for (const pass of smear > 2 ? [1, 0] : [0]) {
      ctx.globalAlpha = pass === 1 ? 0.3 : 1;
      const shift = pass === 1 ? smear : 0;
      for (const item of this.kerb.span(from - 10, from + span + 10)) {
        const x = (item.x - from) * scale + shift;
        if (x > w + 200 || x < -300) continue;
        this.drawKerbItem(ctx, item, x, base, scale, h, night);
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawKerbItem(ctx: CanvasRenderingContext2D, item: Kerbside, x: number, base: number, scale: number, h: number, night: number): void {
    const dark = (colour: string) => mix(colour, '#05060a', night * 0.8);
    switch (item.kind) {
      case 'tree': {
        ctx.fillStyle = dark('#3a2c22');
        ctx.fillRect(x - scale * 0.12, base - h * 0.55, scale * 0.24, h * 0.55);
        ctx.fillStyle = dark('#4c6a34');
        for (const [dx, dy, r] of [[0, -0.62, 1.4], [-0.9, -0.5, 1], [0.9, -0.52, 1.1]] as const) {
          ctx.beginPath();
          ctx.arc(x + dx * scale, base + dy * h, r * scale * item.size, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'lamp': {
        ctx.fillStyle = dark('#2a2e30');
        ctx.fillRect(x - scale * 0.05, base - h * 0.6, scale * 0.1, h * 0.6);
        ctx.fillRect(x - scale * 0.05, base - h * 0.6, scale * 0.6, h * 0.012);
        if (night > 0.3) {
          const glow = ctx.createRadialGradient(x + scale * 0.5, base - h * 0.58, 0, x + scale * 0.5, base - h * 0.58, scale * 1.6);
          glow.addColorStop(0, `rgba(255,220,150,${night * 0.9})`);
          glow.addColorStop(1, 'rgba(255,220,150,0)');
          ctx.fillStyle = glow;
          ctx.fillRect(x - scale * 1.2, base - h * 0.58 - scale * 1.6, scale * 3.4, scale * 3.2);
        }
        break;
      }
      case 'car': {
        const len = item.size * scale;
        ctx.fillStyle = dark(item.colour);
        roundedPath(ctx, x, base - h * 0.16, len, h * 0.12, h * 0.02);
        ctx.fill();
        roundedPath(ctx, x + len * 0.2, base - h * 0.24, len * 0.55, h * 0.1, h * 0.03);
        ctx.fill();
        ctx.fillStyle = night > 0.5 ? 'rgba(40,50,70,0.9)' : 'rgba(150,180,200,0.75)';
        ctx.fillRect(x + len * 0.25, base - h * 0.225, len * 0.2, h * 0.065);
        ctx.fillRect(x + len * 0.5, base - h * 0.225, len * 0.2, h * 0.065);
        break;
      }
      case 'bollard':
        ctx.fillStyle = dark('#2a3a2a');
        ctx.fillRect(x, base - h * 0.12, scale * 0.14, h * 0.12);
        break;
      case 'shelter':
        ctx.fillStyle = dark('#3a3e44');
        ctx.fillRect(x, base - h * 0.48, scale * 0.08, h * 0.48);
        ctx.fillRect(x + item.size * scale, base - h * 0.48, scale * 0.08, h * 0.48);
        ctx.fillRect(x, base - h * 0.5, item.size * scale + scale * 0.08, h * 0.03);
        ctx.fillStyle = `rgba(190,215,225,${0.18 + night * 0.12})`;
        ctx.fillRect(x, base - h * 0.47, item.size * scale, h * 0.4);
        break;
    }
  }

  /** The glass: a sheen by day; at night the bus's own strip lights given back over the dark street. */
  private drawGlass(ctx: CanvasRenderingContext2D, w: number, h: number, night: number): void {
    const top = WINDOW.top * h;
    const bottom = WINDOW.bottom * h;
    const sheen = ctx.createLinearGradient(0, top, w * 0.4, bottom);
    sheen.addColorStop(0, `rgba(255,255,255,${0.06 + 0.04 * (1 - night)})`);
    sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
    sheen.addColorStop(1, 'rgba(255,255,255,0.03)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, top, w, bottom - top);
    if (night > 0.3) {
      ctx.fillStyle = `rgba(230,240,255,${(night - 0.3) * 0.35})`;
      ctx.fillRect(w * 0.1, top + (bottom - top) * 0.08, w * 0.8, h * 0.008);
      ctx.fillStyle = `rgba(200,195,180,${(night - 0.3) * 0.18})`;
      ctx.fillRect(0, top + (bottom - top) * 0.62, w, (bottom - top) * 0.38);
    }
  }

  private drawInside(ctx: CanvasRenderingContext2D, w: number, h: number, f: RideFrame, night: number): void {
    // The panels round the window: warm grey plastic, lit by the strip lights at night.
    const wall = mix('#c4beb0', '#9a968c', night * 0.5);
    ctx.fillStyle = wall;
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    roundedRect(ctx, WINDOW.left * w, WINDOW.top * h, (WINDOW.right - WINDOW.left) * w, (WINDOW.bottom - WINDOW.top) * h, WINDOW.radius * w);
    ctx.fill('evenodd');
    // The rubber seal round the glass and the pillar between the two panes.
    ctx.strokeStyle = '#2a2a2c';
    ctx.lineWidth = Math.max(2, w * 0.004);
    roundedPath(ctx, WINDOW.left * w, WINDOW.top * h, (WINDOW.right - WINDOW.left) * w, (WINDOW.bottom - WINDOW.top) * h, WINDOW.radius * w);
    ctx.stroke();
    ctx.fillStyle = mix('#a8a296', '#7a766c', night * 0.5);
    ctx.fillRect((WINDOW.pillar - WINDOW.pillarWidth / 2) * w, WINDOW.top * h, WINDOW.pillarWidth * w, (WINDOW.bottom - WINDOW.top) * h);
    // The ceiling's shade at the top, the floor's dark at the bottom.
    const shade = ctx.createLinearGradient(0, 0, 0, h);
    shade.addColorStop(0, 'rgba(0,0,0,0.28)');
    shade.addColorStop(0.12, 'rgba(0,0,0,0)');
    shade.addColorStop(0.8, 'rgba(0,0,0,0)');
    shade.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, w, h);

    this.drawDisplay(ctx, w, h, f);

    // The grab rail under the window, chrome.
    const railY = h * 0.665;
    const rail = ctx.createLinearGradient(0, railY - h * 0.01, 0, railY + h * 0.01);
    rail.addColorStop(0, '#f2f2f2');
    rail.addColorStop(0.5, '#8a8c90');
    rail.addColorStop(1, '#3a3c40');
    ctx.fillStyle = rail;
    ctx.fillRect(0, railY - h * 0.01, w, h * 0.02);

    // The yellow pole by the door, its STOP button lit once someone has pressed it.
    const poleX = w * 0.86;
    const pole = ctx.createLinearGradient(poleX - w * 0.012, 0, poleX + w * 0.012, 0);
    pole.addColorStop(0, '#8a6a10');
    pole.addColorStop(0.4, '#f2c624');
    pole.addColorStop(1, '#6a5008');
    ctx.fillStyle = pole;
    ctx.fillRect(poleX - w * 0.012, 0, w * 0.024, h);
    const buttonY = h * 0.74;
    ctx.fillStyle = '#d8d4c8';
    roundedPath(ctx, poleX - w * 0.022, buttonY - h * 0.045, w * 0.044, h * 0.09, w * 0.008);
    ctx.fill();
    const lit = f.stopping && Math.floor(f.t * 2) % 2 === 0;
    ctx.fillStyle = f.stopping ? '#ff3a2a' : '#a8221a';
    ctx.beginPath();
    ctx.arc(poleX, buttonY, w * 0.013, 0, Math.PI * 2);
    ctx.fill();
    if (lit) {
      const glow = ctx.createRadialGradient(poleX, buttonY, 0, poleX, buttonY, w * 0.04);
      glow.addColorStop(0, 'rgba(255,80,50,0.6)');
      glow.addColorStop(1, 'rgba(255,80,50,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(poleX - w * 0.04, buttonY - w * 0.04, w * 0.08, w * 0.08);
    }
    ctx.fillStyle = '#2a2a2a';
    ctx.font = `600 ${Math.round(h * 0.014)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('STOP', poleX, buttonY + h * 0.036);

    // The seat in front, its back in the bus company's moquette.
    ctx.fillStyle = this.moquettePattern(ctx) ?? '#2a2e5a';
    ctx.beginPath();
    ctx.moveTo(-w * 0.02, h * 1.02);
    ctx.lineTo(-w * 0.02, h * 0.8);
    ctx.quadraticCurveTo(w * 0.0, h * 0.72, w * 0.08, h * 0.71);
    ctx.lineTo(w * 0.42, h * 0.71);
    ctx.quadraticCurveTo(w * 0.5, h * 0.72, w * 0.5, h * 0.8);
    ctx.lineTo(w * 0.5, h * 1.02);
    ctx.fill();
    // Its grab handle on top, and the shade the strip lights leave under it.
    ctx.fillStyle = '#c8c8c4';
    roundedPath(ctx, w * 0.18, h * 0.69, w * 0.14, h * 0.025, h * 0.012);
    ctx.fill();
    const seatShade = ctx.createLinearGradient(0, h * 0.71, 0, h);
    seatShade.addColorStop(0, 'rgba(0,0,0,0)');
    seatShade.addColorStop(1, `rgba(0,0,0,${0.35 + night * 0.2})`);
    ctx.fillStyle = seatShade;
    ctx.fillRect(0, h * 0.71, w * 0.52, h * 0.3);
  }

  /** The display over the window: amber dots on black, the line and the stop, "STOP REQUESTED" once asked. */
  private drawDisplay(ctx: CanvasRenderingContext2D, w: number, h: number, f: RideFrame): void {
    const bw = w * 0.42;
    const bh = h * 0.07;
    const x = (w - bw) / 2;
    const y = h * 0.03;
    ctx.fillStyle = '#121212';
    roundedPath(ctx, x, y, bw, bh, h * 0.008);
    ctx.fill();
    const text = f.stopping && Math.floor(f.t / 1.5) % 2 === 1 ? 'STOP REQUESTED' : f.board;
    ctx.save();
    ctx.font = `700 ${Math.round(bh * 0.5)}px ui-monospace, "Courier New", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(255,170,40,0.8)';
    ctx.shadowBlur = bh * 0.25;
    ctx.fillStyle = f.stopping && text !== f.board ? '#ff5a3a' : '#ffb028';
    ctx.fillText(text, w / 2, y + bh / 2 + 1, bw * 0.92);
    ctx.restore();
    // The dot grid over it: the letters read as a matrix of lamps.
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    const pitch = Math.max(3, bh / 11);
    for (let gx = x; gx < x + bw; gx += pitch) ctx.fillRect(gx, y, 1, bh);
    for (let gy = y; gy < y + bh; gy += pitch) ctx.fillRect(x, gy, bw, 1);
  }

  /** Bus moquette: navy, with the company's confetti of little coloured dashes. */
  private moquettePattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
    if (this.moquette) return this.moquette;
    const tile = document.createElement('canvas');
    tile.width = tile.height = 48;
    const t = tile.getContext('2d');
    if (!t) return null;
    t.fillStyle = '#23285a';
    t.fillRect(0, 0, 48, 48);
    const rng = mulberry32(38);
    for (let i = 0; i < 26; i++) {
      t.fillStyle = pick(rng, ['#e2662a', '#2ab0a0', '#c43a7a', '#f2c624', '#5a6ad8']);
      t.save();
      t.translate(rng() * 48, rng() * 48);
      t.rotate(rng() * Math.PI);
      t.fillRect(-3, -1, 6, 2);
      t.restore();
    }
    this.moquette = ctx.createPattern(tile, 'repeat');
    return this.moquette;
  }
}

/** A new path: one rounded rectangle. */
function roundedPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  roundedRect(ctx, x, y, w, h, r);
}

/** A rounded rectangle added to the path being built. */
function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** `a` towards `b` by `k` (0..1), two #rrggbb colours. */
function mix(a: string, b: string, k: number): string {
  const t = clamp(k, 0, 1);
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const channel = (shift: number) => Math.round(lerp((pa >> shift) & 255, (pb >> shift) & 255, t));
  return `#${((channel(16) << 16) | (channel(8) << 8) | channel(0)).toString(16).padStart(6, '0')}`;
}
